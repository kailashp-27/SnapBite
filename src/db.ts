import Dexie, {type Table} from 'dexie';
import type {Day, DailyLog, Food, Goals, Meal, Preferences} from './types';
import {regionalFoods} from './regional-foods';
import {validPlateReference} from './plate-reference';
import type {MealEvaluation} from './meal-evaluation';

class SnapBiteDB extends Dexie {
  foodLibrary!: Table<Food, string>;
  dailyLogs!: Table<DailyLog, number>;
  days!: Table<Day, string>;
  preferences!: Table<Preferences, string>;
  libraryState!: Table<{id: string; version: string}, string>;
  scanPreferences!: Table<{id:string;plateDiameterCm:number},string>;
  mealEvaluations!: Table<MealEvaluation,string>;
  constructor() {
    super('snapbite');
    this.version(1).stores({foodLibrary: 'id,name,category,*aliases', dailyLogs: '++id,date,[date+meal],foodId,createdAt', days: 'date', preferences: 'id'});
    this.version(2).stores({libraryState: 'id'});
    this.version(3).stores({scanPreferences:'id'});
    this.version(4).stores({mealEvaluations:'id,createdAt,modelVersion'});
  }
}
export const db = new SnapBiteDB();
export function validateFoods(data: unknown): Food[] {
  if (!Array.isArray(data) || !data.length || data.length > 250000) throw new Error('Choose a JSON array containing 1 to 250,000 foods.');
  const ids = new Set<string>();
  return data.map((value: unknown, index) => {
    const food = value as Food;
    if (!food || typeof food.id !== 'string' || !food.id.trim() || ids.has(food.id) || typeof food.name !== 'string' || !food.name.trim() || typeof food.category !== 'string' || typeof food.serving !== 'string' || typeof food.emoji !== 'string' || typeof food.source !== 'string') throw new Error(`Food ${index + 1} has missing text fields or a duplicate ID.`);
    for (const key of ['grams', 'calories', 'protein', 'carbs', 'fat'] as const) {
      if (typeof food[key] !== 'number' || !Number.isFinite(food[key]) || food[key] < 0 || (key === 'grams' && food[key] === 0)) throw new Error(`Food ${index + 1} has invalid ${key}.`);
    }
    if (food.aliases !== undefined && (!Array.isArray(food.aliases) || food.aliases.some(alias => typeof alias !== 'string'))) throw new Error(`Food ${index + 1} has invalid aliases.`);
    if (food.portionOptions !== undefined && (!Array.isArray(food.portionOptions) || food.portionOptions.length > 50 || food.portionOptions.some(portion => !portion || typeof portion.label !== 'string' || !Number.isFinite(portion.grams) || portion.grams <= 0))) throw new Error(`Food ${index + 1} has invalid serving weights.`);
    ids.add(food.id); return food;
  });
}
export async function initializeLibrary() {
  if (await db.foodLibrary.count() === 0) {
    const response = await fetch('/data/foods.json');
    if (!response.ok) throw new Error('The starter food library could not be loaded. Reconnect and try again.');
    const foods = validateFoods(await response.json());
    await db.transaction('rw', db.foodLibrary, async () => {
      if (await db.foodLibrary.count() === 0) await db.foodLibrary.bulkPut(foods);
    });
  }
  await db.transaction('rw', db.foodLibrary, async () => {
    const existing = await db.foodLibrary.bulkGet(regionalFoods.map(food => food.id));
    const missing = regionalFoods.filter((_, index) => !existing[index]);
    if (missing.length) await db.foodLibrary.bulkAdd(missing);
  });
  const version = 'usda-fndds-2024-v1';
  if ((await db.libraryState.get('usda'))?.version !== version) {
    const response = await fetch('/data/usda-foods.json');
    if (!response.ok) throw new Error('The expanded nutrition library could not load. Reconnect and retry.');
    const foods = validateFoods(await response.json());
    await db.transaction('rw', db.foodLibrary, db.libraryState, async () => {
      const existing = await db.foodLibrary.bulkGet(foods.map(food => food.id));
      const missing = foods.filter((_, index) => !existing[index]);
      if (missing.length) await db.foodLibrary.bulkAdd(missing);
      await db.libraryState.put({id:'usda', version});
    });
  }
}
export async function addFood(food: Food, portions: number, date: string, meal: Meal) {
  if (!Number.isFinite(portions) || portions <= 0 || portions > 100) throw new Error('Enter a portion between 0.01 and 100.');
  return db.dailyLogs.add({date, meal, foodId: food.id, name: food.name, emoji: food.emoji, serving: food.serving, portions, grams: food.grams * portions,
    calories: food.calories * portions, protein: food.protein * portions, carbs: food.carbs * portions, fat: food.fat * portions, createdAt: Date.now()});
}
export async function addPhotoMeal(items:{food:Food;estimate:NonNullable<import('./types').DailyLog['photoEstimate']>}[],date:string,meal:Meal){
  if(!items.length||items.length>20)throw Error('Review the foods before logging.');
  const rows=items.map(({food,estimate})=>{
    validateFoods([food]);
    if(estimate.plateReference!==undefined&&!validPlateReference(estimate.plateReference))throw Error('Check the plate reference.');
    if(estimate.method!=='photo-prototype-v1'||![estimate.grams,estimate.lowGrams,estimate.highGrams].every(value=>Number.isFinite(value)&&value>0)||estimate.lowGrams>estimate.grams||estimate.highGrams<estimate.grams||estimate.grams>food.grams*100)throw Error('Check the estimated portions.');
    const portions=estimate.grams/food.grams;
    return {date,meal,foodId:food.id,name:food.name,emoji:food.emoji,serving:food.serving,portions,grams:estimate.grams,calories:food.calories*portions,protein:food.protein*portions,carbs:food.carbs*portions,fat:food.fat*portions,createdAt:Date.now(),photoEstimate:estimate};
  });
  await db.transaction('rw',db.dailyLogs,()=>db.dailyLogs.bulkAdd(rows));
}
export async function setWater(date: string, delta: number) {
  await db.transaction('rw', db.days, async () => {
    const day = await db.days.get(date); await db.days.put({date, water: Math.max(0, Math.min(40, (day?.water ?? 0) + delta))});
  });
}
export async function saveGoals(goals: Goals) {
  if (typeof goals.name !== 'string' || goals.name.length > 40 || !(['calories', 'protein', 'carbs', 'fat', 'water'] as const).every(key => Number.isInteger(goals[key]) && goals[key] >= 1 && goals[key] <= (key === 'calories' ? 10000 : key === 'water' ? 40 : 1000))) throw new Error('Check your goals and use whole, positive numbers.');
  await db.preferences.put({id: 'goals', value: goals});
}
