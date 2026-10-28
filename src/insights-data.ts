import {meals, shiftDate, sumNutrition, type DailyLog} from './types';

export function weeklyInsights(logs: DailyLog[], end: string) {
  const start = shiftDate(end, -6);
  const entries = logs.filter(log => log.date >= start && log.date <= end);
  const days = Array.from({length: 7}, (_, index) => {
    const key = shiftDate(start, index);
    const items = entries.filter(log => log.date === key);
    return {key, logged: items.length > 0, ...sumNutrition(items)};
  });
  const loggedDays = days.filter(day => day.logged).length;
  const totals = sumNutrition(entries);
  const macroEnergy = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
  const macros = ([['protein', 'Protein', 4], ['carbs', 'Carbs', 4], ['fat', 'Fat', 9]] as const).map(([key, label, kcalPerGram]) => ({
    key, label, averageGrams: loggedDays ? totals[key] / loggedDays : null,
    energyPercent: macroEnergy > 0 ? totals[key] * kcalPerGram / macroEnergy * 100 : 0,
  }));
  const foodProtein = new Map<string, {foodId: string; name: string; emoji: string; protein: number}>();
  for (const entry of entries) {
    const food = foodProtein.get(entry.foodId) ?? {foodId: entry.foodId, name: entry.name, emoji: entry.emoji, protein: 0};
    food.protein += entry.protein;
    foodProtein.set(entry.foodId, food);
  }
  const proteinSources = [...foodProtein.values()].filter(food => food.protein > 0).sort((a, b) => b.protein - a.protein || a.name.localeCompare(b.name)).slice(0, 5)
    .map(food => ({...food, percent: totals.protein > 0 ? food.protein / totals.protein * 100 : 0}));
  const mealShares = meals.map(meal => {
    const calories = sumNutrition(entries.filter(log => log.meal === meal)).calories;
    return {meal, calories, percent: totals.calories > 0 ? calories / totals.calories * 100 : 0};
  });
  const largestMeal = totals.calories > 0 ? mealShares.reduce((largest, meal) => meal.calories > largest.calories ? meal : largest) : null;
  return {start, days, loggedDays, mealShares, largestMeal, macros, macroEnergy, proteinSources,
    averageCalories: loggedDays ? totals.calories / loggedDays : null,
    averageProtein: loggedDays ? totals.protein / loggedDays : null};
}
