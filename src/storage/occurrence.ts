import type { Task, Weekday } from '../types/task';
import { fromDayKey } from '../utils/date';

/**
 * Whether a task lands on a given day. Shared by the daily view and the stats
 * report so both agree on what "scheduled" means.
 *
 * Repeats never apply before their start date, and a skipped day drops out.
 */
export function occursOn(task: Task, dayKey: string): boolean {
  if (task.repeat.kind === 'none') return task.date === dayKey;
  if (dayKey < task.date) return false;
  if (task.skippedDays.includes(dayKey)) return false;

  const weekday = fromDayKey(dayKey).getDay() as Weekday;
  switch (task.repeat.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday >= 1 && weekday <= 5;
    case 'custom':
      return task.repeat.days.includes(weekday);
    default:
      return false;
  }
}
