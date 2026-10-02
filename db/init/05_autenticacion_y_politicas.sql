-- =====================================================================
-- Autenticación (contraseña + segundo factor TOTP) y políticas de la empresa.
-- - Las contraseñas se guardan con bcrypt (pgcrypto); la API nunca puede leer el hash.
-- - El segundo factor se verifica DENTRO de la base: la API nunca ve el secreto TOTP
--   después de que el usuario lo carga en su app autenticadora.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE app.usuarios
  ADD COLUMN password_hash     text,
  ADD COLUMN totp_secreto      bytea,
  ADD COLUMN totp_pendiente    bytea,    -- secreto generado pero todavía no confirmado
  ADD COLUMN totp_ultimo_paso  bigint;   -- evita reusar el mismo código dos veces

-- La API puede leer los datos del usuario, pero NO las columnas de credenciales.
REVOKE SELECT ON app.usuarios FROM securedata_api;
GRANT SELECT (id, organizacion_id, area_id, email, nombre, rol, mfa_activo, activo, creado_en) ON app.usuarios TO securedata_api;

-- Código TOTP de 6 dígitos (RFC 6238, HMAC-SHA1, pasos de 30 segundos).
CREATE FUNCTION app.totp_codigo(p_secreto bytea, p_paso bigint) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  h bytea := hmac(int8send(p_paso), p_secreto, 'sha1');
  o integer := get_byte(h, 19) & 15;
  bin bigint;
BEGIN
  bin := ((get_byte(h, o) & 127)::bigint << 24) | (get_byte(h, o + 1)::bigint << 16) | (get_byte(h, o + 2)::bigint << 8) | get_byte(h, o + 3)::bigint;
  RETURN lpad((bin % 1000000)::text, 6, '0');
END $$;

-- Verifica un código contra un secreto (acepta el paso anterior y el siguiente por desfasajes de reloj).
CREATE FUNCTION app.totp_valido(p_secreto bytea, p_codigo text, p_ultimo bigint) RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE paso bigint := floor(extract(epoch FROM now()) / 30); d integer;
BEGIN
  IF p_secreto IS NULL OR p_codigo !~ '^\d{6}$' THEN RETURN NULL; END IF;
  FOREACH d IN ARRAY ARRAY[0, -1, 1] LOOP
    IF (p_ultimo IS NULL OR paso + d > p_ultimo) AND app.totp_codigo(p_secreto, paso + d) = p_codigo THEN
      RETURN paso + d;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

/*
 * Login con email y contraseña. Devuelve el usuario si es correcto y si le falta el segundo factor.
 * Si es incorrecto no dice si el email existe o no.
 */
CREATE FUNCTION app.autenticar(p_email text, p_password text)
RETURNS TABLE (usuario_id uuid, rol app.rol, requiere_2fa boolean, debe_configurar_2fa boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
DECLARE u app.usuarios;
BEGIN
  SELECT * INTO u FROM app.usuarios WHERE email = p_email AND activo;
  IF NOT FOUND OR u.password_hash IS NULL OR u.password_hash <> crypt(p_password, u.password_hash) THEN
    -- Mismo costo de cálculo que un login válido, para no revelar qué emails existen.
    PERFORM crypt(p_password, gen_salt('bf', 8));
    INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, 'login_fallido');
    RETURN;
  END IF;
  INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, 'login');
  RETURN QUERY SELECT u.id, u.rol, u.mfa_activo, (u.rol IN ('responsable', 'admin') AND NOT u.mfa_activo);
END $$;

-- Segundo paso del login: verifica el código de la app autenticadora.
CREATE FUNCTION app.verificar_totp(p_usuario_id uuid, p_codigo text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
DECLARE u app.usuarios; paso bigint;
BEGIN
  SELECT * INTO u FROM app.usuarios WHERE id = p_usuario_id AND activo AND mfa_activo;
  IF NOT FOUND THEN RETURN false; END IF;
  paso := app.totp_valido(u.totp_secreto, p_codigo, u.totp_ultimo_paso);
  IF paso IS NULL THEN
    INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, '2fa_fallido');
    RETURN false;
  END IF;
  UPDATE app.usuarios SET totp_ultimo_paso = paso WHERE id = u.id;
  RETURN true;
