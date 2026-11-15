import {formatDate} from './format';
import {shiftDate, type DailyLog, type Goals} from './types';

export interface DayGoalStatus {
  date: string;
  dayLabel: string;
  calories: number;
  goalCalories: number;
  completed: boolean;
  status: 'completed' | 'exceeded' | 'unlogged';
}

export interface StreakStats {
  currentStreak: number;
  bestStreak: number;
  thisWeekCompleted: number;
  lastWeekCompleted: number;
  recentDays: DayGoalStatus[];
}

export function computeStreakStats(
  logs: DailyLog[],
  goals: Goals,
  referenceDate: string
): StreakStats {
  const caloriesByDate = new Map<string, number>();
  for (const log of logs) {
    caloriesByDate.set(log.date, (caloriesByDate.get(log.date) ?? 0) + log.calories);
  }

  function getDayStatus(date: string): DayGoalStatus {
    const calories = caloriesByDate.get(date) ?? 0;
    const completed = calories > 0 && calories <= goals.calories;
    const status: DayGoalStatus['status'] = calories === 0 ? 'unlogged' : completed ? 'completed' : 'exceeded';
    const dayLabel = formatDate(date, {weekday: 'narrow'});
    return {date, dayLabel, calories, goalCalories: goals.calories, completed, status};
  }

  // Current streak calculation:
  // If today is completed, start from today and go backwards.
  // If today is not yet completed (e.g. earlier today, 0 or in progress), check yesterday.
  let currentStreak = 0;
  const todayStatus = getDayStatus(referenceDate);

  let checkDate = referenceDate;
  if (!todayStatus.completed) {
    // If today is unlogged or not completed, check if yesterday was completed
    const yesterday = shiftDate(referenceDate, -1);
    if (getDayStatus(yesterday).completed) {
      checkDate = yesterday;
    }
  }

  while (getDayStatus(checkDate).completed) {
    currentStreak++;
    checkDate = shiftDate(checkDate, -1);
  }

  // Best streak calculation across all logged dates
  const sortedDates = [...caloriesByDate.keys()].sort();
  let bestStreak = currentStreak;
  let runningStreak = 0;
  let prevDate: string | null = null;

  for (const date of sortedDates) {
    if (getDayStatus(date).completed) {
      if (prevDate && shiftDate(prevDate, 1) === date) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
      bestStreak = Math.max(bestStreak, runningStreak);
      prevDate = date;
    } else {
      runningStreak = 0;
      prevDate = null;
    }
  }

  // Recent 7 days (ending at referenceDate)
  const recentDays: DayGoalStatus[] = [];
  for (let i = 6; i >= 0; i--) {
    recentDays.push(getDayStatus(shiftDate(referenceDate, -i)));
  }

  const thisWeekCompleted = recentDays.filter(d => d.completed).length;

  // Previous 7 days
  let lastWeekCompleted = 0;
  for (let i = 13; i >= 7; i--) {
    if (getDayStatus(shiftDate(referenceDate, -i)).completed) {
      lastWeekCompleted++;
    }
  }

  return {
    currentStreak,
    bestStreak,
    thisWeekCompleted,
    lastWeekCompleted,
    recentDays
  };
}
