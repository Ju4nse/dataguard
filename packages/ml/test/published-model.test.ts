import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL, MODEL_PATH } from '../src';

const read = (file: string) => readFileSync(resolve(import.meta.dirname, '../../..', file), 'utf8');

/**
 * La app web y la extensión bajan el modelo que publica el workflow de Pages, y lo identifican con
 * MODEL (src/model.ts). Si se cambia el modelo en un lado y no en el otro, se publicaría uno y se
 * usaría con la configuración de otro: este test lo frena.
 */
describe('el modelo publicado es el mismo que usa el código', () => {
  const folder = MODEL_PATH.replace(/^modelos\//, '').replace(/\/$/, '');
  const onnxFile = MODEL.onnx.split('/').pop()!;

  it('workflow de Pages', () => {
    const workflow = read('.github/workflows/pages.yml');
    expect(workflow).toContain(`MODELO_REVISION: ${MODEL.revision}`);
    expect(workflow).toContain(`huggingface.co/${MODEL.id}/resolve/`);
    expect(workflow).toContain(`.cache/modelos/${folder}`);
    expect(workflow).toContain(`apps/web/dist/${MODEL_PATH.replace(/\/$/, '')}`);
  });

  // quantize-model.py no entra: es una herramienta general (--entrada/--salida, también para el modelo entrenado).
  it('script que publica el modelo', () => {
    const prepare = read('scripts/preparar-modelo-pages.py');
    expect(prepare).toContain(`"${folder}"`);
    expect(prepare).toContain(`"${onnxFile}"`);
  });
});
