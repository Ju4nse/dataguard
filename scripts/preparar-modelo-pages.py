"""
Prepara la carpeta del modelo para publicarla junto a la app (GitHub Pages): copia el tokenizador,
parte el ONNX en pedazos de menos de 100 MB (con un manifiesto que el worker usa para rearmarlo)
y agrega el aviso de licencia del modelo original (Apache-2.0).

Uso: python scripts/preparar-modelo-pages.py apps/web/dist/modelos/gliner_multi_pii-v1
"""

import hashlib
import json
import os
import shutil
import sys

SRC = os.path.join(".cache", "modelos", "gliner_multi_pii-v1")
ONNX = os.path.join("onnx", "model_w8p.onnx")
PART_BYTES = 90 * 1024 * 1024

NOTICE = """Modelo de IA local de DataGuard

Este directorio contiene una versión cuantizada de GLiNER multi PII v1:
  - Original: https://huggingface.co/urchade/gliner_multi_pii-v1 (Urchade Zaratiana y colaboradores)
  - Exportación ONNX: https://huggingface.co/onnx-community/gliner_multi_pii-v1 (commit 2e0397a7)
  - Licencia: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)

Modificaciones: los pesos de las matrices y de los embeddings se cuantizaron a 8 bits ("solo pesos")
con scripts/quantize-model.py --plegado, y el archivo se partió en pedazos para publicarlo.
El tokenizador se distribuye sin cambios.
"""

dst = sys.argv[1]
os.makedirs(os.path.join(dst, "onnx"), exist_ok=True)

for name in ("tokenizer.json", "tokenizer_config.json"):
    shutil.copyfile(os.path.join(SRC, name), os.path.join(dst, name))

parts = []
digest = hashlib.sha256()
with open(os.path.join(SRC, ONNX), "rb") as f:
    while chunk := f.read(PART_BYTES):
        name = f"{os.path.basename(ONNX)}.parte{len(parts):02d}"
        with open(os.path.join(dst, "onnx", name), "wb") as out:
            out.write(chunk)
        digest.update(chunk)
        parts.append({"archivo": name, "bytes": len(chunk)})

manifest = {"partes": parts, "bytes": sum(p["bytes"] for p in parts), "sha256": digest.hexdigest()}
with open(os.path.join(dst, ONNX + ".partes.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
with open(os.path.join(dst, "LICENCIA-MODELO.txt"), "w", encoding="utf-8") as f:
    f.write(NOTICE)

print(f"{dst}: {len(parts)} partes, {manifest['bytes'] / 1e6:.0f} MB, sha256 {manifest['sha256'][:12]}…")
