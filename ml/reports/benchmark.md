# Scanner benchmark — October 25, 2026

**Historical baseline:** current deployed scores and before/after comparison are in [calibration-benchmark.md](calibration-benchmark.md).

Selected model: snapbite-int8-weights.onnx. Results use the default automatic routing mode.

| Group | Unique images | Top-1 | Top-3 |
| --- | ---: | ---: | ---: |
| overall | 1339 | 82.4% | 94.2% |
| indian | 919 | 91.0% | 98.2% |
| global | 420 | 63.8% | 85.5% |

Test coverage: 15 Indian classes and 21 of the 101 global classes. These are dataset-subset engineering results, not a guarantee on real camera photos. Native runtime timing is not a phone benchmark. Quantization candidates were compared on the same evaluation corpus.

Training: 5,610 downloaded images, 686 training duplicates/test overlaps removed, 42 evaluation duplicates removed. No exact duplicate image hashes had conflicting class labels. The regional head used 2,839 fitting and 704 internal-validation images; test images were excluded from fitting, early stopping and temperature selection.

Full static INT8 weight/activation quantization was rejected. The selected model compresses weights to INT8 while retaining float32 activations. See ../README.md for all provenance and methodology.

## Per-class results

| Class | Images | Top-1 | Top-3 |
| --- | ---: | ---: | ---: |
| apple_pie | 20 | 70.0% | 80.0% |
| beef_carpaccio | 20 | 90.0% | 95.0% |
| beef_tartare | 20 | 70.0% | 85.0% |
| beignets | 20 | 80.0% | 85.0% |
| biryani | 46 | 100.0% | 100.0% |
| carrot_cake | 20 | 60.0% | 80.0% |
| chicken_quesadilla | 20 | 30.0% | 85.0% |
| chicken_wings | 20 | 85.0% | 100.0% |
| chocolate_mousse | 20 | 40.0% | 80.0% |
| cholebhature | 66 | 98.5% | 100.0% |
| churros | 20 | 75.0% | 95.0% |
| dabeli | 44 | 81.8% | 97.7% |
| dal | 53 | 92.5% | 100.0% |
| dhokla | 50 | 96.0% | 100.0% |
| dosa | 34 | 94.1% | 100.0% |
| filet_mignon | 20 | 60.0% | 90.0% |
| frozen_yogurt | 20 | 90.0% | 100.0% |
| gyoza | 20 | 70.0% | 90.0% |
| ice_cream | 20 | 35.0% | 75.0% |
| jalebi | 62 | 98.4% | 100.0% |
| kathiroll | 68 | 92.6% | 98.5% |
| kofta | 107 | 74.8% | 93.5% |
| lobster_roll_sandwich | 20 | 75.0% | 90.0% |
| naan | 71 | 95.8% | 100.0% |
| onion_rings | 20 | 40.0% | 75.0% |
| pakora | 75 | 93.3% | 98.7% |
| paneer | 52 | 92.3% | 96.2% |
| panipuri | 36 | 94.4% | 97.2% |
| pavbhaji | 61 | 90.2% | 98.4% |
| peking_duck | 20 | 70.0% | 80.0% |
| pizza | 20 | 65.0% | 85.0% |
| scallops | 20 | 55.0% | 75.0% |
| spaghetti_bolognese | 20 | 50.0% | 80.0% |
| sushi | 20 | 60.0% | 80.0% |
| tiramisu | 20 | 70.0% | 90.0% |
| vadapav | 94 | 86.2% | 96.8% |
