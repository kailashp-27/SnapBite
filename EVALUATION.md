# Collecting and evaluating measured meals

This phase adds local evaluation tools and conservative detection cleanup. It does **not** train a food-mass model or establish new portion-accuracy numbers. There are currently no verified weighed-meal examples in the project.

## Collect an example

1. Scan a meal in **Mixed meal** mode. Open **Help improve scanning → Check a measured meal** before leaving the scanner.
2. Name each actual food and explicitly choose its broad family. Match it to an original numbered group, or choose **Missed by scanner**. Add missed foods; remove rows for false detections. One original group can match at most one actual food group.
3. For flatbread, record the actual **visible** piece count. Hidden stacked pieces are not treated as visually measurable ground truth.
4. Enter cooked edible weights only if measured on a kitchen scale. Leave unmeasured weights blank. Choose the appropriate offline recipe reference if you want recipe-conditioned portion scoring.
5. Check the complete box only after verifying every food and measurement. An unchecked draft can be saved but never contributes to accuracy scores. A checked example with no actual foods is a negative/no-food example.
6. Use the same capture-session ID for repeated views of the same meal. Keep future-training data separate from held-out evaluation data. The default split is held out.
7. Optionally retain a compressed JPEG on this device. Saving an evaluation does not add a diary meal. Manage examples in **Settings → Scanner evaluation**.

This is an optional tester workflow. Normal meal logging does not require weighing foods.

## What stays fixed

The scanner records its original groups, bounding boxes, family scores, suggested quantities, suggested recipe IDs, plate diameter and plate-area reference before any review edits. Changing the diary-review count from one to nine does not change the evaluation baseline. The model fingerprint includes the classifier hash, regional-head hash, segmentation hashes, selection version, grouping version and portion method.

After a confirmed recipe reference is supplied, its baseline quantity is converted into grams and frozen with the annotation. Correcting measured weight later does not rewrite that prediction. Updating recipe references deliberately recalculates the conditioned estimate. Historical library updates cannot change the saved food snapshot. Portion-method versions must be bumped when conversion rules change; this is currently `photo-prototype-v1`.

## Scores and their limits

- **Food-group recall:** human-associated matches divided by all actual food groups. A group of chapatis is one group with a separate count. Missed groups reduce recall.
- **Group precision:** matches divided by original predicted groups. Unmatched groups count as false detections. This is a manually associated group evaluation, not an instance-mask IoU benchmark.
- **Family accuracy:** correct broad families among matched groups. It does not establish exact recipe recognition.
- **Visible-piece error:** mean absolute count error for matched flatbread groups with an actual visible count. Coverage shows how many counted groups were scored.
- **Portion error:** mean absolute gram error using the confirmed recipe and original suggested quantity. Bias is the signed mean error; positive means overestimation. Misses, family mismatches, missing references and generic serving fallbacks remain unscored and reduce coverage. This is not end-to-end automatic calorie accuracy.
- **No-food checks:** negative images with false detections are counted explicitly.

Reports are separated by model fingerprint. Incomplete drafts, archived examples and future-training examples do not contribute to held-out scores. Held-out cases sharing a capture session or exact original photo hash with any training case are excluded, including when the training case is archived. Duplicate exact photos within one model's held-out report are scored once. Different angles, edits and near-duplicates still require careful session grouping. The tool does not independently verify human labels, kitchen-scale readings or recipe composition.

## Storage and export

Evaluation cases use a separate IndexedDB table added in database version four. The migration preserves diary, food library and water records. The current collection limit is 200 cases including archived cases. Archiving is reversible and retains the photo. Export frequently; browser storage can be cleared or evicted.

Dataset export is JSON with format `snapbite-meal-evaluation`, version `1`. Compressed photos are optional JPEG data URLs, with a maximum saved image size of 1024 pixels on its longest side. Export without photos when only labels/scores are needed. Diary backups do not include this separate evaluation collection. Imports are validated before an atomic write, skip existing IDs and never overwrite an existing example. Imported files are limited to 100 MB and 200 cases. Photo-inclusive exports are limited to 60 MiB of stored photo bytes to keep the generated JSON manageable.

Nothing is automatically uploaded or used for training. Exporting writes a local file; sharing or uploading it is a separate action.

Reproduce scores locally after installing dependencies:

```sh
npm run evaluate:meals -- snapbite-meal-evaluation.json report.json
```

The browser and CLI use the same validator and scorer. Empty collections and unscored data produce null metrics rather than invented accuracy. The synthetic fixture in `src/evaluation-fixture.ts` verifies arithmetic only; its 35 g error is **not model performance**.

## Detection changes and real-photo audit

Selection version `mask-selection-v3`:

- Rejects a border-framing mask whose foreground covers most of the image perimeter but little of its center. A real rice-plate audit exposed this background frame being classified as food. This is not general non-food rejection and can reject unsuitable tightly cropped photos.
- Removes disconnected speckles only when one connected component contains at least 95% of a mask. Crop boxes and areas are recomputed from the retained mask before classification.
- Requires multiple contained regions covering at least 55% of a parent before treating it as a container. Tiny ingredient fragments alone no longer discard a whole dish. A standalone oval food is no longer assumed to be a plate without contained-region support.
- Prefers supported separate child regions over their overlapping parent and flags broad regions that may contain several foods. Hidden or touching chapatis remain unresolved.

Five previously used public held-out plate photos were audited with real native ONNX inference. Before/after start from the same segmentation proposals; changed crops are reclassified with the same weights. The audit calls the production TypeScript preparation, ranking and selection functions. It records changes in `ml/reports/mixed-selection-v3.json`; the visual diagnostic is `artifacts/mixed-selection-v3-contact.jpg`.

The surrounding background mask is removed and some crop boundaries improve, but wrong families, missed foods and broad plate regions remain visible. The selected-region counts stay 4/10/4/5/2 across these five cases. Counts are not accuracy, and these reused audit photos are not an independent validation set. No measured detection-accuracy gain or gram-accuracy claim is made. An earlier containment-only audit is retained in `mixed-selection-v2.json`.

Reproduce the native diagnostic after preparing the pinned images/models described in `MIXED-MEALS.md`:

```sh
python scripts/export-mixed-proposals.py
npm exec -- tsx scripts/prepare-clean-regions.ts
python scripts/export-mixed-proposals.py --classify-clean
npm exec -- tsx scripts/audit-food-regions.ts
python scripts/render-region-audit.py
```

These scripts need Python, NumPy, Pillow and ONNX Runtime. Native timings are not browser or phone latency measurements.

## Next data milestone

Collect representative original Indian meals with measured cooked portions, reliable recipe references and visible bread counts. Include bowls, stacks, occlusion, lighting changes and negative images. Reserve entire capture sessions before fitting anything. For training an instance detector, this collection still needs independently checked instance boxes or masks; original prediction boxes are not ground truth. Training a depth/volume model will additionally need suitable scale/depth or multiview data. The current tool supplies a reproducible portion/group evaluation foundation rather than all those labels automatically.
