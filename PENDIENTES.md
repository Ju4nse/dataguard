# Pendientes

Lo que quedó sin terminar o a medias, encontrado revisando el código (octubre 2026). Tachá o borrá cada punto cuando se resuelva.

## Panel y administración

- [ ] **Configuración del admin**: el supervisor ya administra empleados, política e incidentes desde el panel, pero lo propio del admin sigue sin pantalla: crear áreas (`app.admin_crear_area`), dar de alta supervisores (`app.admin_crear_usuario`, que además no les pone contraseña) y `app.admin_configurar` (mínimo por grupo, detalle por empleado).
- [ ] **Detalle por empleado**: la API tiene `GET /panel/usuarios`, pero solo funciona si un admin lo habilita y eso no se puede hacer desde la interfaz (ver punto anterior).

## Cuentas y acceso

- [ ] **Recuperar la contraseña sin el supervisor**: el empleado ya cambia la suya (`POST /auth/password`) y el supervisor le puede dar una temporal nueva, pero no hay "me olvidé la contraseña" por email ni pantalla para cambiarla cuando uno quiera (la ruta existe, falta el botón). Un supervisor que se olvida la suya solo se recupera con SQL.
- [ ] **Recuperar el segundo factor**: si un responsable pierde el celular, no hay códigos de respaldo ni forma de que un admin le reinicie el 2FA (hoy solo con SQL).
- [ ] **Historial del empleado**: la seguridad por filas lo permite ("un empleado ve sus propios eventos"), pero no hay ruta `GET` de eventos en la API ni pantalla en la app web.
- [ ] **Límite de intentos en memoria** (`apps/api/src/security.ts`): se reinicia al reiniciar la API y no se comparte entre varias instancias. Alcanza para una sola API; si se sube a un servicio con más de una, pasarlo a la base.

## Extensión

- [ ] **Firefox + API**: la API solo acepta pedidos del origen `chrome-extension://<id>` (`apps/api/src/config.ts`). En Firefox el origen es `moz-extension://<uuid>` y cambia en cada instalación, así que probablemente el login desde Firefox responde 403 "Origen no permitido". Verificar y resolver (ej. aceptar `moz-extension://` con otra protección, o un ID fijo).
- [ ] **Publicación**: falta subirla a la Chrome Web Store y a Firefox Add-ons. En Chrome el ID cambia al publicar: ponerlo en `EXTENSION_ID` de la API.

## App web y detección

- [ ] **Gráficos de planillas desactivados**: `CHARTS_ENABLED = false` en `apps/web/src/store.ts` (el código está completo).
- [ ] **Formatos sin soporte**: PDF escaneados e imágenes (no hay OCR), `.doc` viejos. PDF y Word se devuelven como texto, sin el formato original.
- [ ] **Modelo de IA ajustado**: el entrenamiento está armado (`entrenamiento/`, `npm run entrenamiento:datos`), pero no hay un modelo ajustado evaluado y adoptado.

## Infraestructura

- [ ] **Panel nuevo sin probar en el navegador**: las pestañas Empleados, Política y Eventos de riesgo se probaron por la API y compilan, pero no se miraron en pantalla (celular incluido).
- [ ] **Hosting de la API**: la base ya está en Supabase, pero la API corre en la PC (Tailscale). Si la PC se apaga o suspende, no hay panel ni registro de eventos. Evaluar subirla a un servicio (Fly.io, Render, Railway) con `SESSION_SECRET`, `ALLOWED_ORIGINS` y `DATABASE_URL_API` propios.
- [ ] **App web publicada sin API**: la versión de GitHub Pages es demo estática (`VITE_STATIC_DEMO`); no se conecta a ninguna API, así que no aplica la política de la empresa ni registra eventos.
- [ ] **Supabase en plan gratis**: se pausa después de 7 días sin uso y no tiene restauración a un punto en el tiempo. Con datos reales: plan pago o un `pg_dump` programado como backup propio.
- [ ] **Datos de demo en Supabase**: antes de usar la base con una empresa real, recrearla sin la demo (usuarios con `demo1234` y secreto TOTP conocido). Hoy `db:reset` siempre carga la demo: agregarle una opción sin ella.
- [ ] **Certificado SSL de Supabase**: confirmar con el proyecto real si alcanza con los certificados del sistema o hace falta descargar el de Supabase (`DATABASE_SSL_CA`, ver `.env.example`).

## Repo

- [ ] **Cambios sin commitear** al momento de esta revisión: extensión (`popup/Popup.tsx`, `lib/tabs.ts`, `content/guard.ts`, `content/ui.ts`, `content/files.ts`, `content/styles.ts`, `background.ts`), app web (`ResultStep.tsx`, `DocumentResultStep.tsx`, `store.ts`) y la carpeta `videos/`.
