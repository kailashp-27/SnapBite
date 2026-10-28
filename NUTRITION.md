# Scan → recipe → quantity → nutrition

The scanner identifies a dish category. A reviewed index maps all **116 categories** to local nutrition options; the user confirms a recipe and quantity before saving. Photos do not determine edible weight, hidden oil, ingredients, or exact nutrients.

## Offline coverage

- 5,431 complete FNDDS 2021–2023 food records from USDA’s October 2024 release; one record without nutrient values was excluded.
- 8 selected USDA SR Legacy records used for additional profiles and recipe ingredients.
- 20 explicitly labeled reference recipes. Their macronutrients are computed from USDA ingredients and stated finished yields, including illustrative recipes for dishes absent from FNDDS. They are estimates, not measured or USDA-certified recipes.
- 63 existing starter estimates, retained without rewriting user data.
- Total: **5,522 food-library entries**. The 107 labels in nutrition-matches.json use USDA/reference-recipe options; the remaining 9 Indian classes use the existing labeled starter estimates. These 9 are chole bhature, dabeli, dhokla, jalebi, kathi roll, kofta, pani puri, pav bhaji and vada pav.

Mapping a broad category does not identify an exact recipe. Examples include a cheese versus pepperoni pizza, plain versus filled dosa, and chicken versus vegetable biryani. Foods retain their actual source names, preparation descriptions and source IDs. The user can choose another food or enter their own recipe/label data. Some source records explicitly exclude dressing or include bones/other serving assumptions; the confirmed amount must be edible food and the selected preparation must match.

## Quantity and calculation

USDA catalog profiles use a fixed **100 g edible-food basis**. Calories, protein, carbohydrates and fat scale by `confirmed grams / 100`. Existing/custom records scale by `confirmed grams / stated serving grams`. Stored diary entries snapshot weight and nutrition, preserving historical totals when the library changes.

The quantity dialog defaults to grams with an empty amount. Saving is disabled until the user enters a positive quantity or chooses an explicit standard portion; the app never silently assigns a photographed dish 100 g. Servings remain available. Optional USDA household portions show their reference gram weights and are marked estimated. They are not photo measurements. A kitchen scale provides measured grams. Reference recipes expose each ingredient’s FDC ID, weight and finished yield in Nutrition source & recipe. Their totals equal the ingredient-weighted nutrients divided by that stated yield.

## Sources and reproduction

Official download page: https://fdc.nal.usda.gov/download-datasets/

Download the two official archives to `.ml-work/nutrition/` using the URLs in `scripts/build-nutrition.py`, then run:

```powershell
python scripts/build-nutrition.py
npm test
npm run build
```

The generator verifies pinned archive SHA-256 hashes, excludes incomplete nutrient records, preserves USDA serving weights and records every source in `public/data/nutrition-provenance.json`. It produces `public/data/usda-foods.json` and the reviewed scanner index `src/nutrition-matches.json`. It does not download images or infer nutrient values from photographs. USDA describes FoodData Central data as public domain; attribution is retained in every USDA profile.

The PWA precaches the compact normalized catalog. On first upgrade, an IndexedDB transaction adds missing records and saves its version; subsequent launches use IndexedDB without reimporting. Existing/imported foods and diary snapshots are preserved. Restoring a backup resets catalog metadata so missing reference foods can be installed again.

## Validation

Automated tests cover all 116 recognition labels, all 5,459 new profiles, positive serving weights, explicit recipe attribution, missing-data exclusion, 250 g and sub-gram scaling, and a repeatable upgrade that preserves existing records. This is coverage/correct-calculation verification, not a claim that each generic recipe exactly matches a user’s meal.
