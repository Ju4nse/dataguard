"""
Cuantiza GLiNER "solo pesos": los pesos se guardan en 8 (o 4) bits, pero el cálculo sigue en float32.
El modelo pesa ~3 veces menos sin la pérdida de calidad de la cuantización dinámica (model_int8.onnx
de onnx-community cuantiza también las activaciones, y eso hunde los puntajes de GLiNER).

- Matrices (MatMul): MatMulNBits de onnxruntime, por bloques.
- Tabla de embeddings (250k tokens x 768, dos tercios del modelo): int8 por fila, con operaciones
  estándar (Gather -> Cast -> Mul por la escala de la fila), que corren en cualquier backend.

Uso (desde la raíz del repo, con el modelo completo descargado en .cache/):
    pip install onnx onnxruntime onnx-ir
    python scripts/quantize-model.py            # matrices en 8 bits
    python scripts/quantize-model.py --bits 4   # matrices en 4 bits (más chico)
Después: npm run eval:ia -- --modelo onnx/model_w8.onnx
"""

import argparse
import os

import numpy as np
import onnx
from onnx import helper, numpy_helper
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

DIR = os.path.join(".cache", "modelos", "gliner_multi_pii-v1", "onnx")
EMBEDDINGS = "token_rep_layer.bert_layer.model.embeddings.word_embeddings.weight"

parser = argparse.ArgumentParser()
parser.add_argument("--bits", type=int, default=8, choices=[4, 8], help="bits de las matrices (MatMul)")
parser.add_argument("--block", type=int, default=32, help="tamaño de bloque de la cuantización de matrices")
parser.add_argument(
    "--plegado",
    action="store_true",
    help="matrices en int8 por columna con Cast+Mul: onnxruntime las convierte a float32 una sola vez al "
    "cargar (plegado de constantes) y después calcula a velocidad completa. Misma descarga, más RAM.",
)
args = parser.parse_args()

src = os.path.join(DIR, "model.onnx")
dst = os.path.join(DIR, "model_w8p.onnx" if args.plegado else f"model_w{args.bits}.onnx")

model = onnx.load(src)
original_opset = next(o.version for o in model.opset_import if o.domain in ("", "ai.onnx"))


def fold_matmuls(model):
    """MatMul(x, W) -> MatMul(x, Cast(Wq) * escala): todo constante, se pliega al cargar el modelo."""
    graph = model.graph
    inits = {t.name: t for t in graph.initializer}
    done = 0
    for node in graph.node:
        if node.op_type != "MatMul" or node.input[1] not in inits:
            continue
        t = inits[node.input[1]]
        w = numpy_helper.to_array(t)
        if w.ndim != 2 or w.dtype != np.float32 or w.size < 4096:
            continue
        scale = np.abs(w).max(axis=0, keepdims=True) / 127.0  # una escala por columna de salida
        scale[scale == 0] = 1.0
        wq = np.clip(np.round(w / scale), -127, 127).astype(np.int8)
        name = node.input[1]
        graph.initializer.remove(t)
        del inits[name]
        graph.initializer.extend([numpy_helper.from_array(wq, name + "_q8"), numpy_helper.from_array(scale.astype(np.float32), name + "_scale")])
        # Al principio del grafo: el mismo peso puede usarse en otros nodos (incluso antes que este MatMul).
        graph.node.insert(0, helper.make_node("Mul", [name + "_f", name + "_scale"], [name], name=name + "_dequant"))
        graph.node.insert(0, helper.make_node("Cast", [name + "_q8"], [name + "_f"], name=name + "_cast", to=onnx.TensorProto.FLOAT))
        done += 1
    print(f"matrices plegables: {done}")
    return model


# 1) Matrices.
if args.plegado:
    model = fold_matmuls(model)
else:
    q = MatMulNBitsQuantizer(model, bits=args.bits, block_size=args.block, is_symmetric=True, op_types_to_quantize=("MatMul",), quant_axes=(("MatMul", 0),))
    q.process()
    model = q.model.model

    # El cuantizador sube el opset estándar (a 21) y deja nodos viejos inválidos (ReduceMean con "axes"
    # como atributo): se vuelve al original; MatMulNBits vive en el dominio com.microsoft.
    for o in model.opset_import:
        if o.domain in ("", "ai.onnx"):
            o.version = original_opset

# 2) Embeddings: int8 simétrico por fila.
graph = model.graph
init = next(t for t in graph.initializer if t.name == EMBEDDINGS)
w = numpy_helper.to_array(init).astype(np.float32)
scale = np.abs(w).max(axis=1, keepdims=True) / 127.0
scale[scale == 0] = 1.0
wq = np.clip(np.round(w / scale), -127, 127).astype(np.int8)
graph.initializer.remove(init)
graph.initializer.extend([numpy_helper.from_array(wq, EMBEDDINGS + "_q8"), numpy_helper.from_array(scale.astype(np.float32), EMBEDDINGS + "_scale")])

replaced = 0
for i, node in enumerate(list(graph.node)):
    if node.op_type != "Gather" or node.input[0] != EMBEDDINGS:
        continue
    ids, out, axis = node.input[1], node.output[0], next((a.i for a in node.attribute if a.name == "axis"), 0)
    assert axis == 0, "se esperaba Gather sobre el eje 0"
    p = node.name or f"embeddings_{replaced}"
    new = [
        helper.make_node("Gather", [EMBEDDINGS + "_q8", ids], [p + "_q"], name=p + "_q8", axis=0),
        helper.make_node("Cast", [p + "_q"], [p + "_f"], name=p + "_cast", to=onnx.TensorProto.FLOAT),
        helper.make_node("Gather", [EMBEDDINGS + "_scale", ids], [p + "_s"], name=p + "_scale", axis=0),
        helper.make_node("Mul", [p + "_f", p + "_s"], [out], name=p + "_dequant"),
    ]
    idx = list(graph.node).index(node)
    graph.node.remove(node)
    for k, n in enumerate(new):
        graph.node.insert(idx + k, n)
    replaced += 1
assert replaced > 0, "no se encontró el Gather de los embeddings"

onnx.checker.check_model(model)
onnx.save_model(model, dst)
print(f"{dst}: {os.path.getsize(dst) / 1e6:.0f} MB (embeddings reemplazados: {replaced})")
