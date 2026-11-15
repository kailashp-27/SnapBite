import {describe, expect, it} from 'vitest';
import {exportLogsToCsv} from './export-csv';
import type {DailyLog} from './types';

describe('exportLogsToCsv', () => {
  it('generates headers even for empty logs', () => {
    const csv = exportLogsToCsv([]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Date,Meal,Food Name');
  });

  it('escapes commas and quotes properly in food names', () => {
    const logs: DailyLog[] = [
      {
        date: '2026-11-15',
        meal: 'Lunch',
        foodId: 'curry',
        name: 'Curry, "Special" Spicy',
        emoji: '🍛',
        serving: '1 bowl',
        portions: 1.5,
        grams: 300,
        calories: 450,
        protein: 15,
        carbs: 60,
        fat: 16,
        createdAt: 1000
      }
    ];
    const csv = exportLogsToCsv(logs);
    expect(csv).toContain('"Curry, ""Special"" Spicy"');
    expect(csv).toContain('2026-11-15,Lunch');
    expect(csv).toContain('450,15,60,16');
  });
});
