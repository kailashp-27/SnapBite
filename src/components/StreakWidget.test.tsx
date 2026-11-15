// @vitest-environment jsdom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import StreakWidget from './StreakWidget';
import type {StreakStats} from '../streak';

afterEach(cleanup);

describe('StreakWidget', () => {
  it('renders zero streak status correctly', () => {
    const stats: StreakStats = {
      currentStreak: 0,
      bestStreak: 0,
      thisWeekCompleted: 0,
      lastWeekCompleted: 0,
      recentDays: [
        {date: '2026-11-09', dayLabel: 'M', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-10', dayLabel: 'T', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-11', dayLabel: 'W', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-12', dayLabel: 'T', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-13', dayLabel: 'F', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-14', dayLabel: 'S', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-15', dayLabel: 'S', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'}
      ]
    };

    render(<StreakWidget stats={stats}/>);
    expect(screen.getByRole('heading', {name: /goal streak/i})).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.getByText('0 / 7 days')).toBeDefined();
  });

  it('renders active streak and weekly difference', () => {
    const stats: StreakStats = {
      currentStreak: 5,
      bestStreak: 7,
      thisWeekCompleted: 5,
      lastWeekCompleted: 3,
      recentDays: [
        {date: '2026-11-09', dayLabel: 'M', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-10', dayLabel: 'T', calories: 0, goalCalories: 2200, completed: false, status: 'unlogged'},
        {date: '2026-11-11', dayLabel: 'W', calories: 2000, goalCalories: 2200, completed: true, status: 'completed'},
        {date: '2026-11-12', dayLabel: 'T', calories: 2100, goalCalories: 2200, completed: true, status: 'completed'},
        {date: '2026-11-13', dayLabel: 'F', calories: 1900, goalCalories: 2200, completed: true, status: 'completed'},
        {date: '2026-11-14', dayLabel: 'S', calories: 2050, goalCalories: 2200, completed: true, status: 'completed'},
        {date: '2026-11-15', dayLabel: 'S', calories: 2150, goalCalories: 2200, completed: true, status: 'completed'}
      ]
    };

    render(<StreakWidget stats={stats}/>);
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText(/best 7d/i)).toBeDefined();
    expect(screen.getByText('5 / 7 days')).toBeDefined();
    expect(screen.getByText(/Last week: 3 \/ 7/i)).toBeDefined();
    expect(screen.getByText(/\+2 days vs previous week/i)).toBeDefined();
  });
});
