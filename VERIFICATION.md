# Verification — October 25, 2026

## October 26: detection cleanup and measured-meal evaluation

- **58 tests in 13 suites pass**, plus production TypeScript/Vite/PWA build (15 shell entries, 3270.50 KiB). New checks cover parent/child selection, frame-background rejection, conservative speckle cleanup, frozen prediction/reference estimates, missed-food coverage, negative examples, training/session leakage, duplicate-photo exclusion, validation and atomic import. A database-version-three fixture upgrades to version four while preserving an existing meal and water record.
- Added local evaluation capture under the scanner's Help improve scanning disclosure and management/scoring under Settings. Cases preserve original model suggestions and scale before review edits. Actual labels/weights/counts and recipe references are separate. Scores distinguish eligible held-out data, training cases, drafts, missing predictions and unscored weighed foods. Recipe-conditioned gram estimates are frozen when labeled. Archived examples can be restored. Photos remain local and are exported separately from the diary backup.
- Browser QA used isolated origin `127.0.0.1:5178`. Imported an explicitly synthetic arithmetic fixture and verified the UI's 35.0 g mean error, +15.0 g bias and 2/3 weighed-group coverage match the CLI/test calculation. These are synthetic test values, not model performance. Archived that fixture before testing real capture.
- Ran the real browser model pipeline on public plate photo `100_png.rf.779c1f1323c61a252def91ee44b0b287.jpg`. Changed the normal review count to nine and confirmed the evaluation still records the original one-piece prediction. Saved provisional visual labels and a visible count of two as an **unchecked draft**, leaving every unmeasured gram field blank. The annotation reopened with its labels intact, and no diary meal was logged.
- Downloaded the actual browser dataset and validated it using the same CLI. It contains the original count of one, the separate label count of two, a source-photo hash and a valid compressed 1024 × 803 JPEG. The archived synthetic case and unchecked real-photo draft contribute no accuracy values; their eligible report correctly contains null scores. Download-event verification initially lost its browser connection, then passed after recovery with handled event errors.
- Loaded the production build on that isolated origin, stopped its server and confirmed connection refusal. Reloaded the cached PWA, reopened the saved photo/annotation and exported the dataset successfully with the server still stopped. This verifies the new evaluation workflow offline, not physical-phone camera or battery behavior.
- At 390 × 844, annotation-dialog client/scroll widths match at 346 px and document widths match at 390 px. Restored the viewport after capture. Screenshot: `artifacts/snapbite-evaluation-mobile.png`.
- Native before/after audit uses five reused public plate photos, identical segmentation proposals and the same real classifier weights; changed crop boxes are reclassified. Production TypeScript handles the new preparation, family ranking and selection. Reports: `ml/reports/mixed-selection-v2.json` (containment-only experiment) and `mixed-selection-v3.json` (shipped cleanup). Visual: `artifacts/mixed-selection-v3-contact.jpg`. A background-framing mask is rejected and crop boundaries change, while incorrect families, missed foods and broad regions remain. Selected counts remain 4/10/4/5/2; those counts are not accuracy. These reused diagnostics are not independent held-out validation.
- No food-mass model was trained in this phase and no real weighed-meal accuracy is claimed. Exact recipe, mask, gram and physical-phone validation remain outstanding. See `EVALUATION.md` for collection, scoring, export and audit reproduction. No evaluation records or test meals were added to the main app origin at port 4174.

## October 26: fitted plate scale and completed browser checks

