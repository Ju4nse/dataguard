import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteFor, SITES } from './sites';

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/manifest.json'), 'utf8')) as {
  content_scripts: { matches: string[] }[];
};
const matchHosts = manifest.content_scripts.flatMap((c) => c.matches).map((m) => new URL(m.replace('/*', '/')).hostname);

describe('sitios protegidos', () => {
  it('el manifest inyecta la extensión en todos los sitios de sites.ts, y solo en esos', () => {
    for (const site of SITES)
      for (const host of site.hosts)
        expect(
          matchHosts.some((h) => h.replace(/^www\./, '') === host),
          host,
        ).toBe(true);
    for (const host of matchHosts) expect(siteFor(host), host).not.toBeNull();
  });

  it('reconoce el sitio con o sin "www"', () => {
    expect(siteFor('www.perplexity.ai')?.name).toBe('Perplexity');
    expect(siteFor('chat.deepseek.com')?.name).toBe('DeepSeek');
    expect(siteFor('ejemplo.com')).toBeNull();
  });
});
