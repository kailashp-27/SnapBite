import {describe, expect, it} from 'vitest';
import {weeklyInsights} from './insights-data';
import type {DailyLog} from './types';

const log = (date: string, meal: DailyLog['meal'], calories: number, protein: number): DailyLog => ({date, meal, calories, protein, carbs: 0, fat: 0, foodId: 'test', name: 'Test', emoji: '', portions: 1, serving: 'serving', createdAt: 0});

describe('weekly eating insights', () => {
  it('averages daily totals over logged days rather than foods or all seven days', () => {
    const result = weeklyInsights([log('2026-10-24', 'Breakfast', 400, 20), log('2026-10-24', 'Lunch', 600, 30), log('2026-10-25', 'Dinner', 800, 40)], '2026-10-25');
    expect(result.averageCalories).toBe(900);
    expect(result.averageProtein).toBe(45);
    expect(result.days.filter(day => !day.logged)).toHaveLength(5);
    expect(result.largestMeal?.meal).toBe('Dinner');
    expect(result.largestMeal?.percent).toBeCloseTo(800 / 1800 * 100);
    expect(result.mealShares.reduce((sum, meal) => sum + meal.percent, 0)).toBeCloseTo(100);
  });
  it('excludes entries outside the inclusive last-seven-day window', () => {
    const result = weeklyInsights([log('2026-10-18', 'Dinner', 1000, 50), log('2026-10-19', 'Lunch', 500, 20), log('2026-10-26', 'Breakfast', 1000, 50)], '2026-10-25');
    expect(result.averageCalories).toBe(500);
    expect(result.averageProtein).toBe(20);
    expect(result.days[0].key).toBe('2026-10-19');
    expect(result.days[6].key).toBe('2026-10-25');
  });
  it('keeps missing data distinct from a logged zero-calorie entry', () => {
    const empty = weeklyInsights([], '2026-10-25');
    expect(empty.averageProtein).toBeNull();
    expect(empty.averageCalories).toBeNull();
    expect(empty.largestMeal).toBeNull();
    const zero = weeklyInsights([log('2026-10-25', 'Snacks', 0, 0)], '2026-10-25');
    expect(zero.averageCalories).toBe(0);
    expect(zero.days[6].logged).toBe(true);
    expect(zero.largestMeal).toBeNull();
    expect(zero.mealShares.every(meal => meal.percent === 0)).toBe(true);
    expect(empty.macros.every(macro => macro.averageGrams === null && macro.energyPercent === 0)).toBe(true);
    expect(zero.proteinSources).toEqual([]);
  });
  it('computes macro energy shares and daily grams from logged nutrition snapshots', () => {
    const result = weeklyInsights([{...log('2026-10-24', 'Lunch', 500, 25), carbs: 50, fat: 10}, {...log('2026-10-25', 'Dinner', 500, 25), carbs: 50, fat: 10}], '2026-10-25');
    expect(result.macroEnergy).toBe(780);
    expect(result.macros[0].averageGrams).toBe(25);
    expect(result.macros[1].averageGrams).toBe(50);
    expect(result.macros[2].averageGrams).toBe(10);
    expect(result.macros[2].energyPercent).toBeCloseTo(180 / 780 * 100);
    expect(result.macros.reduce((sum, macro) => sum + macro.energyPercent, 0)).toBeCloseTo(100);
  });
  it('groups repeated food IDs and ranks protein sources by their weekly contribution', () => {
    const result = weeklyInsights([
      {...log('2026-10-24', 'Lunch', 500, 20), foodId: 'dal', name: 'Dal'},
      {...log('2026-10-25', 'Lunch', 500, 20), foodId: 'dal', name: 'Dal'},
      {...log('2026-10-25', 'Dinner', 500, 30), foodId: 'paneer', name: 'Paneer'},
      {...log('2026-10-25', 'Snacks', 100, 0), foodId: 'oil', name: 'Oil'},
      {...log('2026-10-18', 'Lunch', 500, 100), foodId: 'old', name: 'Outside range'},
    ], '2026-10-25');
    expect(result.proteinSources.map(food => food.name)).toEqual(['Dal', 'Paneer']);
    expect(result.proteinSources[0].protein).toBe(40);
    expect(result.proteinSources[0].percent).toBeCloseTo(40 / 70 * 100);
  });
});
