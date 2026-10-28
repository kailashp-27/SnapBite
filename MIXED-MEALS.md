# Experimental offline mixed-meal scanner

The next implementation phase adds mask cleanup and a local weighed-meal evaluation collection. See [EVALUATION.md](EVALUATION.md) for capture, scoring, data separation and the real-photo audit. This has not established new model-accuracy figures or trained a mass regressor.

The scanner now defaults to **Mixed meal**. Single-dish recognition remains available in the adjacent tab. Enable the additional model pack once, photograph the whole plate, review the proposed food groups, choose recipes, and correct visible piece counts, piece sizes or cups. Confirming saves every food in one database transaction, with nutrition snapshots and explicit photo-estimate metadata. No gram entry is required. Missing foods can be added and recipes can be replaced using the full offline nutrition library.

## What runs locally

- Quantized SlimSAM proposes regions from a 25-point grid. Overlap and container filters reduce duplicate regions.
- The existing Food-101/regional classifier scores region crops. A newly trained four-family head proposes flatbread, curry, rice or other. Flatbread recipe selection is required because these families do not distinguish chapati from naan reliably.
- Visible bread regions suggest a count. Projected area, an optional saved plate diameter, assumed food depth and reference serving weights suggest portions. A missing plate outline uses an assumed area; the UI states this explicitly.
- After scanning, **Set plate outline** opens an adjustable oval. Fit it to the full rim of a round plate using width, height and position controls. This replaces the assumed projected area for that photo; Reset returns to the model/assumed reference. Suggested portions update, while quantities already edited by the user stay fixed. The saved estimate includes its area fraction and reference source; backups retain this information. Saving a plate diameter without an outline no longer narrows the provisional range.
- The final recipe's local nutrient values scale to the estimated portion. The added paneer curry entry is a disclosed ingredient-based reference recipe, not a measurement of a photographed sauce.

Photos are processed in the worker and are not uploaded. The existing pack is about 14.3 MiB; segmentation adds about 13.1 MiB. Downloads are hash checked and cached separately from the app shell. Browser storage eviction remains possible. Model setup needs a connection once; physical-phone offline behavior still needs testing for this new mode.

## Model provenance and training

SlimSAM comes from [Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform), pinned to revision `5850ab45f587c112167512ffef949107115e26a0`, under Apache-2.0. Source filenames, SHA-256 hashes and revision are recorded in `ml/mixed-models.json`; packaging verifies them before producing content-addressed assets. The base classifier and its sources are documented in `ml/README.md`.

The new family head uses 117 raw classifier logits and a regularized linear softmax layer. Training uses the existing deduplicated food-image corpus plus 95 manually reviewed plate-region crops. Manual labels and excluded crops are recorded in `scripts/mixed-region-labels.json`. Plate images come from [SohlHealth/sohl-multidish-yolo-dataset](https://huggingface.co/datasets/SohlHealth/sohl-multidish-yolo-dataset), revision `ef83f6636e5d9e0593aeaecae49ef05ef418693a`, whose card declares MIT. Augmentations were grouped by original filename before splitting. Its published category IDs visibly disagreed with the foods; they were rejected. An earlier background-head experiment was also rejected because unannotated foods were being treated as background.

The final held-out **whole-food-photo family classification** result is 81.1% accuracy on 1,339 images, with 89.7% balanced accuracy. This is not mixed-plate detection accuracy, recipe accuracy, counting accuracy or weight accuracy. See `ml/reports/meal-regions.json`. Five separate held-out plate photos were run through the real native ONNX pipeline; outputs and timings are in `ml/reports/mixed-native-integration.json`. Around 5–7 seconds on this computer's two-thread native CPU runtime is not a browser or phone timing claim.

## Accuracy limits and next training milestone

This is a reviewable prototype, not accurate measurement of every food. Tests still show missed, duplicate, partial and incorrectly classified food regions. Stacked chapatis, bowls, perspective, hidden sauce ingredients and unknown depth cannot be recovered reliably from one ordinary photo. Portion weights are heuristics, not the output of a trained mass regressor. Displayed ranges are provisional, not calibrated confidence intervals. A known plate diameter helps scale but does not resolve these uncertainties.

The next meaningful training dataset needs original Indian mixed-meal photos with instance masks, visible and total bread counts, known plate/bowl dimensions, weighed component portions and recipe information. Hold out entire meals, contributors and capture sessions. Measure count error, food identification, gram error and resulting calorie error separately before making accuracy claims. Two views or depth data could improve volume estimates but are not implemented here.

## Reproduction

The app build needs only Node.js 22+ and the committed ONNX weights. Training/audits additionally need Python, NumPy, Pillow and ONNX Runtime; download and training scripts need network access for their pinned datasets.

```sh
node scripts/prepare-mixed-data.mjs
python scripts/prepare-mixed-crops.py
python scripts/train-meal-regions.py
python scripts/validate-mixed-meals.py
npm test
npm run build
```

The training script also expects the original classifier's prepared food data/features documented in `ml/README.md`. Download caches stay under `.ml-work` and are excluded from the PWA. Audit images under `artifacts/mixed-native-test-*.jpg` are model diagnostics, not application screenshots.

Component interaction tests cover recipe confirmation, count correction, invalid quantities, offline-food replacement, plate fitting, preservation of edited quantities and batch logging. The next development pass restored browser testing and verified real WebAssembly mixed-meal inference, plate editing, offline library search, three-food diary logging and a server-stopped reload on an isolated preview origin. See the dated checks in `VERIFICATION.md`. Physical-phone camera, memory, latency and quantity-accuracy validation remain pending.
