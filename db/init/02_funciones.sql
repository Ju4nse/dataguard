-- =====================================================================
-- Funciones: la ÚNICA forma de escribir datos y de leer el panel.
-- La API, después de verificar la sesión, hace en cada transacción:
--   SET LOCAL app.user_id = '<uuid del usuario>';
--   SET LOCAL app.aal = 'aal2';   -- solo si la sesión pasó el segundo factor
-- (Si se migra a Supabase, solo cambian app.uid() y app.aal(): auth.uid() y auth.jwt()->>'aal'.)
-- =====================================================================

CREATE FUNCTION app.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE FUNCTION app.aal() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.aal', true), ''), 'aal1')
$$;

-- Usuario de la sesión; error si no hay sesión o el usuario está desactivado.
CREATE FUNCTION app.usuario_actual() RETURNS app.usuarios
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios;
BEGIN
  SELECT * INTO u FROM app.usuarios WHERE id = app.uid() AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin sesión válida' USING ERRCODE = '28000';
  END IF;
  RETURN u;
END $$;

-- Responsables y admins, con segundo factor obligatorio.
CREATE FUNCTION app.exigir_responsable() RETURNS app.usuarios
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.usuario_actual();
BEGIN
  IF u.rol NOT IN ('responsable', 'admin') THEN
    RAISE EXCEPTION 'no autorizado: se requiere rol de responsable' USING ERRCODE = '42501';
  END IF;
  IF NOT u.mfa_activo OR app.aal() <> 'aal2' THEN
    RAISE EXCEPTION 'no autorizado: se requiere segundo factor de autenticación' USING ERRCODE = '42501';
  END IF;
  RETURN u;
END $$;

-- ---------------------------------------------------------------------
-- Empleados (app web y extensión)
-- ---------------------------------------------------------------------

/*
 * Registra un evento con sus detecciones. La organización, el área y el usuario salen de la sesión,
 * nunca de los parámetros: un empleado no puede registrar eventos a nombre de otro.
 * p_detecciones: [{"tipo": "DNI", "accion": "seudonimizar", "cantidad": 12}, ...]
 */
