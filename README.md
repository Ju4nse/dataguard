# SecureData AI

Filtro de seguridad previo al uso de IA: detecta datos sensibles (DNI, CUIT/CUIL, CBU/CVU, emails, teléfonos, tarjetas, nombres, empresas, direcciones…) y permite eliminarlos, anonimizarlos o seudonimizarlos **sin que el archivo salga del navegador**.

## Formatos soportados

| Tipo | Formatos | Cómo se revisa | Qué se descarga |
|---|---|---|---|
| Planillas | `.csv` `.tsv` `.xlsx` `.xls` `.ods` | Por columna | Mismo formato |
| JSON tabular | `.json` con forma `[{...}, {...}]` | Por columna | `.json` |
| JSON anidado | cualquier otro `.json` | Por tipo de dato (la clave sirve de pista) | `.json` con la misma estructura |
| Documentos | `.pdf` `.docx` `.txt` `.md` | Por tipo de dato + términos agregados a mano | Texto plano (o `.md`), con botón para copiar |

Limitaciones actuales: PDF escaneados (sin texto seleccionable) y `.doc` viejos no se pueden leer; en textos libres los nombres de personas no se detectan solos (se agregan a mano; GLiNER lo resolvería). En PDF y Word se conserva el texto, no el formato.

> **Windows:** si PowerShell dice que "la ejecución de scripts está deshabilitada", usá `npm.cmd` en lugar de `npm`, o corré una vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## Empezar

Requiere Node 22 o superior y Docker Desktop (para la base).

```bash
npm install
npm run db:up       # Postgres en Docker con esquema y datos de demo
npm run dev:api     # API en http://localhost:8787/api        (otra terminal)
npm run dev         # app del empleado en http://localhost:5173 (otra terminal)
npm run dev:panel   # panel del responsable en http://localhost:5180 (otra terminal)
```

La app del empleado funciona **sin** API ni base: el procesamiento es 100% en el navegador. Con sesión, aplica la política de la empresa y manda metadatos al panel.

**Usuarios de demo** (contraseña `demo1234` para todos):

| Usuario | Rol | Para probar |
|---|---|---|
| `empleado@demo.test` | empleado | app web con la política de la empresa |
| `seguridad@demo.test` | responsable con 2FA | panel; el código sale de `npm run db:totp -- seguridad@demo.test` |
| `gerente@demo.test` | responsable sin 2FA | alta del segundo factor con QR |
| `admin@demo.test` | admin con 2FA | configuración de la empresa |

> En desarrollo las tres apps comparten la cookie de sesión porque los navegadores no separan cookies por puerto en `localhost`. En producción van en dominios distintos.

## Arquitectura

```
 Navegador del empleado (apps/web)          Navegador del responsable (apps/panel)
 ├─ lee el archivo, detecta y protege          └─ login con contraseña + 2FA
 │  TODO localmente (packages/detector)             │ GET /api/panel/resumen (solo agregados)
 └─ con sesión: POST /api/eventos (solo metadatos)  │
              └──────────────┬──────────────────────┘
                     apps/api (Hono)  ── verifica la sesión y hace SET LOCAL app.user_id / app.aal
                             │
                     Postgres (db/init) ── funciones + seguridad por filas: aplica todos los permisos
```

**Protección automática:** al subir un archivo se protege solo con la política de la empresa (o las acciones recomendadas) y se va directo al resultado. Revisar es opcional. Ante la duda se seudonimiza: protege, conserva la utilidad para analizar y se revierte con la tabla de equivalencias.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app web |
| `npm test` | Tests del detector (Vitest) |
| `npm run typecheck` | Chequeo de tipos de todo el monorepo |
| `npm run e2e` | Procesa el fixture de ejemplo y verifica que no quede ningún dato sensible |
| `npm run fixtures` | Regenera los archivos de prueba (datos ficticios) |
| `npm run verify-clean -- <original> <depurado>` | Compara un original con su versión depurada |
| `npm run build` | Build de producción de la web |
| `npm run eval` | Mide la calidad del detector (precisión y cobertura por tipo); `-- --errores` lista cada fallo |
| `npm run db:up` / `db:down` | Levanta / apaga Postgres en Docker (puerto 5433) |
| `npm run db:reset` | Borra la base y la recrea desde `db/init` (esquema + datos de demo) |
| `npm run db:test` | Verifica estructura, permisos y autenticación de la base (26 pruebas) |
| `npm run db:totp -- <email>` | Código 2FA actual de un usuario de demo (para probar sin celular) |
| `npm run dev:api` / `dev:panel` | API y panel en modo desarrollo |
| `npm run db:psql` | Consola SQL dentro del contenedor |

