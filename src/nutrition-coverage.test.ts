import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {foodIdsForLabel, matchingFoods} from './food-matching';
import {regionalFoods} from './regional-foods';
import {validateFoods} from './db';
import type {Food} from './types';
import config from '../public/models/snapbite-v1/config.json';

const read = (filename: string) => JSON.parse(readFileSync(new URL(filename, import.meta.url), 'utf8'));
const catalog = read('../public/data/usda-foods.json') as Food[];
const library = [...read('../public/data/foods.json'), ...regionalFoods, ...catalog] as Food[];

describe('scan to nutrition coverage', () => {
  it('has a real local nutrition profile for every supported recognition class', () => {
    const labels = [...config.labels, ...config.regionalLabels];
    expect(labels).toHaveLength(116);
    for (const label of labels) {
      const candidates = library.filter(food => foodIdsForLabel(label).includes(food.id));
      expect(candidates.length, label).toBeGreaterThan(0);
      expect(matchingFoods(label, candidates).length, label).toBeGreaterThan(0);
    }
  });
  it('validates the complete normalized catalog and retains its per-100g basis', () => {
    expect(validateFoods(catalog)).toHaveLength(5459);
    expect(catalog.every(food => food.grams === 100 && food.source.includes('USDA'))).toBe(true);
    expect(catalog.find(food => food.id === 'usda:2707995')?.calories).toBe(296);
    expect(catalog.find(food => food.id === 'usda:2705383')).toBeUndefined(); // no invented values for missing USDA nutrients
  });
  it('labels reference recipes and keeps edible serving weights positive', () => {
    const recipes = catalog.filter(food => food.nutritionKind === 'reference-recipe');
    expect(recipes).toHaveLength(20);
    expect(recipes.every(food => food.name.includes('reference recipe') && food.source.includes('Finished edible yield:'))).toBe(true);
    for (const food of catalog) for (const portion of food.portionOptions ?? []) expect(portion.grams).toBeGreaterThan(0);
  });
});