- Added a per-photo oval plate editor with keyboard/touch sliders, a visible scale overlay, reset and saved reference metadata. Changing the outline updates untouched suggestions while preserving edited quantities. New photos reset the outline. A saved diameter with an assumed pixel area keeps the broader provisional range.
- Correcting a bread suggestion to a curry now changes the portion controls; other foods use their reference serving instead of retaining flatbread weights. Corrections within the same family preserve edited quantities.
- **41 tests across nine suites pass.** Added geometry/invalid-reference checks, scale/range checks, recipe-type correction and an interaction test proving edited quantities survive subsequent plate changes. Backup validation preserves valid reference metadata and rejects malformed values. Production TypeScript/Vite/PWA build passes (15 shell entries, 3241.60 KiB).
- Browser automation recovered. In isolated production preview `127.0.0.1:4177`, downloaded and initialized the real WebAssembly model pack; ran held-out plate photo `100_png.rf.779c1f1323c61a252def91ee44b0b287.jpg`. Fitted an outline, corrected foods to parotta/dal/plain yogurt, selected two medium pieces, one cup and half a reference yogurt container, and saved three estimated diary entries totaling 912 kcal. These are chosen test recipes and quantities, not evidence the photo's actual nutrition was recovered. No test meals were added to the main origin at port 4174.
- Stopped the isolated server and confirmed connection refusal. Reloaded the cached PWA: the three diary entries persisted. Ran a different held-out photo `42_png.rf.719bf1c3c1c24de77b6bbf70a0dbf4fd.jpg` through cached segmentation/classification and opened/applied its plate editor with the server still stopped. No captured browser warnings/errors. This tests server-unavailable operation, not physical-phone airplane mode.
- Fixed editor padding and a 4-pixel range-input overflow discovered visually. Desktop dialog client/scroll widths match at 453 px. At a 390 × 844 mobile viewport, dialog widths match at 346 px and page widths match at 390 px; the scanner page is 375/375 with its scrollbar. All controls remain reachable through normal modal scrolling. Restored the viewport override afterward.
- Screenshot: `artifacts/snapbite-plate-calibration-mobile.png`. Quantity estimates remain unvalidated, and the model still misses/misclassifies regions. Physical-phone camera, memory/latency and weighed-meal evaluation remain pending.
- Restored the main preview at port 4174 and enabled its mixed-meal model pack. Isolated QA tabs were closed and their server remains stopped. Existing main-origin diary entries were not used for test writes.

## October 26: experimental mixed-meal implementation

- All **36 tests across eight suites pass**, including React interaction tests for recipe confirmation, suggested visible-piece counts, count correction, invalid portions, offline library replacement and batch logging. Database tests verify atomic nutrition/estimate snapshots. React interaction tests use mocked model outputs; they do not measure recognition accuracy.
- Production TypeScript/Vite/PWA build passes: 15 shell entries, 3236.05 KiB. Content-hashed segmentation assets add 13.1 MiB to the separately enabled model cache.
- Verified real quantized SlimSAM encoder/decoder inputs, outputs and pinned source hashes. Ran the complete native model pipeline on five held-out plate photos; diagnostic outputs and timings are in `ml/reports/mixed-native-integration.json`. Native CPU timings are not browser or mobile results.
- Trained a four-family head with 95 manually reviewed plate crops and the existing food-image corpus. Held-out whole-food family classification: 81.1% on 1,339 images. This does not measure plate segmentation, counting or gram accuracy. Incorrect source category labels and an earlier background-head experiment were rejected.
- No weighed-portion ground truth is available. Region detection still misses/misclassifies foods; quantity estimates and ranges are explicitly provisional. Recipe/count/cup review is required. See `MIXED-MEALS.md` for reproduction and limitations.
- New browser-WASM, visual layout and physical-phone checks remain pending: browser automation failed at startup with `failed to write kernel assets` / missing path. Native inference, server rendering and JSDOM tests do not replace these checks. The browser results below are historical checks of the single-dish mode.
- Existing user meal logs were not changed by this implementation's tests. The additional paneer reference recipe is added lazily, bringing a default library from 5,522 to 5,523 entries.

## Passed

