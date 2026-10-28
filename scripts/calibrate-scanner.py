"""Fit score calibration on the original validation split, then benchmark once.

The frozen quantized backbone and regional head are unchanged. No test scores
are inspected until calibration.json has been written with frozen parameters.
"""
from pathlib import Path
import hashlib
import json
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.ml-work'
sys.path.insert(0, str(WORK / 'python'))
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

CONFIG = ROOT / 'public/models/snapbite-v1/config.json'
REPORTS = ROOT / 'ml/reports'
config = json.loads(CONFIG.read_text())
original = json.loads((REPORTS / 'benchmark.json').read_text())
base_sha = original['baseSha256']
model = ROOT / 'ml/models/snapbite-v1.onnx'
assert hashlib.sha256(model.read_bytes()).hexdigest() == config['modelSha256']
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
engine = ort.InferenceSession(str(model), options, providers=['CPUExecutionProvider'])
labels = config['labels'] + config['regionalLabels']

def preprocess(filename):
    with Image.open(filename) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        w, h = image.size
        w, h = int(w * 256 / min(w, h)), int(h * 256 / min(w, h))
        image = image.resize((w, h), Image.Resampling.BILINEAR)
        x, y = (w - 224) // 2, (h - 224) // 2
        pixels = np.asarray(image.crop((x, y, x + 224, y + 224)), dtype=np.float32) / 255
    return ((pixels - np.array(config['mean'], np.float32)) / np.array(config['std'], np.float32)).transpose(2, 0, 1)[None]

entries = json.loads((WORK / 'dataset.pending.json').read_text())['entries']
for entry in entries:
    cached = np.load(WORK / 'features' / (base_sha[:12] + '-' + Path(entry['file']).stem + '.npz'))
    entry['sha256'] = str(cached['sha256'])
test_hashes = {e['sha256'] for e in entries if e['key'].endswith('test')}
seen, training = set(), []
for entry in entries:
    if not entry['key'].endswith('train') or entry['sha256'] in seen or entry['sha256'] in test_hashes:
        continue
    seen.add(entry['sha256'])
    training.append(entry)
assert len(training) == original['trainImagesAfterDeduplication']
# Reconstruct precisely the split used by train-scanner.py (before its RNG
# consumes any weight-initialization or minibatch draws).
y = np.array([config['regionalLabels'].index(e['label']) if e['key'] == 'indian-train' else 15 for e in training])
rng = np.random.default_rng(original['seed'])
validation = []
for label in range(16):
    indices = np.flatnonzero(y == label)
    rng.shuffle(indices)
    validation.extend(training[int(i)] for i in indices[:max(1, int(len(indices) * .2))])
assert len(validation) == original['internalValidationImages']
assert not ({e['sha256'] for e in validation} & test_hashes)

def outputs(items):
    global_rows, regional_rows = [], []
    folder = WORK / 'calibration-logits' / config['modelSha256'][:12]
    folder.mkdir(parents=True, exist_ok=True)
    for i, entry in enumerate(items):
        filename = WORK / entry['file']
        assert hashlib.sha256(filename.read_bytes()).hexdigest() == entry['sha256']
        cache = folder / (entry['sha256'] + '.npz')
        if cache.exists():
            values = np.load(cache)
            g, r = values['global_logits'], values['regional_logits']
        else:
            g, r = engine.run(None, {'input': preprocess(filename)})
            g, r = g[0], r[0]
            np.savez_compressed(cache, global_logits=g, regional_logits=r)
        global_rows.append(g); regional_rows.append(r)
        if (i + 1) % 200 == 0:
            print(f'Computed {i + 1}/{len(items)} quantized image scores', flush=True)
    return np.stack(global_rows), np.stack(regional_rows)

def softmax(values):
    scores = np.exp(values - values.max(axis=1, keepdims=True))
    return scores / scores.sum(axis=1, keepdims=True)

def combine(g, r, parameters):
    regional = r.astype(np.float64) / parameters['regionalTemperature']
    regional[:, -1] += parameters['otherBias']
    regional = softmax(regional)
    return np.concatenate([softmax(g / parameters['globalTemperature']) * regional[:, -1:], regional[:, :-1]], axis=1)

g, r = outputs(validation)
actual = np.array([labels.index(e['label']) for e in validation])
counts = np.bincount(actual, minlength=len(labels))
weights = 1 / counts[actual]
weights /= weights.sum()

