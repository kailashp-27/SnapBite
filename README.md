# SnapBite

A private, offline-first food diary with **working on-device photo recognition**, built with React, TypeScript, Vite, Dexie and ONNX Runtime Web.

## Run

Requires Node.js 22+.

```sh
npm install
npm run dev
```

For the installable PWA and offline reload testing:

```sh
npm test
npm run build
npm run preview
```

The build packages the committed trained weights from `ml/models/snapbite-v1.onnx` and the pinned ONNX runtime. No Python installation, model training, cloud account or external model API is required to run the app.

## Use the snap feature

Local measured-meal evaluation is available under the scanner's **Help improve scanning** section and **Settings → Scanner evaluation**. It keeps original predictions separate from labels, reports errors with coverage, and exports a local dataset. See [EVALUATION.md](EVALUATION.md). No mass model is trained automatically.

**New: Mixed meal (experimental)** is now the default scanner tab. Enable its additional 13.1 MiB model pack, photograph the whole plate, review suggested food regions, choose recipes and correct pieces/sizes/cups. Save all foods together without entering grams. Portion weights use provisional geometry and standard-serving assumptions; accuracy on weighed meals is not yet established. See [MIXED-MEALS.md](MIXED-MEALS.md) for training, native audits, limitations and pending phone/browser checks. The following instructions describe the **Single dish** tab.

1. Open Food scanner and tap **Enable offline scanner** once. The complete model/runtime pack is about **14.3 MiB**; progress and integrity checks are shown.
2. Take a photo or choose one from the gallery. Center a single dish in good lighting.
3. Review the top suggestions. Choose the actual recipe, then confirm servings or weight and the target meal.
4. Save the meal. Daily calories/macros update from the selected nutrition entry.

Photos are decoded and processed locally in a dedicated Web Worker. No photo is uploaded. Completed model downloads persist in Cache Storage, with checksum verification and resumable setup. After the PWA shell and scanner are set up, the scanner works without a server connection. Browser storage can still be cleared or evicted; persistence can be requested in Settings.

There are 101 global classes and 15 additional Indian classes. Supported Indian classes are biryani, chole bhature, dabeli, dal, dhokla, dosa, jalebi, kathi roll, kofta, naan, pakora, paneer, pani puri, pav bhaji and vada pav. **Idli and parotta are not trained classes yet.** Use manual food search for unsupported dishes. A single-label classifier can also misidentify non-food photos or plates containing several foods; every suggestion requires confirmation.

## Measured model results

Automatic routing now uses validation-fitted temperatures and an other-food bias. Overall top-1 increased from 82.4% to 84.8%; global top-1 increased from 63.8% to 75.0%, with Indian top-1 decreasing from 91.0% to 89.3%. See [the before/after report](ml/reports/calibration-benchmark.md).

The selected 3,056,752-byte model uses **INT8 weights and float32 activations**. It combines a repaired, verified pretrained Food-101 MobileNetV2 backbone/global head with a newly trained regional classification/routing head.

| Automatic mode benchmark | Images | First suggestion correct | Correct in top three |
| --- | ---: | ---: | ---: |
| Mixed benchmark | 1,339 | 84.8% | 94.8% |
| Indian subset | 919 | 89.3% | 96.4% |
| Global subset | 420 | 75.0% | 91.2% |

These are measured results on the stated deduplicated dataset subsets, covering 36 food classes, rather than a guarantee for every camera photo. The UI also supports explicit Indian/global modes; the table refers to automatic routing. See [ml/README.md](ml/README.md) for sources, training, the rejected upstream export, quantization comparisons, limitations and reproduction steps. [Current image-level results](ml/reports/calibration-benchmark.json) are retained.

The offline library contains **5,522 entries**: 5,439 USDA nutrition records, 20 explicit reference recipes and 63 existing starter estimates. All 116 model classes have linked nutrition options. See [NUTRITION.md](NUTRITION.md) for exact coverage, sources and limitations. Nutrition is not predicted from pixels. A photo cannot reliably measure weight or calories. Confirm the recipe/portion, or enter nutrition from a label or recipe if a recognized food is missing from the library. USDA FNDDS 2021–2023 and selected SR Legacy records are bundled with calorie/protein/carbohydrate/fat values. No worldwide branded-food database is bundled.

## Phases

