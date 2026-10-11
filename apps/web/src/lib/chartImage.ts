/**
 * Descarga un gráfico como imagen PNG, armada en el navegador: el gráfico (SVG de Recharts) con su
 * título, la leyenda si tiene dos series y una línea al pie. Nada sale de la computadora.
 */

const SCALE = 2; // nítida en pantallas de alta densidad y al pegarla en una presentación
const PAD = 24;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Los colores vienen de variables CSS (var(--series-1)): fuera de la página no existen, se escriben los valores. */
function inlineVariables(svg: SVGSVGElement) {
  const root = getComputedStyle(document.documentElement);
  const resolve = (value: string) => value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => root.getPropertyValue(name).trim() || '#000');
  for (const el of [svg, ...svg.querySelectorAll<SVGElement>('*')]) {
    for (const attr of ['fill', 'stroke', 'style']) {
      const v = el.getAttribute(attr);
      if (v?.includes('var(')) el.setAttribute(attr, resolve(v));
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo dibujar el gráfico'));
    img.src = url;
  });
}

export interface ChartImageOptions {
  title: string;
  /** Series con su color (solo si hay dos o más: con una, el título la nombra). */
  legend?: { label: string; color: string }[];
  fileName: string;
}

/** Arma el PNG a partir del SVG que haya dentro de `container` y lo descarga. */
export async function downloadChartImage(container: HTMLElement, o: ChartImageOptions): Promise<void> {
  const source = container.querySelector<SVGSVGElement>('svg.recharts-surface');
  if (!source) throw new Error('No hay un gráfico para descargar');
  const { width, height } = source.getBoundingClientRect();
  const svg = source.cloneNode(true) as SVGSVGElement;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.fontFamily = FONT;
  inlineVariables(svg);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await loadImage(url);
    const titleH = 28;
    const legendH = o.legend?.length ? 24 : 0;
    const footH = 24;
    const w = Math.max(width, 320) + PAD * 2;
    const h = PAD + titleH + legendH + height + footH + PAD / 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * SCALE;
    canvas.height = h * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 16px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(o.title, PAD, PAD, w - PAD * 2);
    let y = PAD + titleH;
    if (o.legend?.length) {
      let x = PAD;
      ctx.font = `13px ${FONT}`;
      for (const item of o.legend) {
        ctx.fillStyle = item.color;
        ctx.fillRect(x, y + 2, 12, 12);
        ctx.fillStyle = '#334155';
        ctx.fillText(item.label, x + 18, y + 1);
        x += 18 + ctx.measureText(item.label).width + 20;
      }
      y += legendH;
    }
    ctx.drawImage(img, PAD, y, width, height);
    ctx.fillStyle = '#64748b';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('Hecho con DataGuard · calculado en el navegador', PAD, y + height + 8);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('No se pudo armar la imagen');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = o.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "clientes_demo_monto-por-mes.png" */
export function chartFileName(fileName: string, title: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base}_${slug || 'grafico'}.png`;
}