- **Automated checks:** 27 tests passed across database/backup, recognition math, and scanner asset caching. Tests include nutrition/weight snapshots, invalid portions/imports, calendar boundaries, concurrent water changes, score routing, NCHW normalization, interrupted-download recovery, and rejection of corrupted model bytes.
- **Production build:** TypeScript and Vite build passed. The PWA precaches 13 app-shell entries totaling about 509 KiB. The scanner's separate 14.3 MiB model/runtime pack is downloaded only when enabled.
- **Real model:** verified the upstream checkpoint hash; reconstructed the trained backbone; trained the regional head; exported and compared float, full-INT8 and weight-only-INT8 versions. The selected 3,056,752-byte artifact has SHA-256 `6e7a5cd6e76faafaef16905a2a0baa4a2bb066017af5383d85d1250c06323f5e`.
- **Image benchmark:** 1,339 unique evaluation images across 36 food classes. Automatic-mode top-1/top-3: 84.8%/94.8% overall, 89.3%/96.4% for the 919 Indian images, and 75.0%/91.2% for the 420 global images. Calibration used only the original 704 validation photos; frozen parameters and the full before/after tradeoff are in `ml/reports/calibration-benchmark.md` and `.json`. The baseline remains in `benchmark.json`. See `ml/reports/benchmark.md`, `benchmark.json` and `predictions.csv`.
- **Upstream rejection:** the initially downloaded ONNX artifact produced nearly zero features and failed the image benchmark. It was not deployed; its diagnostic report is preserved.
- **Browser photo checks:** selected held-out photos of biryani, dosa, pizza, paneer and naan produced the correct first suggestion in the actual WebAssembly worker. Observed inference was around or below 0.1 seconds on this computer; this is not a phone speed claim.
- **Photo → diary:** biryani recognition offered chicken and vegetable recipes. Selecting vegetable biryani, entering 250 g and choosing Dinner saved a 350 kcal meal in the isolated development preview at port 5175. No new production meal logs were inserted by this scanner verification.
- **Missing nutrition:** choosing an unmatched recognized dish opened a custom-food form with explicit serving and nutrition inputs, rather than inventing calories.
- **Production offline recognition:** after enabling the scanner, stopped the server at port 4174 and confirmed the address refused connections. Reloaded the PWA, reopened the scanner, and recognized a new naan photo using the cached worker/model/runtime. Its local portion-confirmation dialog also opened without a server.
- **Upgrade:** the main preview's existing local diary was retained. Missing regional starter foods were added without replacing existing library entries.
- **Responsive layout:** checked the scanner at 390 × 844 and 1280 × 1000. Document scroll width equalled client width (375 and 1265 CSS pixels respectively); there was no horizontal overflow.
- **Browser runtime:** no application errors observed during model setup and normal recognition. A network failure during the server-stopped reload is expected and handled by the cached-manifest fallback.

## October 25 refinement checks

- Removed diary promotional copy, scanner promotion, page slogans, macro taglines and decorative footer copy.
- Centered all four meal plus icons: 28 × 28 buttons with zero measured center offset (desktop floating-point vertical residual <0.001 px). Checked at the normal desktop viewport and 390 × 844 mobile viewport, with no mobile horizontal overflow.
- Insights has no calendar input and shows the current last-seven-day range even after choosing a different diary date. Existing diary and water data were preserved; no meal logs were added during refinement verification.
- Actual WebAssembly worker now recognizes the pizza photo `global-test-2554.jpg` (previous baseline: dabeli).
- Stopped preview server, confirmed connection refusal, reloaded the PWA and recognized `global-test-15057.jpg` as onion rings (previous baseline: jalebi). This verifies that calibration persists through an offline cold reload with existing cached weights.
- Added regression checks for calibration math, explicit cuisine modes, invalid temperatures and offline config upgrades without repeat downloads.
- Production TypeScript/Vite build and 27 tests pass.

## Scope and remaining checks

- Test coverage includes all 15 regional classes but only 21 of the 101 original global classes. These are dataset-subset engineering results; quantization selection used the same evaluation corpus. They are not independent production certification or an estimate of every phone-photo distribution.
- Exact-byte duplicates were removed; near-duplicates and imperfect source labels may remain. New phone photos, recipes, blur, lighting and framing can reduce accuracy.
- The model assumes one dominant dish. It does not segment mixed plates, robustly reject every non-food image, recognize all Indian dishes, or measure portion weight/calories. Idli and parotta are unsupported classes. All results require confirmation.
- Nutrition library values remain starter estimates. The larger licensed global nutrition dataset is not included.
- Physical Android/iOS camera permission flows, PWA installation, airplane-mode operation and battery/memory/latency still need real-device testing. Server-unavailable recognition verifies cached assets, not every OS condition.
- GitHub publishing and Netlify deployment have not been performed.

## Artifacts

- `artifacts/snapbite-diary-clean-desktop.jpg`
- `artifacts/snapbite-diary-clean-mobile.jpg`
- `artifacts/snapbite-calibrated-offline.jpg`
- `ml/reports/calibration-benchmark.md` and `.json` — current model comparison
- `ml/reports/calibration.json` — validation-fitted frozen parameters

