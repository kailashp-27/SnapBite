import {describe, expect, it} from 'vitest';
import {computeStreakStats} from './streak';
import {defaultGoals, type DailyLog} from './types';

function createLog(date: string, calories: number): DailyLog {
  return {
    date,
    meal: 'Lunch',
    foodId: 'test',
    name: 'Test food',
    emoji: '🥗',
    serving: '1 plate',
    portions: 1,
    calories,
    protein: 20,
    carbs: 50,
    fat: 10,
    createdAt: Date.now()
  };
}

describe('computeStreakStats', () => {
  it('returns zero streaks when no logs exist', () => {
    const stats = computeStreakStats([], defaultGoals, '2026-11-15');
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(0);
    expect(stats.thisWeekCompleted).toBe(0);
    expect(stats.lastWeekCompleted).toBe(0);
    expect(stats.recentDays).toHaveLength(7);
  });

  it('calculates continuous streak ending today', () => {
    const logs = [
      createLog('2026-11-13', 1800),
      createLog('2026-11-14', 2000),
      createLog('2026-11-15', 2100)
    ];
    const stats = computeStreakStats(logs, defaultGoals, '2026-11-15');
    expect(stats.currentStreak).toBe(3);
    expect(stats.bestStreak).toBe(3);
    expect(stats.thisWeekCompleted).toBe(3);
  });

  it('preserves streak when today is unlogged but yesterday completed', () => {
    const logs = [
      createLog('2026-11-13', 1800),
      createLog('2026-11-14', 1900)
      // 2026-11-15 unlogged
    ];
    const stats = computeStreakStats(logs, defaultGoals, '2026-11-15');
    expect(stats.currentStreak).toBe(2);
    expect(stats.thisWeekCompleted).toBe(2);
  });

  it('resets streak when daily goal is exceeded', () => {
    const logs = [
      createLog('2026-11-13', 1800),
      createLog('2026-11-14', 3000), // Exceeded (goal is 2200)
      createLog('2026-11-15', 1900)
    ];
    const stats = computeStreakStats(logs, defaultGoals, '2026-11-15');
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(1);
  });

  it('compares this week vs last week completion counts', () => {
    const logs = [
      // Last week (days -13 to -7): 2026-11-02 to 2026-11-08
      createLog('2026-11-03', 2000),
      createLog('2026-11-04', 1950),
      createLog('2026-11-05', 2100),
      // This week (days -6 to 0): 2026-11-09 to 2026-11-15
      createLog('2026-11-10', 2000),
      createLog('2026-11-11', 2000),
      createLog('2026-11-12', 2000),
      createLog('2026-11-13', 2000),
      createLog('2026-11-14', 2000)
    ];
    const stats = computeStreakStats(logs, defaultGoals, '2026-11-15');
    expect(stats.lastWeekCompleted).toBe(3);
    expect(stats.thisWeekCompleted).toBe(5);
  });
});
