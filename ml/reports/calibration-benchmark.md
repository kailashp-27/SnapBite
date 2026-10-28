# Routing improvement — October 25, 2026

The deployed classifier uses the existing INT8-weight MobileNet and regional head plus validation-fitted score calibration. No additional model download or inference pass is needed.

| Group | Images | Before top-1 | After top-1 | Before top-3 | After top-3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| overall | 1339 | 82.4% | 84.8% | 94.2% | 94.8% |
| indian | 919 | 91.0% | 89.3% | 98.2% | 96.4% |
| global | 420 | 63.8% | 75.0% | 85.5% | 91.2% |

## Method

Reconstructed the original seed-42 training/validation split after exact-byte deduplication and train/test overlap removal. The 704 validation images (36 classes) have no exact image-hash overlap with the 1,339 test images. Computed logits with the actual packaged quantized model. Selected global temperature 0.75, regional temperature 0.9 and an other-food logit bias of +4.1 by minimizing class-balanced negative log likelihood on validation images only. Coarse grid plus local refinement is deterministic.

Wrote the frozen parameters and validation hashes to calibration.json before evaluating test logits. The model weights and supported classes are unchanged. The UI applies the bias only in automatic mode; explicit cuisine modes retain their original within-cuisine ranking. A ready scanner also saves updated configuration for offline reloads without downloading unchanged model/runtime assets.

Validation class-balanced NLL: 0.9473 → 0.7335.

## Tradeoff and limits

The stronger global-food routing improves total top-1 by 2.4 percentage points and global top-1 by 11.2 points, with a 1.6-point Indian top-1 decrease. Indian-only mode remains available. This is a comparison on the existing engineering benchmark, which was previously used for quantization selection; it is not an independent fresh production evaluation. Temperature/bias fitting did not use test images or labels. Exact deduplication does not rule out near-duplicates, and the dataset is not representative of every phone photo.

The method follows post-hoc logit calibration; temperature scaling is described in [Guo et al., ICML 2017](https://proceedings.mlr.press/v70/guo17a.html). The additional other-food bias corrects this application’s two-head routing imbalance; it is not a claim that temperature scaling alone changes class rankings. Displayed scores remain model scores, not guaranteed real-world correctness probabilities.

## Reproduce

Run `python scripts/calibrate-scanner.py` after the original training pipeline, then `npm run build`. Full before/after image predictions are retained in calibration-benchmark.json; the original baseline is retained in benchmark.json.