- `artifacts/snapbite-scanner-mobile.jpg`
- `artifacts/snapbite-scanner-desktop.jpg`
- `ml/README.md` — architecture, source licenses, training and reproduction
- `ml/reports/benchmark.md` — summarized/per-class results
- `ml/reports/benchmark.json` and `ml/reports/predictions.csv` — image-level results

The production preview was restarted after the offline check. The temporary development server was stopped.

## Useful Insights update

Replaced Days with meals and Foods logged with protein goal progress (daily average, percentage and gap to current goal) and calorie share by meal (largest meal and full breakdown). Kept average calories with a goal comparison. Missing days now show a dash rather than implying zero intake; zero-calorie logged entries still count as logged.

Three calculation tests cover daily aggregation, the inclusive seven-day boundary, meal shares and missing-versus-zero data. All 27 tests and the production build passed. Verified existing local logs render 219 average kcal, 7 g average protein and Breakfast as the largest share. Confirmed removed count labels are absent, no browser errors, and no horizontal overflow at 390 × 844. No diary records changed. Screenshots: artifacts/snapbite-insights-desktop.jpg and artifacts/snapbite-insights-mobile.jpg.

## Expanded Insights and top-bar cleanup

Removed the top-bar notification/profile buttons, protein-gap line and the two requested explanatory paragraphs. Added macro balance (logged daily grams and 4/4/9 macro-energy shares) and top-five protein sources grouped by food ID from weekly nutrition snapshots. No diary writes. Two added tests verify energy-share math and repeated-food aggregation/exclusion of out-of-window entries. All 27 tests and production build pass. Actual UI reflects existing Idli entry: 7 g protein, 44 g carbs and 1 g fat, with Idli as top protein source. Desktop/mobile verified; mobile client/scroll width 375 px, no top-bar buttons, requested text absent and no browser errors. Screenshots: artifacts/snapbite-insights-expanded.jpg and artifacts/snapbite-insights-expanded-mobile.jpg.

## Scan-to-nutrition coverage and measured quantities

- Added 5,459 normalized nutrition profiles (5,439 USDA records plus 20 explicit ingredient-based reference recipes) alongside 63 preserved starters: 5,522 local entries. All 116 recognition categories have resolvable local nutrition options. Nine regional classes still use marked starter estimates. All sources, archive hashes, units and recipe yields are retained in NUTRITION.md and public/data/nutrition-provenance.json.
- The quantity form defaults to grams with no prefilled amount, so saving requires an explicit quantity or standard-portion choice. It shows scaled calories and one-decimal macros, supports USDA household-weight presets and shows the data basis/source. Ambiguous scans offer curated recipe choices before quantity entry.
- 27 automated tests pass, including complete label coverage, catalog validation, missing nutrient rejection, serving weights, gram scaling down to 0.1 g, one-time catalog migration and preservation of existing foods/diary snapshots. Production TypeScript/Vite/PWA build passes; catalog is precached with the app shell (15 entries, about 3.19 MiB total).
- Isolated preview port 4176: recognized a real held-out pizza photo, chose USDA cheese pizza, entered 250 g, selected Lunch, and saved. The diary displayed 250 g and 665 kcal. No test logs were added to the user’s main origin at port 4174.
- Stopped port 4176 and confirmed connection refusal. Reloaded offline: the 250 g / 665 kcal meal and 5,522-food library persisted. Recognized a new naan photo offline; its USDA nutrition lookup and quantity dialog worked. Choosing the standard 177 g naan preset changed the weight to 177 and calories to 550. Mobile dialog at 390 × 844 had no horizontal overflow (390/390 client/scroll widths). Closed the isolated QA tab and stopped its server.
- Artifacts: artifacts/snapbite-scan-nutrition-250g.jpg and artifacts/snapbite-offline-nutrition-mobile.jpg. Nutrition values remain reference estimates for the confirmed recipe; the camera does not measure edible weight or hidden ingredients.

Final main-preview check: empty quantity disables Add and shows no invented totals. Entering 250 g for USDA cheese pizza shows 665 kcal, 28.5 g protein, 83.3 g carbs and 24.2 g fat. Verified quantity dialog at 390 × 844 with equal client/scroll width of 390, then closed without logging. No browser errors. Latest screenshots: artifacts/snapbite-scan-nutrition-250g.jpg and artifacts/snapbite-nutrition-quantity-mobile.jpg.
