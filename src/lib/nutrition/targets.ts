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
  return (a.proteinGPerKg ?? PROTEIN_G_PER_KG[a.goal]) * a.weightKg;
}

export type DailyTarget = Macros & {
  tdee: number;
  bmr: number;
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
  return { kcal, proteinG, carbsG, fatG, tdee, bmr, floorApplied, method };
}

/** Moves grams between macros while keeping kcal fixed; never returns negative values. */
export function rebalanceMacros(
  t: Macros,
  change: Partial<Pick<Macros, 'proteinG' | 'carbsG' | 'fatG'>>,
): Macros {
  const next = { ...t, ...change };
  if (change.carbsG !== undefined && change.proteinG === undefined && change.fatG === undefined) {
    next.fatG = Math.max(0, Math.round((t.kcal - 4 * next.proteinG - 4 * next.carbsG) / 9));
    return next;
  }
  const carbs = Math.round((t.kcal - 4 * next.proteinG - 9 * next.fatG) / 4);
  if (carbs >= 0) {
    next.carbsG = carbs;
  } else {
    next.carbsG = 0;
    next.fatG = Math.max(0, Math.round((t.kcal - 4 * next.proteinG) / 9));
  }
  return next;
}