def loss(parameters):
    scores = combine(g, r, parameters)
    return float(np.sum(-np.log(np.maximum(scores[np.arange(len(actual)), actual], 1e-12)) * weights))

baseline = {'globalTemperature': 1., 'regionalTemperature': 1., 'otherBias': 0.}
best, best_loss = baseline.copy(), loss(baseline)
for tg in [.5, .75, 1., 1.25, 1.5, 2., 2.5, 3.]:
    for tr in [.5, .75, 1., 1.25, 1.5, 2., 2.5, 3.]:
        for bias in np.arange(-2., 8.01, .5):
            candidate = {'globalTemperature': tg, 'regionalTemperature': tr, 'otherBias': float(bias)}
            candidate_loss = loss(candidate)
            if candidate_loss < best_loss:
                best, best_loss = candidate, candidate_loss
coarse = best.copy()
for tg in np.arange(max(.25, coarse['globalTemperature'] - .3), coarse['globalTemperature'] + .301, .1):
    for tr in np.arange(max(.25, coarse['regionalTemperature'] - .3), coarse['regionalTemperature'] + .301, .1):
        for bias in np.arange(coarse['otherBias'] - .5, coarse['otherBias'] + .501, .1):
            candidate = {'globalTemperature': round(float(tg), 3), 'regionalTemperature': round(float(tr), 3), 'otherBias': round(float(bias), 3)}
            candidate_loss = loss(candidate)
            if candidate_loss < best_loss:
                best, best_loss = candidate, candidate_loss
calibration = {
    'method': 'validation-only temperature scaling and other-food logit bias',
    'objective': 'class-balanced 116-way negative log likelihood on the represented validation classes',
    'modelSha256': config['modelSha256'], 'parameters': best,
    'validationImages': len(validation), 'validationClasses': int(np.count_nonzero(counts)),
    'baselineValidationNll': loss(baseline), 'calibratedValidationNll': best_loss,
    'validationImageHashes': sorted(e['sha256'] for e in validation),
    'reference': 'https://proceedings.mlr.press/v70/guo17a.html',
}
frozen = json.dumps(calibration, indent=2).encode()
(REPORTS / 'calibration.json').write_bytes(frozen)
print('FROZEN validation-only calibration: ' + json.dumps(best), flush=True)

# Parameters are now frozen. Test scores are used only for the before/after report.
test = original['results']
test = [{**entry, 'label': entry['actual'], 'key': entry['group']} for entry in test]
g, r = outputs(test)

def summarize(scores):
    order = np.argsort(-scores, axis=1)
    actual = np.array([labels.index(e['label']) for e in test])
    correct = order[:, 0] == actual
    top3 = np.any(order[:, :3] == actual[:, None], axis=1)
    def metric(indices):
        return {'images': int(indices.sum()), 'top1': float(correct[indices].mean()), 'top3': float(top3[indices].mean())}
    groups = np.array([e['group'] for e in test])
    return {name: metric(np.ones(len(test), bool) if name == 'overall' else groups == name + '-test') for name in ['overall', 'indian', 'global']}, order, correct, top3

before, _, _, _ = summarize(combine(g, r, baseline))
after, order, correct, top3 = summarize(combine(g, r, best))
selected = after['overall']['top1'] > before['overall']['top1'] and after['indian']['top1'] >= before['indian']['top1'] - .02
report = {'modelSha256': config['modelSha256'], 'calibrationSha256': hashlib.sha256(frozen).hexdigest(), 'parametersFrozenBeforeTestEvaluation': True, 'selected': selected, 'before': before, 'after': after, 'results': [{
    'file': e['file'], 'actual': e['label'], 'predicted': labels[int(order[i, 0])],
    'top3': [labels[int(j)] for j in order[i, :3]], 'correct': bool(correct[i]), 'top3Correct': bool(top3[i]), 'group': e['group']
} for i, e in enumerate(test)]}
(REPORTS / 'calibration-benchmark.json').write_text(json.dumps(report, indent=2))
if selected:
    config['routing'] = best
    config['calibrationRevision'] = 'validation-calibrated-v1'
    CONFIG.write_text(json.dumps(config, indent=2) + '\n')
print(json.dumps({'selected': selected, 'before': before, 'after': after}, indent=2), flush=True)
