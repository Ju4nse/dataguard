# Pendientes

Lo que quedó sin terminar o a medias, encontrado revisando el código (octubre 2026). Tachá o borrá cada punto cuando se resuelva.

## Panel y administración

- [x] ~~**Configuración del admin**~~: pestaña Configuración del panel (áreas, supervisores con contraseña temporal, privacidad del panel). Migración `06_admin_e_historial.sql`.
- [x] ~~**Detalle por empleado**~~: el admin lo habilita en Configuración y el reporte muestra "Ver detalle" (cada consulta queda auditada).

## Cuentas y acceso

- [ ] **Recuperar la contraseña sin el supervisor**: ya hay pantalla para cambiarla (Mi cuenta en la app web y en el panel), el supervisor reinicia la de un empleado y el admin la de un supervisor. Falta "me olvidé la contraseña" por email, y un **admin** que se olvida la suya sigue recuperándose solo con SQL (o con otro admin).
- [ ] **Recuperar el segundo factor**: el admin ya reinicia el 2FA de un supervisor ("Reiniciar acceso"). Faltan códigos de respaldo, y un admin sin otro admin sigue dependiendo de SQL.
- [x] ~~**Historial del empleado**~~: `GET /mis-eventos` y "Mi cuenta → Mi actividad" en la app web.
- [ ] **Límite de intentos en memoria** (`apps/api/src/security.ts`): se reinicia al reiniciar la API y no se comparte entre varias instancias. Alcanza para una sola API; si se sube a un servicio con más de una, pasarlo a la base.

## Extensión

- [ ] **Firefox + API, probar a mano**: confirmado que Firefox manda `Origin: moz-extension://<uuid>` y que la API lo rechazaba con 403. Ahora acepta cualquier `moz-extension://<uuid>` y, solo para ese origen, responde `Cross-Origin-Resource-Policy: cross-origin`. Falta probar el login desde la extensión en un Firefox real (cargándola en `about:debugging`): en la prueba automática Firefox aplicó CORS a la extensión instalada por WebDriver, así que no se pudo cerrar la prueba completa.
- [ ] **Publicación**: falta subirla a la Chrome Web Store y a Firefox Add-ons. En Chrome el ID cambia al publicar: ponerlo en `EXTENSION_ID` de la API.

## App web y detección

- [ ] **Gráficos de planillas desactivados**: `CHARTS_ENABLED = false` en `apps/web/src/store.ts` (el código está completo).
- [ ] **Formatos sin soporte**: PDF escaneados e imágenes (no hay OCR), `.doc` viejos. PDF y Word se devuelven como texto, sin el formato original.
- [ ] **Modelo de IA ajustado**: el entrenamiento está armado (`entrenamiento/`, `npm run entrenamiento:datos`), pero no hay un modelo ajustado evaluado y adoptado.

## Infraestructura

- [ ] **Panel nuevo sin probar en el navegador**: las pestañas Empleados, Política, Eventos de riesgo, Configuración y Mi cuenta (y Mi cuenta de la app web) se probaron por la API y compilan, pero no se miraron en pantalla (celular incluido).
- [ ] **Hosting de la API**: la base ya está en Supabase, pero la API corre en la PC (Tailscale). Si la PC se apaga o suspende, no hay panel ni registro de eventos. Evaluar subirla a un servicio (Fly.io, Render, Railway) con `SESSION_SECRET`, `ALLOWED_ORIGINS` y `DATABASE_URL_API` propios.
- [ ] **App web publicada sin API**: la versión de GitHub Pages es demo estática (`VITE_STATIC_DEMO`); no se conecta a ninguna API, así que no aplica la política de la empresa ni registra eventos.
- [ ] **Supabase en plan gratis**: se pausa después de 7 días sin uso y no tiene restauración a un punto en el tiempo. Con datos reales: plan pago o un `pg_dump` programado como backup propio.
- [ ] **Datos de demo en Supabase**: la base de Supabase tiene la demo cargada (usuarios con `demo1234` y secreto TOTP conocido). Antes de usarla con una empresa real: `npm run db:reset -- --confirmar --sin-demo` y `npm run db:empresa`.
- [x] ~~**Certificado SSL de Supabase**~~: hace falta. Sin él, la conexión falla con "self-signed certificate in certificate chain". Está en `db/supabase-ca.crt` (Supabase Root 2021 CA) con `DATABASE_SSL_CA=db/supabase-ca.crt`.

## Repo

- [x] ~~**Cambios sin commitear**~~: quedaron en la rama `worktree-pendientes` (commit "trabajo en curso"), salvo `videos/`. Eran: extensión (`popup/Popup.tsx`, `lib/tabs.ts`, `content/guard.ts`, `content/ui.ts`, `content/files.ts`, `content/styles.ts`, `background.ts`), app web (`ResultStep.tsx`, `DocumentResultStep.tsx`, `store.ts`) y la carpeta `videos/`.
