-- =====================================================================
-- Supervisor y empleados.
-- El supervisor (rol responsable o admin, con segundo factor) administra a los empleados de su
-- empresa: los da de alta con una contraseña temporal, los cambia de área o los desactiva, define
-- la política y abre incidentes sobre eventos de riesgo.
-- Sobre la actividad solo ve totales por área: los eventos de riesgo se listan SIN el empleado,
-- con fecha (sin hora) y con el área agrupada en "Otras áreas" si tiene pocas personas.
-- =====================================================================

-- El empleado tiene que cambiar la contraseña temporal la primera vez que entra.
ALTER TABLE app.usuarios ADD COLUMN debe_cambiar_password boolean NOT NULL DEFAULT false;
GRANT SELECT (debe_cambiar_password) ON app.usuarios TO securedata_api;

-- Un incidente por evento.
CREATE UNIQUE INDEX incidentes_evento_unico ON app.incidentes (evento_id) WHERE evento_id IS NOT NULL;

-- Contraseña temporal legible: 12 caracteres sin los que se confunden (0/O, 1/l/I).
CREATE FUNCTION app.password_temporal() RETURNS text
LANGUAGE sql VOLATILE SET search_path = app, extensions, pg_temp AS $$
  SELECT string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + (get_byte(b, i) % 31), 1), '' ORDER BY i)
  FROM (SELECT gen_random_bytes(12) AS b) r, generate_series(0, 11) AS i
$$;

-- El login también avisa si hay que cambiar la contraseña (cambia el tipo de resultado: se recrea).
DROP FUNCTION app.autenticar(text, text);
CREATE FUNCTION app.autenticar(p_email text, p_password text)
RETURNS TABLE (usuario_id uuid, rol app.rol, requiere_2fa boolean, debe_configurar_2fa boolean, debe_cambiar_password boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios;
BEGIN
  -- Cast explícito: `citext = text` compara como text y distinguiría mayúsculas.
  SELECT * INTO u FROM app.usuarios WHERE email = p_email::extensions.citext AND activo;
  IF NOT FOUND OR u.password_hash IS NULL OR u.password_hash <> crypt(p_password, u.password_hash) THEN
    -- Mismo costo de cálculo que un login válido, para no revelar qué emails existen.
    PERFORM crypt(p_password, gen_salt('bf', 8));
    INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, 'login_fallido');
    RETURN;
  END IF;
  INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, 'login');
  RETURN QUERY SELECT u.id, u.rol, u.mfa_activo, (u.rol IN ('responsable', 'admin') AND NOT u.mfa_activo), u.debe_cambiar_password;
END $$;

-- El usuario cambia su propia contraseña (la temporal o la que tenga).
CREATE FUNCTION app.cambiar_password(p_actual text, p_nueva text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.usuario_actual();
BEGIN
  IF length(p_nueva) < 10 OR length(p_nueva) > 200 THEN
    RAISE EXCEPTION 'la contraseña nueva tiene que tener entre 10 y 200 caracteres';
  END IF;
  IF u.password_hash IS NULL OR u.password_hash <> crypt(p_actual, u.password_hash) THEN
    INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, 'cambiar_password_fallido');
    RETURN false;
  END IF;
  IF p_nueva = p_actual THEN RAISE EXCEPTION 'la contraseña nueva tiene que ser distinta'; END IF;
  UPDATE app.usuarios SET password_hash = crypt(p_nueva, gen_salt('bf', 10)), debe_cambiar_password = false WHERE id = u.id;
  INSERT INTO app.auditoria (usuario_id, accion) VALUES (u.id, 'cambiar_password');
  RETURN true;
END $$;

-- ---------------------------------------------------------------------
-- Empleados (los administra el supervisor; solo el rol empleado)
-- ---------------------------------------------------------------------

