/**
 * La API de DataGuard como Edge Function de Supabase, para que el panel de GitHub Pages funcione sin la PC.
 * Es la misma app de apps/api (Hono). No se despliega este archivo: npm run api:edge lo empaqueta en
 * supabase/functions/api/index.ts (con pg como npm:pg) y ese es el que se sube.
 * Las variables (DATABASE_URL_API, SESSION_SECRET, TOKEN_ORIGINS…) van como secretos de la función.
 */
import app from '../../../apps/api/src/app';

Deno.serve(app.fetch);
