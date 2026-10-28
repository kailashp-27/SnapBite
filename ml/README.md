# SnapBite scanner model

The scanner now includes an actual trained model. It executes in a dedicated Web Worker using ONNX Runtime Web/WebAssembly. It never sends selected photos to a server.

## Architecture and provenance

- Backbone and 101-class global head: MobileNetV2 trained on Food-101 by [AlexKoff88](https://huggingface.co/AlexKoff88/mobilenet_v2_food101), Apache-2.0.
- Pinned upstream revision: `7d05d3878ee7f2aad7ad159018a8e5fdb4953d41`.
- Checkpoint SHA-256: `42cd5d9988f0830588b3be5107197c9b622c9b73426377975c07e8b24e346680`.
- Regional dataset: [bharat-raghunathan/indian-foods-dataset](https://huggingface.co/datasets/bharat-raghunathan/indian-foods-dataset), declared CC0-1.0, revision `ef509a8b4bfd46b76530ad329f81586faf904aad`.
- Regional head: a new linear classifier trained on frozen 1,280-dimensional backbone features for 15 Indian dishes plus an other-food routing class. Original global-head weights are preserved.
- Browser runtime: ONNX Runtime Web 1.23.2, MIT.

The source checkpoint is the author's trained checkpoint at epoch 27. The separately supplied upstream ONNX file failed our checks: its features were almost zero and did not recognize the test images. It was rejected. `repair-base-model.py` reconstructs the identical convolution graph from the verified checkpoint, folds inference BatchNorm into 52 convolutions, and prunes unused random initializers. The repaired base alone scored 78.1% top-1 on our 420-image global subset. The rejected artifact's diagnostic results are retained in `reports/rejected-upstream-export.json`.

The checkpoint reader accepts only an explicit list of tensor-storage and reconstruction records; it does not call unrestricted `pickle.load` or execute remote training code. It checks the exact checkpoint hash before reading.

## Training

Downloaded 5,610 labelled images:

| Group | Images | Purpose |
| --- | ---: | --- |
| Indian training split | 3,809 | Train/validate regional classifier |
| Food-101 training subset | 420 | Other-food routing examples, across 21 classes |
| Indian test split | 961 | Evaluation only |
| Food-101 validation subset | 420 | Evaluation only, across 21 classes |

Removed 686 duplicate training images or exact training/test overlaps and 42 duplicate evaluation images. This leaves 3,543 training-pool images and 1,339 evaluation images. Of the training pool, 2,839 fit the head and 704 form a stratified internal validation set. Feature normalization is fitted on the fitting subset only. Test images are not used for fitting, early stopping or temperature selection.

Training uses seed 42, class-balanced mini-batches, Adam at 0.001, L2 regularization 0.0001, and early stopping on internal validation balanced accuracy. Epoch 6 was selected (90.1% internal validation balanced accuracy). Temperature selection uses internal validation only; the selected temperature is 1.0. The backbone and original Food-101 classifier are frozen.

During automatic recognition, the regional head assigns mass to its 15 dishes and to other food. The other-food mass is distributed over the original 101-class global head. The UI also allows explicit Indian/global modes. Reported mixed metrics refer to the default automatic mode.

## Routing calibration update

The current classifier uses validation-fitted global/regional temperatures (0.75/0.9) and an other-food bias (+4.1). Parameters were frozen on the original 704-image internal validation split before test evaluation. The INT8 backbone and regional weights are unchanged. Overall top-1 increased 82.4% → 84.8%; global top-1 increased 63.8% → 75.0%, with Indian top-1 decreasing 91.0% → 89.3%. See [the complete before/after report](reports/calibration-benchmark.md), frozen calibration.json, and calibration-benchmark.json.

## Measured evaluation

Selected model: **INT8 weights with float32 activations**, 3,056,752 bytes (about 2.9 MiB). Its SHA-256 is `6e7a5cd6e76faafaef16905a2a0baa4a2bb066017af5383d85d1250c06323f5e`.

| Automatic mode | Unique test images | Top-1 | Top-3 |
| --- | ---: | ---: | ---: |
| Mixed benchmark | 1,339 | 84.8% | 94.8% |
| Indian dishes | 919 | 89.3% | 96.4% |
| Global subset | 420 | 75.0% | 91.2% |

Top-1 means the first suggestion is correct; top-3 means the correct dish is among three suggestions. Current image-level outputs are in `reports/calibration-benchmark.json`; original per-class scores and outputs remain in `reports/benchmark.json`.

Full static INT8 quantization of both weights and activations reduced mixed top-1 to 70.6%, so it was rejected. Weight-only INT8 retained the float model's mixed top-1 accuracy while reducing weights from 9,978,761 to 3,056,752 bytes. This is a download/storage optimization, not a claim of faster integer-only inference. The one-time offline pack, including the WebAssembly engine, is about 14.3 MiB.

These are engineering benchmark results on the stated subsets, not an independent product certification. Quantization candidates were compared on this same benchmark. The global subset covers 21 of the original 101 classes, and all regional test photos come from the one stated dataset. Exact-byte duplicate removal does not remove all near-duplicates. Phone-photo quality, different regional recipes, camera conditions and unsupported classes can reduce accuracy. Native CPU timings are not phone timings.

## Supported regional classes

Biryani, chole bhature, dabeli, dal, dhokla, dosa, jalebi, kathi roll, kofta, naan, pakora, paneer, pani puri, pav bhaji, vada pav.

Idli and parotta are not trained classes. The model assumes one dominant dish; it does not detect or segment multiple foods, reliably reject every non-food image, estimate portion weight, or measure calories from pixels. Scores have validation-set calibration, but are not guaranteed correctness probabilities on real camera photos. Every result requires food/recipe and portion confirmation before logging. Nutrition comes from the selected library entry, not from the neural network.

## Reproduce

Requires Python 3.12+, Node.js and the application's npm dependencies. Keep evaluation tooling separate from the app runtime:

```powershell
python -m pip install --target .ml-work/python onnxruntime==1.23.2 onnx==1.19.1 numpy pillow
node scripts/download-trained-base.mjs
node scripts/prepare-ml-data.mjs
python scripts/repair-base-model.py
python scripts/train-scanner.py
python scripts/calibrate-scanner.py
npm run scanner:package
npm test
npm run build
```

Dataset preparation caches pages and downloads, respects service rate limits and can resume. Training caches embeddings under the verified base-model hash. The evaluation scripts write only under this checkout. Raw images and Python tools are ignored under `.ml-work/`; they are never included in `dist`.

## Packaging and offline integrity

The trained source weights are tracked at `ml/models/snapbite-v1.onnx`. A prebuild script verifies the trained hash, copies the exact ONNX runtime files, computes SHA-256 for all three required assets, and gives each a content-based filename. Generated assets are ignored in Git and recreated by every build.

The user enables the scanner once. The app streams its assets with progress, verifies sizes and SHA-256, and stores completed files in Cache Storage. Interrupted setup retains completed files. Startup validates the cache again; the worker receives model/runtime bytes from local storage and uses Blob URLs, so inference does not require a CDN or an active service worker. Reloading the whole app offline still requires the PWA app shell/worker script to have been cached.
