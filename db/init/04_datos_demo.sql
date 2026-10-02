-- =====================================================================
-- Datos de DEMO (ficticios). Solo para desarrollo local.
-- IDs fijos para usarlos en pruebas:
--   Empresa Demo SA   aaaaaaaa-0000-0000-0000-000000000001
--     admin           aaaaaaaa-0000-0000-0000-0000000000a1  (con 2FA)
--     responsable     aaaaaaaa-0000-0000-0000-0000000000a2  (con 2FA)
--     resp. sin 2FA   aaaaaaaa-0000-0000-0000-0000000000a3
--     empleado        aaaaaaaa-0000-0000-0000-0000000000e1  (Ventas)
--   Otra Empresa SRL  bbbbbbbb-0000-0000-0000-000000000001
--     responsable     bbbbbbbb-0000-0000-0000-0000000000b2  (con 2FA)
--     empleado        bbbbbbbb-0000-0000-0000-0000000000e1
-- =====================================================================

INSERT INTO app.organizaciones (id, nombre) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Empresa Demo SA'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Otra Empresa SRL');

-- Marketing (3 personas) y Sistemas (2) están por debajo del mínimo de 5: en el panel se agrupan en "Otras áreas".
INSERT INTO app.areas (id, organizacion_id, nombre) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ventas'),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', 'RRHH'),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', 'Finanzas'),
  ('aaaaaaaa-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001', 'Compras'),
  ('aaaaaaaa-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001', 'Marketing'),
  ('aaaaaaaa-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sistemas'),
  ('bbbbbbbb-0000-0000-0000-000000000011', 'bbbbbbbb-0000-0000-0000-000000000001', 'General');

INSERT INTO app.usuarios (id, organizacion_id, area_id, email, nombre, rol, mfa_activo) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'admin@demo.test', 'Admin Demo', 'admin', true),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'seguridad@demo.test', 'Responsable de Seguridad', 'responsable', true),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'gerente@demo.test', 'Gerente sin 2FA', 'responsable', false),
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000011', 'empleado@demo.test', 'Empleado de Prueba', 'empleado', false),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-000000000001', NULL, 'seguridad@otra.test', 'Responsable Otra', 'responsable', true),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000011', 'empleado@otra.test', 'Empleado Otra', 'empleado', false);

-- Empleados de demo por área (además del empleado de prueba en Ventas).
INSERT INTO app.usuarios (organizacion_id, area_id, email, nombre)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', a.id, lower(a.nombre) || n || '@demo.test', a.nombre || ' ' || n
FROM app.areas a
JOIN (VALUES ('Ventas', 6), ('RRHH', 5), ('Finanzas', 5), ('Compras', 5), ('Marketing', 3), ('Sistemas', 2)) AS c(area, cantidad) ON c.area = a.nombre
CROSS JOIN LATERAL generate_series(1, c.cantidad) AS n
WHERE a.organizacion_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Tres meses de eventos simulados para que el panel tenga algo para mostrar (semilla fija: siempre los mismos).
DO $$
DECLARE
  u record;
  dia integer;
  ev_id bigint;
  es_extension boolean;
  pesos_tipo app.tipo_dato[] := ARRAY['EMAIL','EMAIL','TELEFONO','TELEFONO','DNI','DNI','CUIT_CUIL','NOMBRE_PERSONA','NOMBRE_PERSONA',
                                      'RAZON_SOCIAL','RAZON_SOCIAL','SALARIO','DIRECCION','TARJETA','CBU_CVU','DATO_SENSIBLE','CREDENCIAL']::app.tipo_dato[];
  acciones app.accion[] := ARRAY['seudonimizar','seudonimizar','anonimizar','anonimizar','eliminar','mantener']::app.accion[];
  decision app.decision_usuario;
  n_tipos integer;
BEGIN
  PERFORM setseed(0.42);
  FOR u IN SELECT * FROM app.usuarios WHERE organizacion_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND rol = 'empleado' ORDER BY email LOOP
    FOR dia IN 1..90 LOOP
      CONTINUE WHEN random() > 0.18;
      es_extension := random() < 0.3;
      decision := CASE WHEN NOT es_extension THEN NULL
                       WHEN random() < 0.7 THEN 'enmascarado'
                       WHEN random() < 0.5 THEN 'ignorado'
                       ELSE 'cancelado' END;
      n_tipos := CASE WHEN random() < 0.15 THEN 0 ELSE 1 + floor(random() * 3)::int END;

      INSERT INTO app.eventos (organizacion_id, area_id, usuario_id, creado_en, origen, tipo_entrada, tipo_archivo, filas, sitio, decision_usuario, tuvo_datos_sensibles)
      VALUES (u.organizacion_id, u.area_id, u.id, now() - make_interval(days => dia, hours => floor(random() * 10)::int),
              (CASE WHEN es_extension THEN 'extension' ELSE 'web' END)::app.origen,
              (CASE WHEN es_extension THEN 'prompt' WHEN random() < 0.7 THEN 'tabla' ELSE 'documento' END)::app.tipo_entrada,
              CASE WHEN es_extension THEN NULL ELSE (ARRAY['xlsx','csv','pdf','docx'])[1 + floor(random() * 4)::int] END,
              CASE WHEN es_extension THEN NULL ELSE 20 + floor(random() * 2000)::int END,
              CASE WHEN es_extension THEN (ARRAY['chatgpt.com','claude.ai'])[1 + floor(random() * 2)::int] END,
              decision, n_tipos > 0)
      RETURNING id INTO ev_id;

      INSERT INTO app.detecciones (evento_id, tipo, accion, cantidad)
      SELECT ev_id, t, CASE decision WHEN 'ignorado' THEN 'mantener'::app.accion WHEN 'cancelado' THEN 'eliminar'::app.accion
                                     ELSE acciones[1 + floor(random() * array_length(acciones, 1))::int] END,
             1 + floor(random() * 25)::int
      FROM (SELECT DISTINCT pesos_tipo[1 + floor(random() * array_length(pesos_tipo, 1))::int] AS t FROM generate_series(1, n_tipos)) x
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
