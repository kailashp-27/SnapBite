"""Normalize official USDA archives and build a reviewed scanner-to-food index.

Download URLs and SHA-256 hashes are recorded in the generated provenance file.
Reference recipes are explicit examples, not measured nutrition of a photograph.
"""
from pathlib import Path
import csv
import hashlib
import io
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.ml-work/nutrition'
OUT = ROOT / 'public/data'
URLS = {
    'fndds-2024.zip': 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    'sr-legacy.zip': 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
}
ARCHIVE_HASHES = {'fndds-2024.zip': 'dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb', 'sr-legacy.zip': 'b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0'}
for name, expected in ARCHIVE_HASHES.items():
    assert hashlib.sha256((WORK / name).read_bytes()).hexdigest() == expected, 'Nutrition archive integrity mismatch: ' + name
config = json.loads((ROOT / 'public/models/snapbite-v1/config.json').read_text())
matches = json.loads((ROOT / 'scripts/nutrition-matches.json').read_text())
matches.update({
    'caprese_salad': [2705818], 'hot_dog': [2707056, 2707060],
    'pizza': [2708614, 2708638], 'spaghetti_bolognese': [2708838],
    'sashimi': [2706308, 2706284], 'steak': [2705829, 2705841],
    'prime_rib': [172150], 'foie_gras': [171100],
})

def nice_name(description):
    return description.replace(', NFS', ', generic recipe').replace(', NS as to', ', unspecified')

def record(fdc_id, name, values, portions, dataset):
    # USDA values are per 100 g. Keep this exact denominator rather than
    # pretending the camera knows a piece/cup weight.
    return {'id': f'usda:{fdc_id}', 'name': nice_name(name), 'category': 'Other',
        'serving': '100 g', 'grams': 100, **values, 'emoji': '🍽️', 'aliases': [],
        'source': f'USDA {dataset}; FDC {fdc_id}. Per 100 g. https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients',
        'portionOptions': portions, 'nutritionKind': 'usda'}

foods = {}
skipped = []
with zipfile.ZipFile(WORK / 'fndds-2024.zip') as archive:
    survey = json.loads(archive.read('surveyDownload.json'))['SurveyFoods']
for food in survey:
    nutrients = {row['nutrient']['id']: row['amount'] for row in food['foodNutrients'] if 'amount' in row}
    if not all(key in nutrients for key in [1008,1003,1004,1005]):
        skipped.append({'fdcId': food['fdcId'], 'name': food['description'], 'reason': 'Missing energy or macro data'})
        continue
    values = {key: nutrients[nutrient] for key, nutrient in [('calories',1008),('protein',1003),('carbs',1005),('fat',1004)]}
    portions = [{'label': p['portionDescription'], 'grams': p['gramWeight']} for p in sorted(food.get('foodPortions', []), key=lambda p:p.get('sequenceNumber',999)) if p.get('gramWeight',0) > 0 and p.get('portionDescription') and p['portionDescription'] != 'Quantity not specified'][:12]
    foods[food['fdcId']] = record(food['fdcId'], food['description'], values, portions, 'FNDDS 2021–2023 (2024 release)')

# Only the required legacy ingredients/profiles are shipped, not the full SR archive.
legacy_ids = {171100,172150,171812,169599,172177,172183,170271,168936}
with zipfile.ZipFile(WORK / 'sr-legacy.zip') as archive:
    def rows(filename):
        name = next(name for name in archive.namelist() if name.endswith('/'+filename))
        return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding='utf-8-sig'))
    descriptions = {int(row['fdc_id']): row['description'] for row in rows('food.csv') if int(row['fdc_id']) in legacy_ids}
    nutrients = {fdc_id: {} for fdc_id in legacy_ids}
    for row in rows('food_nutrient.csv'):
        fdc_id = int(row['fdc_id'])
        if fdc_id in nutrients and row['nutrient_id'] in ['1008','1003','1004','1005']:
            nutrients[fdc_id][int(row['nutrient_id'])] = float(row['amount'])
    for fdc_id, name in descriptions.items():
        n = nutrients[fdc_id]
        assert all(key in n for key in [1008,1003,1004,1005]), name
        foods[fdc_id] = record(fdc_id, name, {key:n[value] for key,value in [('calories',1008),('protein',1003),('carbs',1005),('fat',1004)]}, [], 'SR Legacy (April 2018)')