## Calidad de la detección

`packages/detector/eval/corpus.ts` tiene textos etiquetados con datos ficticios: `[[TIPO|valor]]` marca lo que se debe detectar y todo lo demás **no** debe detectarse. Hay dos sets:

- **Desarrollo**: casos usados para ajustar las reglas (tiene que dar 100%; lo verifica un test).
- **Validación**: casos nuevos que no se usaron para ajustar; mide cómo generaliza. Si se ajusta una regla mirando un caso de validación, ese caso pasa a desarrollo y se escriben casos nuevos.

## Base de datos (Postgres en Docker)

Solo guarda **metadatos**: fecha, área, origen (web/extensión), tipo de archivo, cantidad de detecciones por tipo y acción. Nunca contenido, nombres de archivo ni de columnas.

```bash
cp .env.example .env
npm run db:up
npm run db:test
```

- `db/init/01_esquema.sql`: tablas (organizaciones, áreas, usuarios, eventos, detecciones, incidentes, auditoría).
- `db/init/02_funciones.sql`: la única forma de escribir y de leer el panel. Cada función verifica rol y organización.
- `db/init/03_seguridad.sql`: rol `securedata_api` sin escritura directa + seguridad por filas (cada uno ve solo lo suyo).
- `db/init/04_datos_demo.sql`: dos empresas ficticias y 3 meses de eventos simulados.
- `db/init/05_autenticacion_y_politicas.sql`: contraseñas con bcrypt, segundo factor TOTP verificado dentro de la base (la API nunca ve el secreto) y políticas de la empresa por tipo de dato.

El navegador **nunca** se conecta directo a Postgres: una API verifica el login y en cada transacción hace `SET LOCAL app.user_id` (y `app.aal = 'aal2'` si pasó el segundo factor). El panel exige rol de responsable + segundo factor, no muestra áreas con menos de 5 personas y registra cada consulta en la auditoría.

## Estructura

```
packages/
  shared/     tipos y etiquetas comunes (DetectionType, Action, ProcessingEvent)
  detector/   núcleo de detección y transformación — ÚNICA fuente de verdad
    src/validators/    CUIT (módulo 11), CBU (2 verificadores), Luhn, DNI
    src/patterns/      patrones de celda, de texto libre y pistas por encabezado
    src/scanText.ts    texto libre → fragmentos sensibles
    src/classifyColumn.ts  columna → tipo + confianza + acción sugerida
    src/transform.ts   eliminar / anonimizar / seudonimizar (consistente por archivo)
    src/document.ts    documentos y JSON: análisis y transformación por tipo de dato
    src/terms.ts       términos agregados a mano (sin distinguir mayúsculas ni tildes)
    src/json.ts        JSON tabular ↔ tabla, y recorrido de JSON anidado
apps/
  web/        app del empleado (React + Vite + Tailwind)
  panel/      panel del responsable (React + Recharts), acceso con 2FA
  api/        API (Hono): login, sesión, eventos y panel; los permisos los aplica Postgres
db/init/      esquema, funciones, seguridad, datos de demo, autenticación y políticas
fixtures/     archivos de prueba con datos FICTICIOS
scripts/      generador de fixtures y verificación de fugas
```

## Reglas de privacidad (revisar en cada PR)

- Ningún `console.log` con datos de usuario. Sin librerías de analítica o telemetría.
- Al backend solo van metadatos (`ProcessingEvent`): nunca contenido, nombres de archivo ni de columnas.
- La UI muestra ejemplos **enmascarados**.
- Fixtures solo con datos ficticios (`npm run fixtures`). Nunca subir archivos reales al repo.
