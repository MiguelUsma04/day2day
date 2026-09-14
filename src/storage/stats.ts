import type { Task, Todo } from '../types/task';
import { addDays, toDayKey } from '../utils/date';
import { occursOn } from './occurrence';

/**
 * Consistency report over a trailing window.
 *
 * Only days that already happened are scored: counting tomorrow's untouched
 * schedule as "failed" would make every report look bad. Today is included
 * because partial progress is still worth seeing.
 */

export type DayScore = {
  dayKey: string;
  scheduled: number;
  done: number;
  /** 0..1, or null when nothing was scheduled that day. */
  rate: number | null;
};

export type HabitScore = {
  id: string;
  title: string;
  category: Task['category'];
  icon?: string;
  scheduled: number;
  done: number;
  rate: number;
};

export type Stats = {
  /** Days with at least one scheduled activity, within the window. */
  activeDays: number;
  totalScheduled: number;
  totalDone: number;
  /** 0..1 across the whole window. */
  overallRate: number;
  /** Consecutive days up to today where everything scheduled was completed. */
  currentStreak: number;
  bestStreak: number;
  /** Days where every scheduled activity was done. */
  perfectDays: number;
  days: DayScore[];
  best: HabitScore[];
  worst: HabitScore[];
  todosDone: number;
  todosTotal: number;
  /** True when there is not enough history to say anything useful. */
  isEmpty: boolean;
};

/** A day counts as complete when it had activities and all of them were done. */
function isComplete(day: DayScore): boolean {
  return day.scheduled > 0 && day.done === day.scheduled;
}

export function computeStats(tasks: Task[], todos: Todo[], windowDays: number): Stats {
  const today = new Date();
  const todayKey = toDayKey(today);

  const days: DayScore[] = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const dayKey = toDayKey(addDays(today, -i));
    let scheduled = 0;
    let done = 0;

    for (const task of tasks) {
      if (!occursOn(task, dayKey)) continue;
      scheduled += 1;
      if (task.completedDays.includes(dayKey)) done += 1;
    }

    days.push({
      dayKey,
      scheduled,
      done,
      rate: scheduled === 0 ? null : done / scheduled,
    });
  }

  const totalScheduled = days.reduce((sum, d) => sum + d.scheduled, 0);
  const totalDone = days.reduce((sum, d) => sum + d.done, 0);
  const activeDays = days.filter((d) => d.scheduled > 0).length;
  const perfectDays = days.filter(isComplete).length;

  // Current streak walks back from today. Today only breaks the streak once it
  // is over, so an in-progress day is skipped rather than counted as a failure.
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day.scheduled === 0) continue;
    if (isComplete(day)) {
      currentStreak += 1;
      continue;
    }
    if (day.dayKey === todayKey) continue;
    break;
  }

  let bestStreak = 0;
  let running = 0;
  for (const day of days) {
    if (day.scheduled === 0) continue;
    if (isComplete(day)) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  // Per-habit rates, excluding today so an unfinished day does not skew them.
  const perTask = new Map<string, HabitScore>();
  for (const day of days) {
    if (day.dayKey === todayKey) continue;
    for (const task of tasks) {
      if (!occursOn(task, day.dayKey)) continue;
      const existing = perTask.get(task.id);
      const doneToday = task.completedDays.includes(day.dayKey) ? 1 : 0;
      if (existing) {
        existing.scheduled += 1;
        existing.done += doneToday;
      } else {
        perTask.set(task.id, {
          id: task.id,
          title: task.title,
          category: task.category,
          icon: task.icon,
          scheduled: 1,
          done: doneToday,
          rate: 0,
        });
      }
    }
  }

  const habits = Array.from(perTask.values())
    // A couple of occurrences is too little to call something a strength or a gap.
    .filter((h) => h.scheduled >= 3)
    .map((h) => ({ ...h, rate: h.done / h.scheduled }));

  const sorted = [...habits].sort((a, b) => b.rate - a.rate || b.scheduled - a.scheduled);
  const best = sorted.filter((h) => h.rate >= 0.6).slice(0, 3);
  const worst = [...sorted]
    .reverse()
    .filter((h) => h.rate < 0.6)
    .slice(0, 3);

  const windowStart = days[0]?.dayKey ?? todayKey;
  const windowTodos = todos.filter((t) => t.date >= windowStart && t.date <= todayKey);

  return {
    activeDays,
    totalScheduled,
    totalDone,
    overallRate: totalScheduled === 0 ? 0 : totalDone / totalScheduled,
    currentStreak,
    bestStreak,
    perfectDays,
    days,
    best,
    worst,
    todosDone: windowTodos.filter((t) => t.done).length,
    todosTotal: windowTodos.length,
    isEmpty: totalScheduled === 0,
  };
}