# Food-101 names are broader than specific recipes. These examples expose their
# ingredients and finished edible yield for the user to review or replace.
# Tuples: label, displayed recipe, finished yield g, [(USDA ingredient ID, g)].
recipes = [
 ('beef_carpaccio','Beef carpaccio with Parmesan',100,[(171812,80),(2705728,10),(2710186,5),(2709168,5)]),
 ('beet_salad','Beet salad with oil & vinegar',100,[(2709872,90),(2710186,5),(2709351,5)]),
 ('cannoli','Cannoli with ricotta filling',100,[(2708056,30),(2705750,45),(2710258,20),(170271,5)]),
 ('cheese_plate','Cheese plate: cheddar, Brie & Swiss',100,[(2705709,40),(172177,30),(2705735,30)]),
 ('croque_madame','Croque madame with fried egg',200,[(2706965,130),(2707159,50),(2710243,20)]),
 ('fish_and_chips','Fried cod & chips',300,[(2706244,150),(2709456,150)]),
 ('lobster_bisque','Creamy lobster bisque',300,[(2706349,60),(2705597,45),(2705385,75),(2707132,105),(2710247,15)]),
 ('lobster_roll_sandwich','Lobster roll with mayonnaise',200,[(2706349,120),(2710204,20),(2707656,60)]),
 ('macarons','Almond macarons with chocolate butter filling',90,[(2707486,20),(172183,20),(2710258,40),(2710155,10),(170271,10)]),
 ('panna_cotta','Vanilla panna cotta',100,[(2705597,55),(2705385,30),(2710258,14),(169599,1)]),
 ('poutine','Poutine with cheddar & beef gravy',250,[(2709456,160),(2705709,40),(2707145,50)]),
 ('risotto','Parmesan risotto',250,[(2708408,185),(2705728,20),(2710155,10),(2707132,35)]),
 ('seaweed_salad','Seaweed salad with sesame dressing',100,[(2709989,80),(2710190,5),(2709351,10),(2710258,5)]),
 ('shrimp_and_grits','Shrimp with cheese grits',250,[(2706363,100),(2708367,150)]),
 ('spaghetti_carbonara','Spaghetti carbonara with egg, bacon & Parmesan',250,[(2708357,170),(2705885,25),(2707154,35),(2705728,20)]),
 ('spring_rolls','Fried vegetable spring rolls',100,[(2708700,100)]),
 ('takoyaki','Takoyaki with mayonnaise',95,[(168936,25),(2707152,15),(2706331,20),(2710188,5),(2710204,5),(2710707,30)]),
 ('tuna_tartare','Tuna tartare with avocado & soy',100,[(2706308,75),(2709223,15),(2707442,5),(2710190,5)]),
 ('caesar_salad','Caesar salad with dressing',200,[(2709591,170),(2710199,30)]),
 ('greek_salad','Greek salad with oil dressing',200,[(2709830,190),(2710186,10)]),
]

recipe_records = []
for label, title, yield_grams, ingredients in recipes:
    components = [foods[fdc_id] for fdc_id, _ in ingredients]
    values = {key: round(sum(foods[fdc_id][key] * grams / 100 for fdc_id, grams in ingredients) / yield_grams * 100, 6) for key in ['calories','protein','carbs','fat']}
    item = {'id':'recipe:'+label,'name':title+' (reference recipe)','category':'Other','serving':'100 g','grams':100, **values,
        'emoji':'🍽️','aliases':[label,label.replace('_',' ')], 'nutritionKind':'reference-recipe',
        'source':'Reference recipe estimate using USDA ingredients. Finished edible yield: '+str(yield_grams)+' g. '+ '; '.join(f"{grams} g {foods[fdc_id]['name']} (FDC {fdc_id})" for fdc_id,grams in ingredients)+'. Recipe and yield are illustrative; confirm or replace for your meal.',
        'portionOptions':[], 'recipeIngredients':[{'fdcId':fdc_id,'name':foods[fdc_id]['name'],'grams':grams} for fdc_id,grams in ingredients], 'recipeYieldGrams':yield_grams}
    recipe_records.append(item)
    matches.setdefault(label,[]).insert(0,item['id'])

resolved = {}
for label, ids in matches.items():
    resolved[label] = [fdc_id if isinstance(fdc_id,str) else 'usda:'+str(fdc_id) for fdc_id in ids]
    for fdc_id in ids:
        if isinstance(fdc_id,int):
            assert fdc_id in foods, (label,fdc_id)
            foods[fdc_id]['aliases'].extend([label,label.replace('_',' ')])
            if label in config['regionalLabels']:
                foods[fdc_id]['category']='Indian'
for food in foods.values():
    food['aliases'] = sorted(set(food['aliases']))
catalog = list(foods.values()) + recipe_records
OUT.mkdir(exist_ok=True)
serialized = json.dumps(catalog,ensure_ascii=False,separators=(',',':')).encode('utf-8')
(OUT / 'usda-foods.json').write_bytes(serialized)
(ROOT / 'src/nutrition-matches.json').write_text(json.dumps(resolved,indent=2)+'\n')
provenance = {'version':'usda-fndds-2024-v1','catalogSha256':hashlib.sha256(serialized).hexdigest(),'foods':len(catalog),'usdaRecords':len(foods),'referenceRecipeCount':len(recipe_records),'skippedIncompleteRecords':skipped,
    'archives':[{'url':url,'sha256':hashlib.sha256((WORK/name).read_bytes()).hexdigest()} for name,url in URLS.items()],
    'referenceRecipes':recipe_records,'notes':'USDA macronutrients are per 100 g edible food. Reference recipe values are ingredient-weighted estimates with stated yields, not laboratory measurements. Standard household portions are estimates; a scale is needed for measured grams.'}
(OUT / 'nutrition-provenance.json').write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n', encoding='utf-8')
print(json.dumps({'catalogFoods':len(catalog),'directUsdaRecords':len(foods),'referenceRecipes':len(recipe_records),'mappedClasses':len(resolved),'catalogBytes':len(serialized),'incomplete':len(skipped)},indent=2))
