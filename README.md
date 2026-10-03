# DataGuard

> Nombre interno del código: `securedata` (paquetes `@securedata/*`, base `securedata`). La marca visible es **DataGuard**.

Filtro de seguridad previo al uso de IA: detecta datos sensibles (DNI, CUIT/CUIL, CBU/CVU, emails, teléfonos, tarjetas, nombres, empresas, direcciones…) y permite eliminarlos, anonimizarlos o seudonimizarlos **sin que el archivo salga del navegador**.

## Formatos soportados

| Tipo | Formatos | Cómo se revisa | Qué se descarga |
|---|---|---|---|
| Planillas | `.csv` `.tsv` `.xlsx` `.xls` `.ods` | Por columna | Mismo formato |
| JSON tabular | `.json` con forma `[{...}, {...}]` | Por columna | `.json` |
| JSON anidado | cualquier otro `.json` | Por tipo de dato (la clave sirve de pista) | `.json` con la misma estructura |
| Documentos | `.pdf` `.docx` `.txt` `.md` | Por tipo de dato + términos agregados a mano | Texto plano (o `.md`), con botón para copiar |

**Detección en dos capas, ambas locales:** reglas y validadores (siempre activas) y, opcional, un modelo de IA GLiNER que corre en el navegador para nombres, empresas, direcciones y datos de salud sin formato fijo. El modelo se descarga una vez y analiza sin enviar nada a ningún servidor: la protección no crea nuevas fugas. Ver [IA local](#ia-local-gliner).

Limitaciones actuales: PDF escaneados (sin texto seleccionable) y `.doc` viejos no se pueden leer; con la IA local algún dato todavía puede escaparse (se agregan a mano en la revisión). En PDF y Word se conserva el texto, no el formato.

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

**Chat protegido:** además de subir archivos, el usuario puede escribir o pegar un prompt (pestaña "Escribir un prompt"). DataGuard lo devuelve protegido para copiarlo en la IA, y después traduce la respuesta. Los seudónimos se mantienen en toda la conversación: "Persona_01" es siempre la misma persona, y un apellido solo ("Benítez") reutiliza el seudónimo de la única persona que lo tiene. La conversación vive solo en memoria (`apps/web/src/chatStore.ts`); con sesión, se registran solo los metadatos (`tipoEntrada: prompt`).

**Tabla de equivalencias cifrada:** además del CSV, se puede descargar cifrada con contraseña (AES-GCM 256 con PBKDF2-SHA256, WebCrypto, `apps/web/src/lib/crypto.ts`) y abrirla después en el traductor.

**Traducir la respuesta de la IA:** el usuario pega lo que le respondió ChatGPT, Claude o Copilot y la app lo devuelve con los datos reales en lugar de `Persona_01`, `Empresa_03`… (resaltados), sin buscarlos a mano en la tabla. Está en la pantalla de resultado (con la tabla del archivo recién protegido) y desde el inicio, cargando un `_equivalencias.csv` descargado antes. Tolera cómo las IA reescriben los seudónimos (`Persona 1`, `persona_01`, `**Persona_01**`), avisa los que no están en la tabla (inventados) y los datos anonimizados que no se pueden recuperar (`[DNI]`, `***@gmail.com`). Todo en el navegador (`packages/detector/src/restore.ts`).

## IA local (GLiNER)

`packages/ml` corre [`gliner_multi_pii-v1`](https://huggingface.co/onnx-community/gliner_multi_pii-v1) (multilingüe, entrenado para datos personales, Apache-2.0) con `onnxruntime-web` dentro de un Web Worker (`apps/web/src/lib/ai.worker.ts`). El pre y post-procesamiento de GLiNER está implementado en `packages/ml/src/gliner.ts` (no usamos el paquete `gliner` de npm: depende de versiones viejas y su separador de palabras corta las tildes).

- **Modelo propio de 298 MB** (`scripts/quantize-model.py --plegado`): el `model_int8.onnx` publicado cuantiza también las activaciones y pierde casi toda la calidad (un nombre claro daba 0,4 en vez de ~0,9). El nuestro guarda solo los pesos en 8 bits y onnxruntime los pasa a float32 al cargar: misma calidad que el modelo completo de 1,16 GB, a velocidad completa.
- **Opcional:** el usuario la activa con un clic; antes de bajar se avisa el tamaño. Queda guardada en el sistema de archivos privado del navegador (OPFS) y se carga sola en las visitas siguientes; las versiones viejas se borran.
- **Privacidad:** el worker solo descarga los archivos del modelo; ningún texto del usuario sale del navegador.
- **Varios hilos:** con aislamiento de origen (COOP/COEP) usa hasta 4 núcleos. En desarrollo lo da `vite.config.ts`; en GitHub Pages, que no permite configurar cabeceras, lo da `public/aislamiento-sw.js` (si no se puede, corre en un hilo).
- **Cómo se combina** (`packages/detector/src/combine.ts`): lo validado por reglas (dígito verificador, formato, diccionario de datos sensibles) siempre gana; el modelo suma lo que las reglas no vieron y extiende nombres incompletos. Filtros genéricos descartan lo que no es un dato personal: cargos ("La empleada"), áreas ("Compras"), marcas y organismos públicos, lugares, calles sin número.
- **Planillas** (`packages/detector/src/tableModel.ts`): las columnas que las reglas no clasifican, o clasifican con confianza baja, se le pasan al modelo como muestra (hasta 40 valores, con el encabezado de contexto: "Cliente: …"); si reconoce el mismo tipo en el 60 % o más, se clasifica la columna entera. Las columnas de texto libre se analizan celda por celda. En planillas cada celda va por separado: juntas, el modelo las ve como una lista y pierde confianza.
- **Calibración:** umbral por etiqueta (`LABEL_THRESHOLDS`) tomado del centro de la meseta de `npm run calibrar:ia`, y ventanas de 24 palabras (`windowWords`).

| Medición (`npm run eval:ia -- --control`) | Solo reglas | Reglas + IA |
|---|---|---|
| Casos difíciles para las reglas | 43 % de cobertura | 100 % (precisión 88 %) |
| Set de control, nunca usado para calibrar | 40 % de cobertura | 100 % (precisión 91 %) |
| Documento de ~780 palabras en el navegador | — | 9 s con 4 hilos (20 s con uno) |

Para evaluar o regenerar el modelo hay que bajar el original una vez (queda en `.cache/`, ignorado por git) y cuantizarlo:

```bash
mkdir -p .cache/modelos/gliner_multi_pii-v1/onnx && cd .cache/modelos/gliner_multi_pii-v1
for f in tokenizer.json tokenizer_config.json onnx/model.onnx; do curl -L -o $f https://huggingface.co/onnx-community/gliner_multi_pii-v1/resolve/main/$f; done
cd - && pip install onnx onnxruntime onnx-ir && python scripts/quantize-model.py --plegado
npm run eval:ia
```

En desarrollo (`npm run dev`) Vite sirve el modelo desde `.cache/` y la IA local funciona sin publicarlo. En GitHub Pages lo genera el workflow de deploy (`.github/workflows/pages.yml`): baja el original de un commit fijo, lo cuantiza (queda en caché entre deploys) y lo publica junto a la app en partes de menos de 100 MB con `scripts/preparar-modelo-pages.py`, que también agrega el aviso de licencia (Apache-2.0). Para servirlo desde otro lado, `VITE_MODEL_BASE` indica la carpeta.

## Panel online (Tailscale)

El panel del responsable se puede abrir desde tus otros dispositivos (celular, notebook) a través de [Tailscale](https://tailscale.com): una red privada entre tus dispositivos. La base sigue en esta PC y nada queda expuesto a internet.

1. Instalá Tailscale en esta PC y entrá con tu cuenta (gratis). Instalalo también en cada dispositivo desde el que quieras ver el panel, con la misma cuenta.
2. En la consola de Tailscale ([DNS](https://login.tailscale.com/admin/dns)) dejá activado **MagicDNS** y activá **HTTPS Certificates**.
3. Corré `npm run panel:online`. Genera un secreto de sesión propio (`.env.panel`, fuera de git), levanta la base, compila el panel y lo publica con HTTPS en `https://<tu-pc>.<tu-red>.ts.net` mediante `tailscale serve`.

La API corre en modo producción (cookie segura, secreto propio), escucha solo en `127.0.0.1:8790` y sirve el panel en el mismo puerto; Tailscale hace de proxy. Si la PC se suspende, el panel no responde hasta que despierte (los datos no se pierden). Para que esté siempre disponible: que Windows no suspenda con el cargador enchufado y que Docker Desktop arranque al iniciar sesión (la base tiene `restart: unless-stopped`).

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
| `npm run eval:ia` | Compara reglas contra reglas + IA local, también como documento largo (necesita el modelo en `.cache/`); `-- --control` agrega el set de control |
| `npm run calibrar:ia` | Barre los umbrales por etiqueta de la IA local sobre los sets de calibración |
| `npm run db:up` / `db:down` | Levanta / apaga Postgres en Docker (puerto 5433) |
| `npm run db:reset` | Borra la base y la recrea desde `db/init` (esquema + datos de demo) |
| `npm run db:test` | Verifica estructura, permisos y autenticación de la base (26 pruebas) |
| `npm run db:totp -- <email>` | Código 2FA actual de un usuario de demo (para probar sin celular) |
| `npm run dev:api` / `dev:panel` | API y panel en modo desarrollo |
| `npm run db:psql` | Consola SQL dentro del contenedor |
| `npm run panel:online` | Publica el panel en tu red de Tailscale (ver arriba) |
| `npm run lint` | ESLint en todo el monorepo |
| `npm run format` / `format:check` | Prettier (escribe / solo verifica); el CI corre lint y format:check |

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

## Diseño

Sistema de diseño "Trust & Authority" (navy + azul de acción, Plus Jakarta Sans autoalojada): ver `design-system/securedata-ai/MASTER.md`. Los tokens compartidos están en `packages/shared/src/theme.css`.

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