END $$;

-- Alta del segundo factor (requiere sesión con contraseña): genera un secreto y lo devuelve UNA vez para el QR.
CREATE FUNCTION app.totp_iniciar() RETURNS bytea
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
DECLARE u app.usuarios := app.usuario_actual(); s bytea := gen_random_bytes(20);
BEGIN
  IF u.mfa_activo THEN RAISE EXCEPTION 'el segundo factor ya está configurado'; END IF;
  UPDATE app.usuarios SET totp_pendiente = s WHERE id = u.id;
  RETURN s;
END $$;

CREATE FUNCTION app.totp_confirmar(p_codigo text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public, pg_temp AS $$
DECLARE u app.usuarios := app.usuario_actual(); paso bigint;
BEGIN
  SELECT * INTO u FROM app.usuarios WHERE id = u.id;
  paso := app.totp_valido(u.totp_pendiente, p_codigo, NULL);
  IF paso IS NULL THEN RETURN false; END IF;
  UPDATE app.usuarios SET totp_secreto = totp_pendiente, totp_pendiente = NULL, mfa_activo = true, totp_ultimo_paso = paso WHERE id = u.id;
  INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, '2fa_activado');
  RETURN true;
END $$;

-- ---------------------------------------------------------------------
-- Políticas de la empresa: qué hacer con cada tipo de dato.
-- La app del empleado las aplica automáticamente (el empleado no tiene que decidir).
-- ---------------------------------------------------------------------
CREATE TABLE app.politicas (
  organizacion_id uuid NOT NULL REFERENCES app.organizaciones (id) ON DELETE CASCADE,
  tipo            app.tipo_dato NOT NULL,
  accion          app.accion NOT NULL,
  PRIMARY KEY (organizacion_id, tipo)
);
ALTER TABLE app.politicas ENABLE ROW LEVEL SECURITY;

-- Política de la organización del usuario: {"CREDENCIAL": "eliminar", ...}
CREATE FUNCTION app.mi_politica() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(tipo, accion), '{}')
  FROM app.politicas WHERE organizacion_id = (app.usuario_actual()).organizacion_id
$$;

CREATE FUNCTION app.admin_definir_politica(p_tipo app.tipo_dato, p_accion app.accion) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin();
BEGIN
  INSERT INTO app.politicas (organizacion_id, tipo, accion) VALUES (u.organizacion_id, p_tipo, p_accion)
  ON CONFLICT (organizacion_id, tipo) DO UPDATE SET accion = excluded.accion;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'admin_definir_politica', jsonb_build_object('tipo', p_tipo, 'accion', p_accion));
END $$;

REVOKE ALL ON FUNCTION app.totp_codigo(bytea, bigint), app.totp_valido(bytea, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.autenticar(text, text),
  app.verificar_totp(uuid, text),
  app.totp_iniciar(),
  app.totp_confirmar(text),
  app.mi_politica(),
  app.admin_definir_politica(app.tipo_dato, app.accion)
TO securedata_api;

-- ---------------------------------------------------------------------
-- Datos de DEMO: contraseña "demo1234" para todos. Secreto TOTP conocido para los que tienen 2FA,
-- así se puede probar sin celular: npm run db:totp -- seguridad@demo.test
-- ---------------------------------------------------------------------
UPDATE app.usuarios SET password_hash = crypt('demo1234', gen_salt('bf', 8));
UPDATE app.usuarios SET totp_secreto = convert_to('securedata-demo-totp', 'UTF8') WHERE mfa_activo;

INSERT INTO app.politicas (organizacion_id, tipo, accion) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'CREDENCIAL', 'eliminar'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TARJETA', 'eliminar'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'DATO_SENSIBLE', 'eliminar'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'SALARIO', 'anonimizar');
