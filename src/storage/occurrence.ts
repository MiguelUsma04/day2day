import type { Task, Weekday } from '../types/task';
import { fromDayKey } from '../utils/date';
import { resolveDayMode, taskFitsMode, type DayModeMap } from './dayModes';

/**
 * Whether a task lands on a given day. Shared by the daily view, the stats
 * report and the reminders so all agree on what "scheduled" means.
 *
 * Repeats never apply before their start date, a skipped day drops out, and
 * the day's mode (city / farm / holiday) filters by the task's context.
 */
export function occursOn(task: Task, dayKey: string, modes?: DayModeMap): boolean {
  if (!taskFitsMode(task, resolveDayMode(modes, dayKey))) return false;
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