CREATE FUNCTION app.supervisor_empleados()
RETURNS TABLE (id uuid, nombre text, email text, area_id uuid, area text, activo boolean, pendiente_de_ingreso boolean, creado_en timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable();
BEGIN
  RETURN QUERY
  SELECT e.id, e.nombre, e.email::text, e.area_id, a.nombre, e.activo, e.debe_cambiar_password, e.creado_en
  FROM app.usuarios e LEFT JOIN app.areas a ON a.id = e.area_id
  WHERE e.organizacion_id = u.organizacion_id AND e.rol = 'empleado'
  ORDER BY e.activo DESC, e.nombre;
END $$;

-- Alta de un empleado. Devuelve la contraseña temporal UNA vez (el supervisor se la pasa al empleado).
CREATE FUNCTION app.supervisor_crear_empleado(p_email text, p_nombre text, p_area_id uuid)
RETURNS TABLE (id uuid, password_temporal text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable(); nuevo uuid; temporal text := app.password_temporal();
BEGIN
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email inválido'; END IF;
  -- El área tiene que ser de la misma empresa (también lo exige la clave foránea compuesta).
  INSERT INTO app.usuarios (organizacion_id, area_id, email, nombre, rol, password_hash, debe_cambiar_password)
  VALUES (u.organizacion_id, p_area_id, lower(trim(p_email)), trim(p_nombre), 'empleado', crypt(temporal, gen_salt('bf', 10)), true)
  RETURNING usuarios.id INTO nuevo;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'supervisor_crear_empleado', jsonb_build_object('usuario', nuevo));
  RETURN QUERY SELECT nuevo, temporal;
END $$;

-- Cambio de área y alta/baja. Desactivado no puede entrar, pero sus eventos siguen en los totales.
CREATE FUNCTION app.supervisor_actualizar_empleado(p_id uuid, p_area_id uuid, p_activo boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable();
BEGIN
  UPDATE app.usuarios SET area_id = p_area_id, activo = p_activo
  WHERE id = p_id AND organizacion_id = u.organizacion_id AND rol = 'empleado';
  IF NOT FOUND THEN RAISE EXCEPTION 'empleado inexistente'; END IF;
  INSERT INTO app.auditoria (usuario_id, accion, detalle)
  VALUES (u.id, 'supervisor_actualizar_empleado', jsonb_build_object('usuario', p_id, 'area', p_area_id, 'activo', p_activo));
END $$;

-- Nueva contraseña temporal (el empleado se olvidó la suya). Devuelve la temporal UNA vez.
CREATE FUNCTION app.supervisor_reiniciar_password(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable(); temporal text := app.password_temporal();
BEGIN
  UPDATE app.usuarios SET password_hash = crypt(temporal, gen_salt('bf', 10)), debe_cambiar_password = true
  WHERE id = p_id AND organizacion_id = u.organizacion_id AND rol = 'empleado' AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'empleado inexistente'; END IF;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'supervisor_reiniciar_password', jsonb_build_object('usuario', p_id));
  RETURN temporal;
END $$;

-- ---------------------------------------------------------------------
-- Política de la empresa (antes solo el admin)
-- ---------------------------------------------------------------------

-- p_accion NULL: el tipo vuelve a la acción recomendada por DataGuard.
CREATE FUNCTION app.supervisor_definir_politica(p_tipo app.tipo_dato, p_accion app.accion) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable();
BEGIN
  IF p_accion IS NULL THEN
    DELETE FROM app.politicas WHERE organizacion_id = u.organizacion_id AND tipo = p_tipo;
  ELSE
    INSERT INTO app.politicas (organizacion_id, tipo, accion) VALUES (u.organizacion_id, p_tipo, p_accion)
    ON CONFLICT (organizacion_id, tipo) DO UPDATE SET accion = excluded.accion;
  END IF;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'supervisor_definir_politica', jsonb_build_object('tipo', p_tipo, 'accion', p_accion));
END $$;

-- ---------------------------------------------------------------------
-- Eventos de riesgo e incidentes (sin identificar al empleado)
-- ---------------------------------------------------------------------

/*
 * Avisos de la extensión que el empleado ignoró (mandó los datos sin proteger a una IA externa).
 * Sin usuario ni hora: fecha, área (o "Otras áreas" si tiene menos personas activas que el mínimo),
 * sitio, tipos de dato y cantidad. Incluye el incidente, si se abrió uno. Máximo 200, los más nuevos.
 */
CREATE FUNCTION app.panel_eventos_riesgo(p_desde date, p_hasta date)
RETURNS TABLE (evento_id bigint, fecha date, area text, sitio text, tipo_entrada app.tipo_entrada, tipos app.tipo_dato[], detecciones bigint,
               incidente_id bigint, incidente_estado app.estado_incidente)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable(); k integer;
BEGIN
  IF p_hasta < p_desde OR p_hasta - p_desde > 731 THEN
    RAISE EXCEPTION 'rango de fechas inválido (máximo 2 años)';
  END IF;
  SELECT minimo_por_grupo INTO k FROM app.organizaciones WHERE id = u.organizacion_id;
  INSERT INTO app.auditoria (usuario_id, accion, detalle)
  VALUES (u.id, 'panel_eventos_riesgo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta));

  RETURN QUERY
  SELECT e.id, e.creado_en::date,
         -- Sin área también va a "Otras áreas": pueden ser muy pocas personas.
         CASE WHEN (SELECT count(*) FROM app.usuarios x WHERE x.area_id = a.id AND x.activo) >= k THEN a.nombre
              ELSE 'Otras áreas' END,
         e.sitio, e.tipo_entrada,
         coalesce((SELECT array_agg(DISTINCT d.tipo ORDER BY d.tipo) FROM app.detecciones d WHERE d.evento_id = e.id), '{}'),
         coalesce((SELECT sum(d.cantidad) FROM app.detecciones d WHERE d.evento_id = e.id), 0)::bigint,
         i.id, i.estado
  FROM app.eventos e
  LEFT JOIN app.areas a ON a.id = e.area_id
  LEFT JOIN app.incidentes i ON i.evento_id = e.id
  WHERE e.organizacion_id = u.organizacion_id AND e.decision_usuario = 'ignorado'
    AND e.creado_en >= p_desde AND e.creado_en < p_hasta + 1
  ORDER BY e.creado_en DESC
  LIMIT 200;
END $$;

REVOKE ALL ON FUNCTION app.password_temporal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.autenticar(text, text),
  app.cambiar_password(text, text),
  app.supervisor_empleados(),
  app.supervisor_crear_empleado(text, text, uuid),
  app.supervisor_actualizar_empleado(uuid, uuid, boolean),
  app.supervisor_reiniciar_password(uuid),
  app.supervisor_definir_politica(app.tipo_dato, app.accion),
  app.panel_eventos_riesgo(date, date)
TO securedata_api;
