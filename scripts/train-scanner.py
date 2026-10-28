"""Train a regional linear head on frozen Food-101 MobileNet features; export and evaluate.

Run with the project-local Python dependencies described in ml/README.md.
Dataset test rows are never used for fitting, early stopping, or temperature selection.
"""
from pathlib import Path
import hashlib
import json
import os
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.ml-work'
(WORK / 'temp').mkdir(exist_ok=True)
tempfile.tempdir = str(WORK / 'temp')
sys.path.insert(0, str(WORK / 'python'))
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto
import onnxruntime as ort
from PIL import Image, ImageOps

SEED = 42
INDIAN = ['biryani', 'cholebhature', 'dabeli', 'dal', 'dhokla', 'dosa', 'jalebi', 'kathiroll', 'kofta', 'naan', 'pakora', 'paneer', 'panipuri', 'pavbhaji', 'vadapav']
repair = json.loads((WORK / 'base-repair.json').read_text()) if (WORK / 'base-repair.json').exists() else None
if not repair:
    raise RuntimeError('Repair and verify the trained checkpoint export before training. The upstream ONNX weights were rejected.')
BASE_SHA = repair['modelSha256']
MODEL_DIR = ROOT / 'public' / 'models' / 'snapbite-v1'
MODEL_DIR.mkdir(parents=True, exist_ok=True)
(WORK / 'features').mkdir(exist_ok=True)
REPORTS = ROOT / 'ml' / 'reports'
REPORTS.mkdir(parents=True, exist_ok=True)

def session(filename):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return ort.InferenceSession(str(filename), options, providers=['CPUExecutionProvider'])

def preprocess(filename):
    with Image.open(filename) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        width, height = image.size
        width, height = int(width * 256 / min(width, height)), int(height * 256 / min(width, height))
        image = image.resize((width, height), Image.Resampling.BILINEAR)
        left, top = (width - 224) // 2, (height - 224) // 2
        pixels = np.asarray(image.crop((left, top, left + 224, top + 224)), dtype=np.float32) / 255
    return ((pixels - np.array([.485, .456, .406], np.float32)) / np.array([.229, .224, .225], np.float32)).transpose(2, 0, 1)[None]

base_bytes = (WORK / 'food101-repaired.onnx').read_bytes()
assert hashlib.sha256(base_bytes).hexdigest() == BASE_SHA, 'Base model integrity mismatch'
base = onnx.load_model_from_string(base_bytes)
feature_name = next(node.input[0] for node in base.graph.node if node.op_type == 'Gemm')
base.graph.output.append(helper.make_tensor_value_info(feature_name, TensorProto.FLOAT, [1, 1280]))
onnx.save(base, WORK / 'features.onnx')
engine = session(WORK / 'features.onnx')
print('Feature extractor ready', flush=True)

while not (WORK / 'dataset.pending.json').exists():
    print('Waiting for labelled image metadata...', flush=True)
    time.sleep(20)
entries = json.loads((WORK / 'dataset.pending.json').read_text())['entries']
pending = list(entries)
completed, invalid = [], []
last_progress = time.monotonic()
while pending:
    remaining = []
    for entry in pending:
        filename = WORK / entry['file']
        cached = WORK / 'features' / (BASE_SHA[:12] + '-' + filename.stem + '.npz')
        if not filename.exists():
            remaining.append(entry)
            continue
        try:
            image_bytes = filename.read_bytes()
            digest = hashlib.sha256(image_bytes).hexdigest()
            if cached.exists():
                values = np.load(cached)
                if str(values['sha256']) != digest:
                    raise ValueError('Changed source image; remove its stale feature cache')
                features, logits = values['features'], values['logits']
            else:
                logits, features = engine.run(None, {'input': preprocess(filename)})
                features, logits = features[0], logits[0]
                np.savez_compressed(cached, features=features, logits=logits, sha256=digest)
            completed.append({**entry, 'sha256': digest, 'features': features, 'logits': logits})
        except Exception as error:
            invalid.append({'file': entry['file'], 'error': str(error)})
        if len(completed) % 100 == 0:
            print(f'Extracted {len(completed)}/{len(entries)} image embeddings', flush=True)
    pending = remaining
    if pending:
        if (WORK / 'dataset.json').exists():
            missing = [entry['file'] for entry in pending]
            invalid.extend({'file': name, 'error': 'Download unavailable'} for name in missing)
            break
        if time.monotonic() - last_progress > 30:
            print(f'{len(completed)} embeddings ready; waiting for {len(pending)} image downloads', flush=True)
            last_progress = time.monotonic()
        time.sleep(3)