| Phase | Implemented | Remaining |
| --- | --- | --- |
| 1. PWA | Vite/React/TypeScript, manifest/icons, service worker, cached app shell | Physical Android/iOS installation tests |
| 2. Local data | IndexedDB foodLibrary/dailyLogs, water, goals, validated imports, backups, nutrition snapshots | Broader Indian recipe validation, micronutrients and branded-food data |
| 3. Tracking UI | Dark responsive dashboard, bottom navigation, portions/weights, daily macros, water, weekly insights, custom foods | More accessibility and usability testing |
| 4. Snap | Real trained/quantized model, camera/gallery, background inference, top-three suggestions, recipe/portion confirmation, local caching and integrity | More Indian classes, mixed-plate detection, robust non-food rejection, broader real-phone testing |
| 5. Deployment | Production build, Netlify configuration, versioned model asset filenames | GitHub/Netlify publishing and live device QA |

## Architecture

- `src/db.ts`, `src/types.ts`: Dexie schema, meal/weight snapshots, local dates, food validation and totals.
- `src/backup.ts`: validated, atomic backup restore; Settings exports complete JSON backups.
- `src/App.tsx`, `src/components/`: dashboard, diary, scanner, search/portion/custom-food dialogs, settings and insights.
- `src/scanner.ts`: photo preprocessing and worker lifecycle.
- `src/scanner.worker.ts`: local ONNX Runtime Web inference off the UI thread.
- `src/scanner-assets.ts`: streamed downloads, content hashes and local scanner cache.
- `src/scanner-math.ts`, `src/food-matching.ts`: score routing, RGB normalization and nutrition-library matches.
- `ml/models/snapbite-v1.onnx`: committed trained source model.
- `scripts/package-scanner.mjs`: reproducible prebuild asset packaging; no network needed.
- `ml/reports/`: native evaluation results and the rejected upstream model audit.

Each meal stores its own nutrition and optional weight snapshot. Updating a library entry does not change past meals. Existing installations receive missing regional starter foods without overwriting imported foods.

## Import a food database

Settings accepts a normalized JSON array, up to 100 MB and 250,000 rows per import. Raw USDA/Open Food Facts dumps need normalization, identifiers, filtering and source/license attribution first. Nutrition must be **per the stated serving**, not automatically per 100 g.

```json
[
  {
    "id": "provider:unique-id",
    "name": "Food name",
    "category": "Indian",
    "serving": "1 bowl",
    "grams": 150,
    "calories": 200,
    "protein": 8,
    "carbs": 30,
    "fat": 5,
    "emoji": "🥣",
    "source": "Provider, identifier, version, license",
    "aliases": ["alternate name"]
  }
]
```

The complete array is validated before an atomic write. Matching IDs update the food library; diary snapshots stay intact. Very large worldwide databases need a future streamed/versioned chunk manifest rather than one large in-memory JSON parse.

## Storage, backups and updates

Data belongs to the current browser/device/origin. Moving from localhost to a hosted domain starts a separate database; export/restore a backup to transfer your diary. Clearing browser data can remove logs and models. There is no account or remote synchronization.

Model assets use content-based filenames and SHA-256 verification. A changed model downloads separately without mixing old weights and new labels. Updating the service worker requires closing all open app tabs and reopening when the update notice appears.

## Netlify

The mixed-meal build additionally requires the two committed source weights listed in `ml/mixed-models.json`. `scripts/package-mixed-models.mjs` verifies and packages them during prebuild.

Push this folder to GitHub and import that repository into Netlify. Build command is `npm run build`; publish directory is `dist`, already configured in `netlify.toml`. Keep `ml/models/snapbite-v1.onnx` in the repository; runtime/generated public assets are recreated from npm dependencies during prebuild.

The PWA needs HTTPS (localhost is allowed). Open online once, enable the scanner, install through the browser menu, then check airplane-mode reload and scanning on physical phones. Service-worker development mode is disabled intentionally. Cache headers do not reserve browser storage indefinitely.

## Verification

See [VERIFICATION.md](VERIFICATION.md) and [the model evaluation notes](ml/README.md). Unit tests verify database snapshots, invalid imports/backups, concurrent water updates, date boundaries, score routing, normalization and food matching. Browser checks cover real food photos and the confirmation/logging flow. Physical device coverage remains a separate check.