CREATE FUNCTION app.registrar_evento(
  p_origen        app.origen,
  p_tipo_entrada  app.tipo_entrada,
  p_detecciones   jsonb,
  p_tipo_archivo  text DEFAULT NULL,
  p_filas         integer DEFAULT NULL,
  p_sitio         text DEFAULT NULL,
  p_decision      app.decision_usuario DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  u app.usuarios := app.usuario_actual();
  nuevo_id bigint;
BEGIN
  IF jsonb_typeof(p_detecciones) <> 'array' OR jsonb_array_length(p_detecciones) > 100 THEN
    RAISE EXCEPTION 'p_detecciones debe ser una lista (máximo 100 elementos)';
  END IF;

  INSERT INTO app.eventos (organizacion_id, area_id, usuario_id, origen, tipo_entrada, tipo_archivo, filas, sitio, decision_usuario, tuvo_datos_sensibles)
  VALUES (u.organizacion_id, u.area_id, u.id, p_origen, p_tipo_entrada, lower(p_tipo_archivo), p_filas, lower(p_sitio), p_decision,
          jsonb_array_length(p_detecciones) > 0)
  RETURNING id INTO nuevo_id;

  -- Si el mismo tipo y acción vienen repetidos (dos columnas de DNI), se suman.
  INSERT INTO app.detecciones (evento_id, tipo, accion, cantidad)
  SELECT nuevo_id, (d->>'tipo')::app.tipo_dato, (d->>'accion')::app.accion, sum((d->>'cantidad')::integer)
  FROM jsonb_array_elements(p_detecciones) AS d
  GROUP BY 2, 3;

  RETURN nuevo_id;
END $$;

-- ---------------------------------------------------------------------
-- Panel del responsable (solo agregados)
-- ---------------------------------------------------------------------

/*
 * Resumen de la organización del responsable entre dos fechas.
 * Las áreas con menos personas activas que minimo_por_grupo se agrupan en "Otras áreas";
 * si incluso agrupadas no llegan al mínimo, se omiten (se informa cuántas).
 */
CREATE FUNCTION app.panel_resumen(p_desde date, p_hasta date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  u app.usuarios := app.exigir_responsable();
  k integer;
  resultado jsonb;
BEGIN
  IF p_hasta < p_desde OR p_hasta - p_desde > 731 THEN
    RAISE EXCEPTION 'rango de fechas inválido (máximo 2 años)';
  END IF;
  SELECT minimo_por_grupo INTO k FROM app.organizaciones WHERE id = u.organizacion_id;

  INSERT INTO app.auditoria (usuario_id, accion, detalle)
  VALUES (u.id, 'panel_resumen', jsonb_build_object('desde', p_desde, 'hasta', p_hasta));

  WITH ev AS (
    SELECT e.* FROM app.eventos e
    WHERE e.organizacion_id = u.organizacion_id
      AND e.creado_en >= p_desde AND e.creado_en < p_hasta + 1
  ),
  det AS (
    SELECT d.*, ev.area_id, ev.creado_en FROM app.detecciones d JOIN ev ON ev.id = d.evento_id
  ),
  por_area_bruto AS (
    SELECT a.nombre AS area,
           count(DISTINCT ev.usuario_id) AS personas,
           count(DISTINCT ev.id) AS eventos,
           coalesce((SELECT sum(cantidad) FROM det WHERE det.area_id = a.id), 0) AS detecciones
    FROM app.areas a LEFT JOIN ev ON ev.area_id = a.id
    WHERE a.organizacion_id = u.organizacion_id
    GROUP BY a.id, a.nombre
    HAVING count(DISTINCT ev.id) > 0
  ),
  chicas AS (
    SELECT sum(personas) AS personas, sum(eventos) AS eventos, sum(detecciones) AS detecciones, count(*) AS areas
    FROM por_area_bruto WHERE personas < k
  )
  SELECT jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'totales', jsonb_build_object(
      'eventos',                (SELECT count(*) FROM ev),
      'eventos_con_sensibles',  (SELECT count(*) FROM ev WHERE tuvo_datos_sensibles),
      'detecciones',            (SELECT coalesce(sum(cantidad), 0) FROM det),
      'enviados_a_externo',     (SELECT count(*) FROM ev WHERE origen = 'extension' AND decision_usuario = 'ignorado'),
      'bloqueados',             (SELECT coalesce(sum(cantidad), 0) FROM det WHERE accion = 'eliminar'),
      'anonimizados',           (SELECT coalesce(sum(cantidad), 0) FROM det WHERE accion IN ('anonimizar', 'seudonimizar')),
      'permitidos',             (SELECT coalesce(sum(cantidad), 0) FROM det WHERE accion = 'mantener'),
      'incidentes_confirmados', (SELECT count(*) FROM app.incidentes i WHERE i.organizacion_id = u.organizacion_id AND i.estado = 'confirmado'
                                   AND i.creado_en >= p_desde AND i.creado_en < p_hasta + 1)
    ),
    'por_mes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('mes', mes, 'detecciones', total) ORDER BY mes)
      FROM (SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes, sum(cantidad) AS total FROM det GROUP BY 1) m
    ), '[]'),
    'por_tipo', coalesce((
      SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'cantidad', total) ORDER BY total DESC)
      FROM (SELECT tipo, sum(cantidad) AS total FROM det GROUP BY tipo) t
    ), '[]'),
    'por_area', coalesce((
      SELECT jsonb_agg(jsonb_build_object('area', area, 'eventos', eventos, 'detecciones', detecciones) ORDER BY detecciones DESC)
      FROM (
        SELECT area, eventos, detecciones FROM por_area_bruto WHERE personas >= k
        UNION ALL
        SELECT 'Otras áreas', eventos, detecciones FROM chicas WHERE personas >= k
      ) x
    ), '[]'),
    'areas_omitidas', (SELECT CASE WHEN personas < k THEN areas ELSE 0 END FROM chicas),
    'minimo_por_grupo', k
  ) INTO resultado;

  RETURN resultado;
END $$;