test_hashes = {entry['sha256'] for entry in completed if entry['key'].endswith('test')}
train_entries, duplicate_train, seen = [], 0, set()
test_entries, test_seen, duplicate_test = [], set(), 0
for entry in completed:
    if entry['key'].endswith('test'):
        if entry['sha256'] in test_seen:
            duplicate_test += 1
        else:
            test_seen.add(entry['sha256']); test_entries.append(entry)
for entry in completed:
    if not entry['key'].endswith('train'):
        continue
    if entry['sha256'] in test_hashes or entry['sha256'] in seen:
        duplicate_train += 1
        continue
    seen.add(entry['sha256'])
    train_entries.append(entry)
assert len(train_entries) > 1000 and len(test_entries) > 500, 'Insufficient evaluation/training images'
global_labels = json.loads((WORK / 'food101-rows.json').read_text())['features'][1]['type']['names']
global_check = [entry for entry in test_entries if entry['key'] == 'global-test']
base_accuracy = float(np.mean([global_labels[int(np.argmax(entry['logits']))] == entry['label'] for entry in global_check]))
feature_std = float(np.stack([entry['features'] for entry in global_check]).std(0).mean())
print(f'Base export sanity: global accuracy {base_accuracy:.4f}, feature variation {feature_std:.5f}', flush=True)
assert base_accuracy > .5 and feature_std > .001, 'Base model failed the image benchmark; refusing to train or package it'
X = np.stack([entry['features'] for entry in train_entries]).astype(np.float32)
y = np.array([INDIAN.index(entry['label']) if entry['key'] == 'indian-train' else 15 for entry in train_entries])
rng = np.random.default_rng(SEED)
train_indices, val_indices = [], []
for label in range(16):
    indices = np.flatnonzero(y == label)
    rng.shuffle(indices)
    cutoff = max(1, int(len(indices) * .2))
    val_indices.extend(indices[:cutoff])
    train_indices.extend(indices[cutoff:])
train_indices, val_indices = np.array(train_indices), np.array(val_indices)
mean = X[train_indices].mean(0)
scale = np.maximum(X[train_indices].std(0), .1)
X = (X - mean) / scale

def softmax(logits):
    scores = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
    return scores / scores.sum(axis=-1, keepdims=True)

