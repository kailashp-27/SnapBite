"""Read only whitelisted tensor pickle records; no Torch or arbitrary pickle globals execute.

The author's ONNX export has untrained weights. Reconstruct its identical MobileNetV2
graph using the checksum-pinned trained checkpoint, folding evaluation BatchNorm.
"""
from pathlib import Path
import collections
import hashlib
import io
import pickle
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.ml-work'
sys.path.insert(0, str(WORK / 'python'))
import numpy as np
import onnx
from onnx import numpy_helper

filename = WORK / 'food101-trained.bin'
assert hashlib.sha256(filename.read_bytes()).hexdigest() == '42cd5d9988f0830588b3be5107197c9b622c9b73426377975c07e8b24e346680'

def rebuild_tensor(storage, offset, shape, stride, requires_grad=False, backward_hooks=None):
    if len(shape) > 8 or len(shape) != len(stride) or offset < 0 or any(size < 0 for size in shape) or any(value < 0 for value in stride):
        raise ValueError('Invalid tensor layout')
    last = offset + sum((size - 1) * step for size, step in zip(shape, stride) if size)
    if last >= len(storage):
        raise ValueError('Tensor exceeds its storage')
    return np.ndarray(shape, dtype=storage.dtype, buffer=storage, offset=offset * storage.dtype.itemsize, strides=tuple(step * storage.dtype.itemsize for step in stride))

with zipfile.ZipFile(filename) as archive:
    pickle_name = next(name for name in archive.namelist() if name.endswith('/data.pkl'))
    prefix = pickle_name.rsplit('/', 1)[0]
    class TensorReader(pickle.Unpickler):
        def find_class(self, module, name):
            allowed = {('collections', 'OrderedDict'): collections.OrderedDict, ('torch', 'FloatStorage'): np.dtype('float32'), ('torch', 'LongStorage'): np.dtype('int64'), ('torch._utils', '_rebuild_tensor_v2'): rebuild_tensor}
            if (module, name) not in allowed:
                raise pickle.UnpicklingError(f'Unapproved pickle global: {module}.{name}')
            return allowed[(module, name)]
        def persistent_load(self, value):
            kind, dtype, key, location, count = value
            if kind != 'storage' or dtype not in [np.dtype('float32'), np.dtype('int64')] or not str(key).isdigit() or not 0 <= count <= 100_000_000:
                raise ValueError('Unsupported tensor storage')
            data = archive.read(f'{prefix}/data/{key}')
            if len(data) != count * dtype.itemsize:
                raise ValueError('Invalid storage size')
            return np.frombuffer(data, dtype=dtype)
    checkpoint = TensorReader(io.BytesIO(archive.read(pickle_name))).load()

weights = collections.OrderedDict((key.removeprefix('module.'), value) for key, value in checkpoint['state_dict'].items())
model = onnx.load(WORK / 'food101.onnx')
initializers = {tensor.name: tensor for tensor in model.graph.initializer}
conv_nodes = [node for node in model.graph.node if node.op_type == 'Conv']
conv_weights = [key for key, value in weights.items() if key.endswith('.weight') and value.ndim == 4]
assert len(conv_nodes) == len(conv_weights), 'Backbone architecture mismatch'
keys = list(weights)
for number, (node, key) in enumerate(zip(conv_nodes, conv_weights)):
    index = keys.index(key)
    bn_keys = keys[index+1:index+5]
    assert [value.rsplit('.',1)[-1] for value in bn_keys] == ['weight','bias','running_mean','running_var'], f'Missing BatchNorm after {key}'
    gamma, beta, mean, variance = [weights[value] for value in bn_keys]
    scale = gamma / np.sqrt(variance + np.float32(1e-5))
    fused_weight = (weights[key] * scale[:,None,None,None]).astype(np.float32)
    fused_bias = (beta - mean * scale).astype(np.float32)
    assert list(initializers[node.input[1]].dims) == list(fused_weight.shape), 'Convolution shape mismatch'
    weight_name, bias_name = f'trained.{number}.weight', f'trained.{number}.bias'
    model.graph.initializer.extend([numpy_helper.from_array(fused_weight, weight_name), numpy_helper.from_array(fused_bias, bias_name)])
    node.input[1], node.input[2] = weight_name, bias_name
for name in ['classifier.1.weight', 'classifier.1.bias']:
    initializers[name].CopyFrom(numpy_helper.from_array(weights[name].astype(np.float32), name))
needed = {output.name for output in model.graph.output}
retained = []
for node in reversed(model.graph.node):
    if any(name in needed for name in node.output):
        retained.append(node); needed.update(node.input)
kept_initializers = [tensor for tensor in model.graph.initializer if tensor.name in needed]
del model.graph.node[:]; model.graph.node.extend(reversed(retained))
del model.graph.initializer[:]; model.graph.initializer.extend(kept_initializers)
onnx.checker.check_model(model)
onnx.save(model, WORK / 'food101-repaired.onnx')
digest = hashlib.sha256((WORK / 'food101-repaired.onnx').read_bytes()).hexdigest()
(WORK / 'base-repair.json').write_text(__import__('json').dumps({'checkpointSha256':'42cd5d9988f0830588b3be5107197c9b622c9b73426377975c07e8b24e346680','modelSha256':digest,'convolutions':len(conv_nodes),'batchNormEpsilon':1e-5,'method':'Trained checkpoint weights with evaluation BatchNorm folding'},indent=2))
print(f'Reconstructed {len(conv_nodes)} trained convolutions, checkpoint epoch {checkpoint["epoch"]}; SHA-256 {digest}')
