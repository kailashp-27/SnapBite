import 'fake-indexeddb/auto';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {addFood, addPhotoMeal, db, initializeLibrary, setWater, validateFoods} from './db';
import {photoPortion} from './portion-estimates';
import {restoreBackup, validateBackup} from './backup';
import {dateKey, shiftDate, sumNutrition, type Food} from './types';

const food: Food = {id: 'idli', name: 'Idli', category: 'Indian', serving: '2 pieces', grams: 100, calories: 146, protein: 4.5, carbs: 29, fat: 0.7, emoji: '🍚', source: 'test'};
beforeEach(async () => {await db.open();});
afterEach(async () => {vi.unstubAllGlobals(); await db.delete();});
describe('food diary persistence', () => {
  it('stores a nutrition snapshot and scales fractional portions', async () => {
    await db.foodLibrary.put(food);
    await addFood(food, 1.5, '2026-10-24', 'Breakfast');
    await db.foodLibrary.put({...food, calories: 999});
    const entries = await db.dailyLogs.where('date').equals('2026-10-24').toArray();
    expect(entries).toHaveLength(1); expect(entries[0].calories).toBe(219);
    expect(entries[0].protein).toBe(6.75); expect(sumNutrition(entries).carbs).toBe(43.5);
    expect(entries[0].grams).toBe(150);
    expect(await db.dailyLogs.where('date').equals('2026-10-23').count()).toBe(0);
  });
  it('rejects invalid portions without writing a log', async () => {
    for (const amount of [0, -1, NaN, Infinity, 101]) await expect(addFood(food, amount, '2026-10-24', 'Lunch')).rejects.toThrow();
    expect(await db.dailyLogs.count()).toBe(0);
  });
  it('logs a reviewed multi-food meal atomically and preserves its estimated basis',async()=>{
    const estimate=photoPortion(food,'flatbread',{unit:'pieces',amount:3,size:'medium'},26,false);
    await expect(addPhotoMeal([{food,estimate},{food,estimate:{...estimate,grams:-1}}],'2026-10-25','Lunch')).rejects.toThrow();
    expect(await db.dailyLogs.count()).toBe(0);
    await addPhotoMeal([{food,estimate},{food:{...food,id:'dal',name:'Dal'},estimate:{...estimate,description:'0.75 cups'}}],'2026-10-25','Lunch');
    const rows=await db.dailyLogs.toArray();expect(rows).toHaveLength(2);
    expect(rows[0].photoEstimate?.method).toBe('photo-prototype-v1');expect(rows[0].photoEstimate?.description).toBe('3 medium pieces');
    expect(rows[0].calories).toBeCloseTo(food.calories/food.grams*estimate.grams);
    const backup={version:1,foodLibrary:[food],dailyLogs:rows,days:[],preferences:[]};
    expect(validateBackup(backup).dailyLogs[0].photoEstimate?.grams).toBe(estimate.grams);
    const reference={source:'manual' as const,areaFraction:.5};
    expect(validateBackup({...backup,dailyLogs:[{...rows[0],photoEstimate:{...estimate,plateReference:reference}}]}).dailyLogs[0].photoEstimate?.plateReference).toEqual(reference);
    expect(()=>validateBackup({...backup,dailyLogs:[{...rows[0],photoEstimate:{...estimate,plateReference:{source:'manual',areaFraction:NaN}}}]})).toThrow();
    expect(()=>validateBackup({...backup,dailyLogs:[{...rows[0],photoEstimate:{...estimate,lowGrams:99999}}]})).toThrow();
  });
  it('serializes water updates and clamps at zero', async () => {
    await Promise.all([setWater('2026-10-24', 1), setWater('2026-10-24', 1)]);
    expect((await db.days.get('2026-10-24'))?.water).toBe(2);
    await setWater('2026-10-24', -3); expect((await db.days.get('2026-10-24'))?.water).toBe(0);
  });
  it('scales measured gram quantities including amounts below one gram', async () => {
    await addFood(food, 250 / food.grams, '2026-10-25', 'Lunch');
    await addFood(food, .1 / food.grams, '2026-10-25', 'Snacks');
    const entries = await db.dailyLogs.toArray();
    expect(entries[0].grams).toBe(250);
    expect(entries[0].calories).toBe(365);
    expect(entries[0].protein).toBe(11.25);
    expect(entries[1].grams).toBeCloseTo(.1);
    expect(entries[1].calories).toBeCloseTo(.146);
  });
  it('installs the expanded library once without overwriting existing foods or diary snapshots', async () => {
    const sourced = {...food, id:'usda:test', calories:200};
    await db.foodLibrary.put({...sourced, calories:999});
    await addFood(food, 1, '2026-10-25', 'Lunch');
    const fetcher = vi.fn(async () => new Response(JSON.stringify([sourced, {...sourced,id:'usda:new'}])));
    vi.stubGlobal('fetch', fetcher);
    await initializeLibrary();
    await initializeLibrary();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await db.foodLibrary.get('usda:test'))?.calories).toBe(999);
    expect((await db.foodLibrary.get('usda:new'))?.calories).toBe(200);
    expect((await db.dailyLogs.toArray())[0].calories).toBe(146);
    expect((await db.libraryState.get('usda'))?.version).toBe('usda-fndds-2024-v1');
  });
});
describe('import validation', () => {
  it('accepts normalized data and rejects invalid or duplicate foods', () => {
    expect(validateFoods([food])).toEqual([food]);
    for (const data of [[], {}, [food, food], [{...food, calories: -5}], [{...food, grams: 0}], [{...food, aliases: [42]}]]) expect(() => validateFoods(data)).toThrow();
  });
  it('restores a complete backup and rejects corrupt data before changing storage', async () => {
    const backup = {version: 1, foodLibrary: [food], dailyLogs: [{id: 3, date: '2026-10-24', meal: 'Breakfast', foodId: food.id, name: food.name, emoji: food.emoji, serving: food.serving, portions: 1, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, createdAt: 1}], days: [{date: '2026-10-24', water: 3}], preferences: []};
    await restoreBackup(backup); expect(await db.dailyLogs.count()).toBe(1);
    expect((await db.days.get('2026-10-24'))?.water).toBe(3);
    await expect(restoreBackup({...backup, days: [{date: '2026-02-30', water: 3}]})).rejects.toThrow();
    expect(await db.dailyLogs.count()).toBe(1);
    expect(() => validateBackup({...backup, dailyLogs: [{...backup.dailyLogs[0], calories: '146'}]})).toThrow();
  });
});
describe('local calendar dates', () => {
  it('uses local date fields and handles month/year boundaries', () => {
    expect(dateKey(new Date(2026, 9, 24, 0, 1))).toBe('2026-10-24');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29');
  });
});
