import type { DayModeRecord, ResolvedDayMode, Task } from '../types/task';
import { fromDayKey } from '../utils/date';

/**
 * Day modes decide which activities a day shows.
 *
 * Only marked days are stored. Everything else falls back to a default:
 * Saturday and Sunday are 'city' days, the rest 'normal'. A 'farm' task shows
 * only on days marked 'farm'; a 'city' task on any day that is not 'farm'; an
 * 'any' task always. A 'holiday' shows nothing at all.
 */

export type DayModeMap = ReadonlyMap<string, DayModeRecord>;

export function isWeekend(dayKey: string): boolean {
  const weekday = fromDayKey(dayKey).getDay();
  return weekday === 0 || weekday === 6;
}

export function resolveDayMode(modes: DayModeMap | undefined, dayKey: string): ResolvedDayMode {
  const marked = modes?.get(dayKey)?.mode;
  if (marked) return marked;
  return isWeekend(dayKey) ? 'city' : 'normal';
}

export function taskFitsMode(task: Pick<Task, 'context'>, mode: ResolvedDayMode): boolean {
  if (mode === 'holiday') return false;
  switch (task.context) {
    case 'farm':
      return mode === 'farm';
    case 'city':
      return mode !== 'farm';
    default:
      return true;
  }
}

export function toDayModeMap(records: readonly DayModeRecord[]): Map<string, DayModeRecord> {
  return new Map(records.map((r) => [r.id, r]));
}
