import {db, validateFoods} from './db';
import type {DailyLog, Day, Goals, Preferences} from './types';
import {validPlateReference} from './plate-reference';

function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null;}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function validGoals(value: unknown): value is Goals {
  if (!record(value) || typeof value.name !== 'string' || value.name.length > 40) return false;
  return ['calories', 'protein', 'carbs', 'fat', 'water'].every(key => typeof value[key] === 'number' && Number.isInteger(value[key]) && value[key] >= 1 && value[key] <= (key === 'water' ? 40 : key === 'calories' ? 10000 : 1000));
}
export function validateBackup(data: unknown) {
  if (!record(data) || data.version !== 1 || !Array.isArray(data.dailyLogs) || !Array.isArray(data.days) || !Array.isArray(data.preferences)) throw new Error('This is not a supported SnapBite backup.');
  const foods = validateFoods(data.foodLibrary);
  const logIds = new Set<number>();
  for (const log of data.dailyLogs) {
    if (!record(log) || typeof log.id !== 'number' || !Number.isSafeInteger(log.id) || log.id < 1 || logIds.has(log.id) || !validDate(log.date) || !['Breakfast', 'Lunch', 'Dinner', 'Snacks'].includes(log.meal as string) || ['foodId', 'name', 'emoji', 'serving'].some(key => typeof log[key] !== 'string') || ['portions', 'calories', 'protein', 'carbs', 'fat', 'createdAt'].some(key => typeof log[key] !== 'number' || !Number.isFinite(log[key]) || log[key] < 0) || !(Number(log.portions) > 0 && Number(log.portions) <= 100)) throw new Error('The backup contains an invalid meal entry.');
    logIds.add(log.id);
    if(record(log.photoEstimate)&&log.photoEstimate.plateReference!==undefined&&!validPlateReference(log.photoEstimate.plateReference))throw Error('The backup contains an invalid plate reference.');
    if (log.grams !== undefined && (typeof log.grams !== 'number' || !Number.isFinite(log.grams) || log.grams <= 0)) throw new Error('The backup contains an invalid portion weight.');
    if(log.photoEstimate!==undefined){const estimate=log.photoEstimate;if(!record(estimate)||estimate.method!=='photo-prototype-v1'||typeof estimate.description!=='string'||typeof estimate.basis!=='string'||!['assumed','saved'].includes(String(estimate.scale))||!['grams','lowGrams','highGrams','plateDiameterCm'].every(key=>typeof estimate[key]==='number'&&Number.isFinite(estimate[key])&&Number(estimate[key])>0)||Number(estimate.lowGrams)>Number(estimate.grams)||Number(estimate.highGrams)<Number(estimate.grams))throw Error('The backup contains an invalid photo estimate.');}
  }
  const dates = new Set<string>();
  for (const day of data.days) {
    if (!record(day) || !validDate(day.date) || dates.has(day.date) || !Number.isInteger(day.water) || Number(day.water) < 0 || Number(day.water) > 40) throw new Error('The backup contains invalid water records.');
    dates.add(day.date);
  }
  if (data.preferences.length > 1 || data.preferences.some(item => !record(item) || item.id !== 'goals' || !validGoals(item.value))) throw new Error('The backup contains invalid goals.');
  return {foodLibrary: foods, dailyLogs: data.dailyLogs as DailyLog[], days: data.days as Day[], preferences: data.preferences as Preferences[]};
}
export async function restoreBackup(data: unknown) {
  const backup = validateBackup(data);
  await db.transaction('rw', [db.foodLibrary, db.dailyLogs, db.days, db.preferences, db.libraryState], async () => {
    await db.foodLibrary.clear(); await db.dailyLogs.clear(); await db.days.clear(); await db.preferences.clear();
    await db.foodLibrary.bulkPut(backup.foodLibrary); await db.dailyLogs.bulkPut(backup.dailyLogs);
    await db.days.bulkPut(backup.days); await db.preferences.bulkPut(backup.preferences);
    await db.libraryState.clear();
  });
}
