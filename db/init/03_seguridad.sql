-- =====================================================================
-- Permisos y seguridad por filas (RLS)
-- securedata_api es el rol con el que se conecta la API:
--   · NO puede insertar, modificar ni borrar tablas directamente (solo vía funciones).
--   · Puede leer solo SUS filas (RLS): su usuario, su organización, sus eventos.
--   · El panel solo se lee con app.panel_* (agregados, rol + segundo factor).
-- La contraseña de abajo es SOLO para desarrollo local.
-- =====================================================================

CREATE ROLE securedata_api LOGIN PASSWORD 'api_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT USAGE ON SCHEMA app TO securedata_api;

-- Lectura (filtrada por RLS) de lo propio.
GRANT SELECT ON app.organizaciones, app.areas, app.usuarios, app.eventos, app.detecciones TO securedata_api;
-- incidentes y auditoria: sin acceso directo.

GRANT EXECUTE ON FUNCTION
  app.uid(), app.aal(),
  app.registrar_evento(app.origen, app.tipo_entrada, jsonb, text, integer, text, app.decision_usuario),
  app.panel_resumen(date, date),
  app.panel_detalle_usuarios(date, date),
  app.incidente_crear(bigint),
  app.incidente_actualizar(bigint, app.estado_incidente),
  app.admin_crear_area(text),
  app.admin_crear_usuario(text, text, app.rol, uuid),
  app.admin_configurar(boolean, integer)
TO securedata_api;

ALTER TABLE app.organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.areas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.eventos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.detecciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.incidentes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.auditoria      ENABLE ROW LEVEL SECURITY;

-- Cada uno ve su propio usuario…
CREATE POLICY propio_usuario ON app.usuarios FOR SELECT TO securedata_api
  USING (id = app.uid());

-- …su organización y sus áreas (para mostrar nombres en la app)…
CREATE POLICY propia_organizacion ON app.organizaciones FOR SELECT TO securedata_api
  USING (id = (SELECT organizacion_id FROM app.usuarios WHERE id = app.uid()));
CREATE POLICY areas_de_mi_organizacion ON app.areas FOR SELECT TO securedata_api
  USING (organizacion_id = (SELECT organizacion_id FROM app.usuarios WHERE id = app.uid()));

-- …y solo SUS eventos (un empleado puede ver su historial; nadie lee los eventos de otros fila por fila).
CREATE POLICY propios_eventos ON app.eventos FOR SELECT TO securedata_api
  USING (usuario_id = app.uid());
CREATE POLICY propias_detecciones ON app.detecciones FOR SELECT TO securedata_api
  USING (EXISTS (SELECT 1 FROM app.eventos e WHERE e.id = evento_id AND e.usuario_id = app.uid()));

-- incidentes y auditoria: RLS activado sin políticas = el rol de la API no ve nada.
