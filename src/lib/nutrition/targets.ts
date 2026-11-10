import type { BodyMeasurement, Goal, Macros, Profile, Sex } from '../../types/nutrition';
import { pickBmr } from './bmr';

export const KCAL_PER_KG = 7700;
export const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
export const RATE_RANGE: Record<Goal, [number, number]> = {
  lose_fat: [-0.7, -0.25],
  maintain: [0, 0],
  gain_muscle: [0.1, 0.3],
};
const PROTEIN_G_PER_KG: Record<Goal, number> = { lose_fat: 1.8, maintain: 1.6, gain_muscle: 2.0 };

export function clampRate(goal: Goal, rate: number): number {
  const [min, max] = RATE_RANGE[goal];
  return Math.min(max, Math.max(min, rate));
}

export function proteinTarget(a: { goal: Goal; weightKg: number; proteinGPerKg: number | null }): number {
  return Math.round((a.proteinGPerKg ?? PROTEIN_G_PER_KG[a.goal]) * a.weightKg);
}

export type DailyTarget = Macros & {
  tdee: number;
  bmr: number;
  /** Net kcal of the day's logged workouts, already inside `tdee`. */
  workoutKcal: number;
  floorApplied: boolean;
  method: 'measured' | 'katch' | 'mifflin';
};

export function dailyTarget(a: {
  profile: Profile;
  weightKg: number;
  latest: BodyMeasurement | null;
  today: string;
  workoutKcal: number;
}): DailyTarget {
  const { profile, weightKg } = a;
  const { bmr, method } = pickBmr({ profile, weightKg, latest: a.latest, today: a.today });
  const tdee = bmr * profile.activityFactor + a.workoutKcal;
  const rate = clampRate(profile.goal, profile.weeklyRateKg);
  const rawKcal = Math.round(tdee + (rate * KCAL_PER_KG) / 7);
  const floor = KCAL_FLOOR[profile.sex];
  const floorApplied = rawKcal < floor;
  const kcal = floorApplied ? floor : rawKcal;
  const proteinG = Math.round(proteinTarget({ goal: profile.goal, weightKg, proteinGPerKg: profile.proteinGPerKg }));
  const fatG = Math.round(0.8 * weightKg);
  const carbsG = Math.max(0, Math.round((kcal - 4 * proteinG - 9 * fatG) / 4));
  return { kcal, proteinG, carbsG, fatG, tdee, bmr, workoutKcal: a.workoutKcal, floorApplied, method };
}

/**
 * Changes exactly one macro while kcal stays fixed. Protein or fat changes are absorbed by carbs
 * (carbs hit 0 first, then fat absorbs a protein change); a carbs change is absorbed by fat.
 * Values are clamped so 4P + 4C + 9F never exceeds kcal beyond rounding.
 */
export function rebalanceMacros(
  t: Macros,
  change: { proteinG: number } | { carbsG: number } | { fatG: number },
): Macros {
  const next = { ...t, ...change };
  if ('carbsG' in change) {
    const maxCarbs = Math.max(0, Math.floor((t.kcal - 4 * next.proteinG) / 4));
    next.carbsG = Math.min(Math.max(0, change.carbsG), maxCarbs);
    next.fatG = Math.max(0, Math.round((t.kcal - 4 * next.proteinG - 4 * next.carbsG) / 9));
    return next;
  }
  if ('proteinG' in change) next.proteinG = Math.min(Math.max(0, change.proteinG), Math.floor(t.kcal / 4));
  const carbs = Math.round((t.kcal - 4 * next.proteinG - 9 * next.fatG) / 4);
  if (carbs >= 0) {
    next.carbsG = carbs;
  } else {
    next.carbsG = 0;
    next.fatG = Math.max(0, Math.round((t.kcal - 4 * next.proteinG) / 9));
  }
  return next;
}
