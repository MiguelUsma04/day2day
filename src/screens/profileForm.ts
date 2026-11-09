import { clampRate } from '../lib/nutrition/targets';
import type { Goal, Sex } from '../types/nutrition';

export type ProfileDraft = {
  sex: Sex | null;
  birthDate: string;
  heightCm: number | null;
};

const DEFAULT_RATE: Record<Goal, number> = { lose_fat: -0.5, maintain: 0, gain_muscle: 0.15 };

export function defaultRateFor(goal: Goal): number {
  return DEFAULT_RATE[goal];
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function profileDraftIsValid(draft: ProfileDraft): boolean {
  return draft.sex !== null && isValidDateKey(draft.birthDate) && draft.heightCm !== null && draft.heightCm > 0;
}

/** "−0,50 kg/semana" (true minus sign, decimal comma). */
export function formatRate(rate: number): string {
  const abs = Math.abs(rate).toFixed(2).replace('.', ',');
  const sign = rate < 0 ? '−' : rate > 0 ? '+' : '';
  return `${sign}${abs} kg/semana`;
}

/** Steps the rate by `delta`, rounded to 0.05 and clamped to the goal's range. */
export function stepRate(goal: Goal, rate: number, delta: number): number {
  return clampRate(goal, Math.round((rate + delta) * 20) / 20);
}

/** 450 -> "7 h 30". */
export function formatSleepGoal(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
