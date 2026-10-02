-- =====================================================================
-- DataGuard — esquema
-- Principio: acá se guardan SOLO metadatos. Nunca contenido de archivos,
-- nombres de archivo, nombres de columnas ni textos de prompts.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA app;

CREATE TYPE app.rol AS ENUM ('empleado', 'responsable', 'admin');
CREATE TYPE app.origen AS ENUM ('web', 'extension');
CREATE TYPE app.tipo_entrada AS ENUM ('tabla', 'documento', 'prompt');
-- Decisión del empleado ante un aviso de la extensión.
CREATE TYPE app.decision_usuario AS ENUM ('enmascarado', 'ignorado', 'cancelado');
CREATE TYPE app.accion AS ENUM ('eliminar', 'anonimizar', 'seudonimizar', 'mantener');
CREATE TYPE app.estado_incidente AS ENUM ('abierto', 'en_revision', 'confirmado', 'descartado');
-- Debe coincidir con DETECTION_TYPES de packages/shared (lo verifica npm run db:test).
CREATE TYPE app.tipo_dato AS ENUM (
  'EMAIL', 'TELEFONO', 'DNI', 'CUIT_CUIL', 'CBU_CVU', 'TARJETA', 'PATENTE', 'NOMBRE_PERSONA', 'RAZON_SOCIAL',
  'DIRECCION', 'FECHA_NACIMIENTO', 'EDAD', 'PASAPORTE', 'SALARIO', 'DATO_SENSIBLE', 'CREDENCIAL', 'IP'
);

CREATE TABLE app.organizaciones (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                  text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 200),
  -- Decisión de la empresa: ¿el panel puede mostrar datos por empleado? Por defecto, no.
  mostrar_detalle_usuario boolean NOT NULL DEFAULT false,
  -- No se muestran estadísticas de grupos con menos personas que esto (para que no se pueda deducir quién fue).
  minimo_por_grupo        integer NOT NULL DEFAULT 5 CHECK (minimo_por_grupo >= 1),
  creada_en               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.areas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES app.organizaciones (id) ON DELETE CASCADE,
  nombre          text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 100),
  UNIQUE (organizacion_id, nombre),
  UNIQUE (id, organizacion_id)
);

CREATE TABLE app.usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES app.organizaciones (id) ON DELETE CASCADE,
  area_id         uuid,
  email           citext NOT NULL UNIQUE,
  nombre          text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 200),
  rol             app.rol NOT NULL DEFAULT 'empleado',
  -- La API lo pone en true cuando el usuario configura su segundo factor (TOTP).
  mfa_activo      boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  -- El área tiene que ser de la misma organización que el usuario.
  FOREIGN KEY (area_id, organizacion_id) REFERENCES app.areas (id, organizacion_id)
);
-- Nota: la autenticación (contraseñas, sesiones) la resuelve la API o Supabase Auth; acá no se guardan contraseñas.

-- Un "evento" es un archivo procesado en la web o un aviso de la extensión.
CREATE TABLE app.eventos (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizacion_id      uuid NOT NULL REFERENCES app.organizaciones (id) ON DELETE CASCADE,
  area_id              uuid REFERENCES app.areas (id) ON DELETE SET NULL,
  usuario_id           uuid NOT NULL REFERENCES app.usuarios (id) ON DELETE CASCADE,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  origen               app.origen NOT NULL,
  tipo_entrada         app.tipo_entrada NOT NULL,
  -- Solo la extensión del archivo ("pdf", "xlsx"), nunca el nombre.
  tipo_archivo         text CHECK (tipo_archivo ~ '^[a-z0-9]{1,8}$'),
  filas                integer CHECK (filas >= 0),
  tuvo_datos_sensibles boolean NOT NULL,
  -- Solo para la extensión: dominio del sitio de IA ("chatgpt.com") y qué hizo el empleado ante el aviso.
  sitio                text CHECK (sitio ~ '^[a-z0-9.-]{3,100}$'),
  decision_usuario     app.decision_usuario,
  CHECK (origen = 'extension' OR (sitio IS NULL AND decision_usuario IS NULL))
);
CREATE INDEX eventos_org_fecha ON app.eventos (organizacion_id, creado_en);
CREATE INDEX eventos_usuario_fecha ON app.eventos (usuario_id, creado_en);

-- Cuántos datos de cada tipo se detectaron en el evento y qué se hizo con ellos.
CREATE TABLE app.detecciones (
  evento_id bigint NOT NULL REFERENCES app.eventos (id) ON DELETE CASCADE,
  tipo      app.tipo_dato NOT NULL,
  accion    app.accion NOT NULL,
  cantidad  integer NOT NULL CHECK (cantidad BETWEEN 1 AND 10000000),
  PRIMARY KEY (evento_id, tipo, accion)
);
CREATE INDEX detecciones_tipo ON app.detecciones (tipo);

-- Incidentes que el responsable marca para investigar (ej. un dato enviado a una IA externa).
-- Sin campos de texto libre: no hay dónde copiar contenido sensible por error.
CREATE TABLE app.incidentes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organizacion_id uuid NOT NULL REFERENCES app.organizaciones (id) ON DELETE CASCADE,
  evento_id       bigint REFERENCES app.eventos (id) ON DELETE SET NULL,
  estado          app.estado_incidente NOT NULL DEFAULT 'abierto',
  creado_por      uuid NOT NULL REFERENCES app.usuarios (id),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- Quién consultó el panel y cuándo. Solo se agregan filas.
CREATE TABLE app.auditoria (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id uuid REFERENCES app.usuarios (id) ON DELETE SET NULL,
  accion     text NOT NULL,
  detalle    jsonb NOT NULL DEFAULT '{}',
  creado_en  timestamptz NOT NULL DEFAULT now()
);