W = rng.normal(0, .005, (1280, 16)).astype(np.float32)
b = np.zeros(16, np.float32)
moments = [np.zeros_like(W), np.zeros_like(W), np.zeros_like(b), np.zeros_like(b)]
groups = [train_indices[y[train_indices] == label] for label in range(16)]
best, best_score, best_epoch, step = None, -1, 0, 0
for epoch in range(150):
    for _ in range(max(20, len(train_indices) // 128)):
        batch = np.concatenate([rng.choice(group, 8, replace=True) for group in groups])
        rng.shuffle(batch)
        probabilities = softmax(X[batch] @ W + b)
        probabilities[np.arange(len(batch)), y[batch]] -= 1
        probabilities /= len(batch)
        grad_w = X[batch].T @ probabilities + .0001 * W
        grad_b = probabilities.sum(0)
        step += 1
        for param, grad, first, second in [(W, grad_w, moments[0], moments[1]), (b, grad_b, moments[2], moments[3])]:
            first *= .9; first += .1 * grad
            second *= .999; second += .001 * grad * grad
            param -= .001 * (first / (1 - .9 ** step)) / (np.sqrt(second / (1 - .999 ** step)) + 1e-8)
    prediction = np.argmax(X[val_indices] @ W + b, axis=1)
    score = float(np.mean([np.mean(prediction[y[val_indices] == label] == label) for label in range(16)]))
    if score > best_score:
        best_score, best_epoch, best = score, epoch, (W.copy(), b.copy())
    if epoch % 5 == 0:
        print(f'Epoch {epoch + 1}: internal validation balanced accuracy {score:.4f}, best {best_score:.4f}', flush=True)
    if epoch - best_epoch >= 20:
        break
W, b = best
validation_logits = X[val_indices] @ W + b
temperature = min([.75, 1., 1.25, 1.5, 2., 2.5, 3.], key=lambda t: np.mean(-np.log(np.maximum(softmax(validation_logits / t)[np.arange(len(val_indices)), y[val_indices]], 1e-9))))
print(f'Selected epoch {best_epoch + 1}; validation balanced accuracy {best_score:.4f}; temperature {temperature}', flush=True)

joint = onnx.load_model_from_string(base_bytes)
for name, values in [('regional.mean', mean), ('regional.scale', scale), ('regional.weight', (W / temperature).T), ('regional.bias', b / temperature)]:
    joint.graph.initializer.append(numpy_helper.from_array(values.astype(np.float32), name))
joint.graph.node.extend([
    helper.make_node('Sub', [feature_name, 'regional.mean'], ['regional.centered']),
    helper.make_node('Div', ['regional.centered', 'regional.scale'], ['regional.normalized']),
    helper.make_node('Gemm', ['regional.normalized', 'regional.weight', 'regional.bias'], ['regional_logits'], transB=1),
])
joint.graph.output.append(helper.make_tensor_value_info('regional_logits', TensorProto.FLOAT, [1, 16]))
onnx.checker.check_model(joint)
onnx.save(joint, WORK / 'snapbite-float.onnx')
global_labels = json.loads((WORK / 'food101-rows.json').read_text())['features'][1]['type']['names']
labels = global_labels + INDIAN

def combine(global_logits, regional_logits):
    regional = softmax(regional_logits)
    return np.concatenate([softmax(global_logits) * regional[15], regional[:15]])

def evaluate(filename):
    engine = session(filename)
    results = []
    for index, entry in enumerate(test_entries):
        start = time.perf_counter()
        global_logits, regional_logits = engine.run(None, {'input': preprocess(WORK / entry['file'])})
        elapsed = (time.perf_counter() - start) * 1000
        scores = combine(global_logits[0], regional_logits[0])
        order = np.argsort(scores)[::-1]
        actual = global_labels.index(entry['label']) if entry['key'] == 'global-test' else 101 + INDIAN.index(entry['label'])
        results.append({'file': entry['file'], 'dataset': entry['dataset'], 'split': entry['split'], 'row': entry['row'], 'actual': labels[actual], 'predicted': labels[int(order[0])], 'top3': [labels[int(i)] for i in order[:3]], 'score': float(scores[order[0]]), 'correct': bool(order[0] == actual), 'top3Correct': bool(actual in order[:3]), 'ms': elapsed, 'sha256': entry['sha256'], 'group': entry['key']})
        if index % 100 == 0:
            print(f'Evaluated {index + 1}/{len(test_entries)} with {Path(filename).name}', flush=True)
    return results

def summarize(results):
    def metrics(items):
        return {'images': len(items), 'top1': float(np.mean([row['correct'] for row in items])), 'top3': float(np.mean([row['top3Correct'] for row in items])), 'medianMs': float(np.median([row['ms'] for row in items])), 'p95Ms': float(np.percentile([row['ms'] for row in items], 95))}
    return {'overall': metrics(results), 'indian': metrics([row for row in results if row['group'] == 'indian-test']), 'global': metrics([row for row in results if row['group'] == 'global-test']), 'perClass': {label: metrics([row for row in results if row['actual'] == label]) for label in sorted({row['actual'] for row in results})}}

float_results = evaluate(WORK / 'snapbite-float.onnx')
float_metrics = summarize(float_results)
selected = WORK / 'snapbite-float.onnx'
quant_metrics = None
weight_only_metrics = None
try:
    from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
    class Calibration(CalibrationDataReader):
        def __init__(self):
            chosen = [rng.choice(group, min(4, len(group)), replace=False) for group in groups]
            self.items = iter([train_entries[int(index)] for indices in chosen for index in indices])
        def get_next(self):
            entry = next(self.items, None)
            return None if entry is None else {'input': preprocess(WORK / entry['file'])}
    quantize_static(str(selected), str(WORK / 'snapbite-int8.onnx'), Calibration(), quant_format=QuantFormat.QDQ, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8, per_channel=True, op_types_to_quantize=['Conv', 'Gemm'])
    quant_results = evaluate(WORK / 'snapbite-int8.onnx')
    quant_metrics = summarize(quant_results)
    if all(quant_metrics[group]['top1'] >= float_metrics[group]['top1'] - .015 for group in ['overall', 'indian', 'global']):
        selected = WORK / 'snapbite-int8.onnx'
        selected_results = quant_results
    else:
        selected_results = float_results
except Exception as error:
    print(f'Quantization not selected: {error}', flush=True)
    selected_results = float_results

# Quantize weights without quantizing activations. This avoids the large accuracy
# drop seen with full static INT8 activation quantization on this small backbone.
if selected.name == 'snapbite-float.onnx':
    weight_only = onnx.load(selected)
    allowed = {'Conv', 'Constant', 'Clip', 'Add', 'GlobalAveragePool', 'Flatten', 'Gemm', 'Sub', 'Div', 'Identity'}
    assert all(node.op_type in allowed for node in weight_only.graph.node), 'Review operator compatibility before changing opset'
    for opset in weight_only.opset_import:
        if opset.domain == '':
            opset.version = max(13, opset.version)
    lookup = {value.name: value for value in weight_only.graph.initializer}
    replacements, nodes = set(), []
    for node in weight_only.graph.node:
        if node.op_type in ['Conv', 'Gemm']:
            name = node.input[1]
            values = numpy_helper.to_array(lookup[name]).astype(np.float32)
            dimensions = tuple(range(1, values.ndim))
            scales = np.maximum(np.max(np.abs(values), axis=dimensions) / 127, 1e-8).astype(np.float32)
            reshape = (len(scales),) + (1,) * (values.ndim - 1)
            quantized = np.clip(np.rint(values / scales.reshape(reshape)), -127, 127).astype(np.int8)
            weight_only.graph.initializer.extend([
                numpy_helper.from_array(quantized, name + '.int8'),
                numpy_helper.from_array(scales, name + '.scale'),
                numpy_helper.from_array(np.zeros(len(scales), np.int8), name + '.zero'),
            ])
            nodes.append(helper.make_node('DequantizeLinear', [name + '.int8', name + '.scale', name + '.zero'], [name], axis=0))
            replacements.add(name)
        nodes.append(node)
    retained = [value for value in weight_only.graph.initializer if value.name not in replacements]
    del weight_only.graph.node[:]; weight_only.graph.node.extend(nodes)
    del weight_only.graph.initializer[:]; weight_only.graph.initializer.extend(retained)
    onnx.checker.check_model(weight_only)
    onnx.save(weight_only, WORK / 'snapbite-int8-weights.onnx')
    weight_only_results = evaluate(WORK / 'snapbite-int8-weights.onnx')
    weight_only_metrics = summarize(weight_only_results)
    if all(weight_only_metrics[group]['top1'] >= float_metrics[group]['top1'] - .015 for group in ['overall','indian','global']):
        selected = WORK / 'snapbite-int8-weights.onnx'
        selected_results = weight_only_results

model_bytes = selected.read_bytes()
(ROOT / 'ml' / 'models').mkdir(exist_ok=True)
(ROOT / 'ml' / 'models' / 'snapbite-v1.onnx').write_bytes(model_bytes)
config = {'version': 'snapbite-v1', 'architecture': 'MobileNetV2 + regional linear head', 'inputName': 'input', 'globalOutput': 'output1', 'regionalOutput': 'regional_logits', 'inputSize': 224, 'resizeShortSide': 256, 'mean': [.485, .456, .406], 'std': [.229, .224, .225], 'labels': global_labels, 'regionalLabels': INDIAN, 'quantized': 'int8' in selected.name, 'quantization': 'int8-weights-float32-activations' if 'int8-weights' in selected.name else 'int8' if 'int8' in selected.name else 'float32', 'modelSha256': hashlib.sha256(model_bytes).hexdigest(), 'modelBytes': len(model_bytes), 'baseModel': 'AlexKoff88/mobilenet_v2_food101', 'baseRevision': '7d05d3878ee7f2aad7ad159018a8e5fdb4953d41', 'regionalDataset': 'bharat-raghunathan/indian-foods-dataset', 'regionalDatasetRevision': 'ef509a8b4bfd46b76530ad329f81586faf904aad'}
(MODEL_DIR / 'config.json').write_text(json.dumps(config, indent=2))
report = {'seed': SEED, 'baseSha256': BASE_SHA, 'baseExportAccuracy': base_accuracy, 'baseFeatureVariation': feature_std, 'trainImagesAfterDeduplication': len(train_entries), 'removedTrainingDuplicatesOrTestOverlap': duplicate_train, 'removedEvaluationDuplicates': duplicate_test, 'fitImages': len(train_indices), 'internalValidationImages': len(val_indices), 'bestEpoch': best_epoch + 1, 'internalValidationBalancedAccuracy': best_score, 'temperature': temperature, 'float': float_metrics, 'int8': quant_metrics, 'weightOnlyInt8': weight_only_metrics, 'selected': selected.name, 'selectedModelSha256': config['modelSha256'], 'invalidImages': invalid, 'results': selected_results}
(REPORTS / 'benchmark.json').write_text(json.dumps(report, indent=2))
np.savez_compressed(WORK / 'regional-head.npz', weight=W, bias=b, mean=mean, scale=scale, temperature=temperature)
print(json.dumps({'selected': selected.name, 'bytes': len(model_bytes), 'metrics': summarize(selected_results)}, indent=2), flush=True)
