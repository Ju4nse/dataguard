-- =====================================================================
-- Administración de la empresa (rol admin) e historial del empleado.
-- El admin crea áreas, da de alta supervisores (con contraseña temporal), los desactiva, les
-- reinicia el acceso si pierden la contraseña o el celular, y configura la privacidad del panel.
-- El empleado ve sus propios eventos (nunca los de otros).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Historial del empleado
-- ---------------------------------------------------------------------

-- Los últimos eventos propios con sus detecciones. Solo metadatos: nunca hubo contenido que mostrar.
CREATE FUNCTION app.mis_eventos(p_limite integer)
RETURNS TABLE (id bigint, creado_en timestamptz, origen app.origen, tipo_entrada app.tipo_entrada, tipo_archivo text, filas integer,
               sitio text, decision_usuario app.decision_usuario, detecciones jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.usuario_actual();
BEGIN
  RETURN QUERY
  SELECT e.id, e.creado_en, e.origen, e.tipo_entrada, e.tipo_archivo, e.filas, e.sitio, e.decision_usuario,
         coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', d.tipo, 'accion', d.accion, 'cantidad', d.cantidad) ORDER BY d.cantidad DESC)
                   FROM app.detecciones d WHERE d.evento_id = e.id), '[]')
  FROM app.eventos e
  WHERE e.usuario_id = u.id
  ORDER BY e.creado_en DESC
  LIMIT least(greatest(p_limite, 1), 200);
END $$;

-- ---------------------------------------------------------------------
-- Administración
-- ---------------------------------------------------------------------

-- Todo lo que muestra la pantalla de configuración: empresa, áreas (con cuántas personas) y supervisores.
CREATE FUNCTION app.admin_configuracion() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin();
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'organizacion', o.nombre,
      'mostrar_detalle_usuario', o.mostrar_detalle_usuario,
      'minimo_por_grupo', o.minimo_por_grupo,
      'areas', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre,
                 'personas', (SELECT count(*) FROM app.usuarios x WHERE x.area_id = a.id AND x.activo)) ORDER BY a.nombre)
        FROM app.areas a WHERE a.organizacion_id = o.id), '[]'),
      'supervisores', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'email', s.email, 'rol', s.rol, 'area_id', s.area_id,
                 'activo', s.activo, 'mfa_activo', s.mfa_activo, 'pendiente_de_ingreso', s.debe_cambiar_password, 'yo', s.id = u.id)
                 ORDER BY s.activo DESC, s.nombre)
        FROM app.usuarios s WHERE s.organizacion_id = o.id AND s.rol IN ('responsable', 'admin')), '[]')
    )
    FROM app.organizaciones o WHERE o.id = u.organizacion_id
  );
END $$;

-- Antes creaba el usuario sin contraseña (no podía entrar). Ahora devuelve una temporal UNA vez,
-- como el alta de empleados. Los empleados los da de alta el supervisor; acá, solo supervisores.
DROP FUNCTION app.admin_crear_usuario(text, text, app.rol, uuid);
CREATE FUNCTION app.admin_crear_usuario(p_email text, p_nombre text, p_rol app.rol, p_area_id uuid)
RETURNS TABLE (id uuid, password_temporal text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin(); nuevo uuid; temporal text := app.password_temporal();
BEGIN
  IF p_rol NOT IN ('responsable', 'admin') THEN RAISE EXCEPTION 'los empleados se dan de alta desde Empleados'; END IF;
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email inválido'; END IF;
  INSERT INTO app.usuarios (organizacion_id, area_id, email, nombre, rol, password_hash, debe_cambiar_password)
  VALUES (u.organizacion_id, p_area_id, lower(trim(p_email)), trim(p_nombre), p_rol, crypt(temporal, gen_salt('bf', 10)), true)
  RETURNING usuarios.id INTO nuevo;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'admin_crear_usuario', jsonb_build_object('usuario', nuevo, 'rol', p_rol));
  RETURN QUERY SELECT nuevo, temporal;
END $$;

-- Alta/baja de un supervisor. El admin no se puede desactivar a sí mismo (la empresa quedaría sin admin).
CREATE FUNCTION app.admin_actualizar_supervisor(p_id uuid, p_activo boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin();
BEGIN
  IF p_id = u.id THEN RAISE EXCEPTION 'no podés desactivar tu propio usuario'; END IF;
  UPDATE app.usuarios SET activo = p_activo
  WHERE id = p_id AND organizacion_id = u.organizacion_id AND rol IN ('responsable', 'admin');
  IF NOT FOUND THEN RAISE EXCEPTION 'supervisor inexistente'; END IF;
  INSERT INTO app.auditoria (usuario_id, accion, detalle)
  VALUES (u.id, 'admin_actualizar_supervisor', jsonb_build_object('usuario', p_id, 'activo', p_activo));
END $$;

/*
 * El supervisor perdió la contraseña o el celular: contraseña temporal nueva (la devuelve UNA vez) y
 * segundo factor borrado, así al entrar configura uno nuevo. No sobre uno mismo.
 */
CREATE FUNCTION app.admin_reiniciar_acceso(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, extensions, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin(); temporal text := app.password_temporal();
BEGIN
  IF p_id = u.id THEN RAISE EXCEPTION 'no podés reiniciar tu propio acceso'; END IF;
  UPDATE app.usuarios
  SET password_hash = crypt(temporal, gen_salt('bf', 10)), debe_cambiar_password = true,
      mfa_activo = false, totp_secreto = NULL, totp_pendiente = NULL, totp_ultimo_paso = NULL
  WHERE id = p_id AND organizacion_id = u.organizacion_id AND rol IN ('responsable', 'admin') AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'supervisor inexistente'; END IF;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'admin_reiniciar_acceso', jsonb_build_object('usuario', p_id));
  RETURN temporal;
END $$;

REVOKE ALL ON FUNCTION
  app.mis_eventos(integer),
  app.admin_configuracion(),
  app.admin_crear_usuario(text, text, app.rol, uuid),
  app.admin_actualizar_supervisor(uuid, boolean),
  app.admin_reiniciar_acceso(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.mis_eventos(integer),
  app.admin_configuracion(),
  app.admin_crear_usuario(text, text, app.rol, uuid),
  app.admin_actualizar_supervisor(uuid, boolean),
  app.admin_reiniciar_acceso(uuid)
TO securedata_api;
