/** Script de contenido: en ChatGPT y Claude activa la protección (ver guard.ts). */
import { guard } from './guard';
import { siteFor } from './sites';

const site = siteFor(location.hostname);
if (site) void guard(site);
