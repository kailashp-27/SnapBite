export type Meal = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
export type Tab = 'dashboard' | 'diary' | 'scanner' | 'insights' | 'settings';
export interface Food {
  id: string; name: string; category: string; serving: string; grams: number;
  calories: number; protein: number; carbs: number; fat: number; emoji: string;
  source: string; aliases?: string[];
  nutritionKind?: 'usda' | 'reference-recipe';
  portionOptions?: {label: string; grams: number}[];
}
export interface DailyLog {
  id?: number; date: string; meal: Meal; foodId: string; name: string; emoji: string;
  serving: string; portions: number; grams?: number; calories: number; protein: number; carbs: number; fat: number;
  createdAt: number;
  photoEstimate?: import('./portion-estimates').PhotoEstimate;
}
export interface Goals { name: string; calories: number; protein: number; carbs: number; fat: number; water: number; }
export interface Day { date: string; water: number; }
export interface Preferences { id: string; value: Goals; }
export const defaultGoals: Goals = {name: '', calories: 2200, protein: 120, carbs: 275, fat: 73, water: 8};
export const meals: Meal[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDate(key: string, amount: number): string {
  const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + amount); return dateKey(date);
}
export const sumNutrition = (logs: DailyLog[]) => logs.reduce((total, log) => ({calories: total.calories + log.calories, protein: total.protein + log.protein, carbs: total.carbs + log.carbs, fat: total.fat + log.fat}), {calories: 0, protein: 0, carbs: 0, fat: 0});