-- Detalle por empleado: solo si la organización lo habilitó explícitamente.
CREATE FUNCTION app.panel_detalle_usuarios(p_desde date, p_hasta date)
RETURNS TABLE (usuario text, area text, eventos bigint, detecciones bigint, avisos_ignorados bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable();
BEGIN
  IF NOT (SELECT mostrar_detalle_usuario FROM app.organizaciones WHERE id = u.organizacion_id) THEN
    RAISE EXCEPTION 'la organización no habilitó el detalle por usuario' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app.auditoria (usuario_id, accion, detalle)
  VALUES (u.id, 'panel_detalle_usuarios', jsonb_build_object('desde', p_desde, 'hasta', p_hasta));

  RETURN QUERY
  SELECT us.nombre, a.nombre, count(DISTINCT e.id), coalesce(sum(d.cantidad), 0)::bigint,
         count(DISTINCT e.id) FILTER (WHERE e.decision_usuario = 'ignorado')
  FROM app.eventos e
  JOIN app.usuarios us ON us.id = e.usuario_id
  LEFT JOIN app.areas a ON a.id = e.area_id
  LEFT JOIN app.detecciones d ON d.evento_id = e.id
  WHERE e.organizacion_id = u.organizacion_id AND e.creado_en >= p_desde AND e.creado_en < p_hasta + 1
  GROUP BY us.nombre, a.nombre
  ORDER BY 4 DESC;
END $$;

-- Incidentes: el responsable marca un evento para investigar y actualiza su estado.
CREATE FUNCTION app.incidente_crear(p_evento_id bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable(); nuevo bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.eventos WHERE id = p_evento_id AND organizacion_id = u.organizacion_id) THEN
    RAISE EXCEPTION 'evento inexistente';
  END IF;
  INSERT INTO app.incidentes (organizacion_id, evento_id, creado_por) VALUES (u.organizacion_id, p_evento_id, u.id) RETURNING id INTO nuevo;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'incidente_crear', jsonb_build_object('incidente', nuevo));
  RETURN nuevo;
END $$;

CREATE FUNCTION app.incidente_actualizar(p_id bigint, p_estado app.estado_incidente) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable();
BEGIN
  UPDATE app.incidentes SET estado = p_estado, actualizado_en = now() WHERE id = p_id AND organizacion_id = u.organizacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incidente inexistente'; END IF;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'incidente_actualizar', jsonb_build_object('incidente', p_id, 'estado', p_estado));
END $$;

-- ---------------------------------------------------------------------
-- Administración de la organización (rol admin)
-- ---------------------------------------------------------------------

CREATE FUNCTION app.exigir_admin() RETURNS app.usuarios
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_responsable();
BEGIN
  IF u.rol <> 'admin' THEN RAISE EXCEPTION 'no autorizado: se requiere rol de admin' USING ERRCODE = '42501'; END IF;
  RETURN u;
END $$;

CREATE FUNCTION app.admin_crear_area(p_nombre text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin(); nuevo uuid;
BEGIN
  INSERT INTO app.areas (organizacion_id, nombre) VALUES (u.organizacion_id, p_nombre) RETURNING id INTO nuevo;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'admin_crear_area', jsonb_build_object('area', nuevo));
  RETURN nuevo;
END $$;

-- Alta de usuarios por invitación: no existe el registro abierto.
CREATE FUNCTION app.admin_crear_usuario(p_email text, p_nombre text, p_rol app.rol, p_area_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin(); nuevo uuid;
BEGIN
  INSERT INTO app.usuarios (organizacion_id, area_id, email, nombre, rol)
  VALUES (u.organizacion_id, p_area_id, p_email, p_nombre, p_rol) RETURNING id INTO nuevo;
  INSERT INTO app.auditoria (usuario_id, accion, detalle) VALUES (u.id, 'admin_crear_usuario', jsonb_build_object('usuario', nuevo, 'rol', p_rol));
  RETURN nuevo;
END $$;

CREATE FUNCTION app.admin_configurar(p_mostrar_detalle_usuario boolean, p_minimo_por_grupo integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u app.usuarios := app.exigir_admin();
BEGIN
  UPDATE app.organizaciones SET mostrar_detalle_usuario = p_mostrar_detalle_usuario, minimo_por_grupo = p_minimo_por_grupo
  WHERE id = u.organizacion_id;
  INSERT INTO app.auditoria (usuario_id, accion, detalle)
  VALUES (u.id, 'admin_configurar', jsonb_build_object('mostrar_detalle_usuario', p_mostrar_detalle_usuario, 'minimo_por_grupo', p_minimo_por_grupo));
END $$;
