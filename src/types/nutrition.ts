export type Synced = { id: string; createdAt: number; updatedAt: number };
export type Sex = 'female' | 'male';
export type Goal = 'lose_fat' | 'maintain' | 'gain_muscle';
export const ACTIVITY_FACTORS = [1.2, 1.375, 1.55] as const;
export type Profile = Synced & {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  goal: Goal;
  weeklyRateKg: number;
  targetWeightKg: number | null;
  targetFatPct: number | null;
  activityFactor: (typeof ACTIVITY_FACTORS)[number];
  proteinGPerKg: number | null; // null = rule by goal
  sleepGoalMin: number;
  workoutsPerWeek: number;
}; // id = userId
export type BodyMeasurement = Synced & {
  date: string;
  weightKg: number | null;
  fatPct: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  skeletalMuscleKg: number | null;
  visceralFatLevel: number | null;
  bmrMeasured: number | null;
  waistCm: number | null;
  source: 'scale' | 'bioimpedance' | 'tape';
};
export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };
