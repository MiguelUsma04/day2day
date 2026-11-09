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
export type WeightEntry = Synced & { date: string; weightKg: number }; // id = date
export type SleepLog = Synced & {
  date: string;
  bedAtMinutes: number | null;
  wakeAtMinutes: number | null;
  durationMin: number;
}; // id = date
export const WORKOUT_KINDS = [
  'gym_strength', 'treadmill', 'calisthenics', 'cardio', 'football', 'walk', 'other',
] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];
export type WorkoutIntensity = 'light' | 'normal' | 'hard';
export type Workout = Synced & {
  date: string;
  kind: WorkoutKind;
  minutes: number;
  intensity: WorkoutIntensity;
  met: number;
  kcalNet: number;
};
export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type FoodSource = 'tcac' | 'usda' | 'off' | 'user' | 'ai';
export type FoodRef = { id: string; source: FoodSource; name: string; per100: Macros; verified: boolean };
export type MealItem = {
  id: string;
  food: FoodRef | null;
  name: string;
  grams: number;
  gramsMin: number | null;
  gramsMax: number | null;
  weighed: boolean;
  confidence: number | null;
  isHiddenFat: boolean;
  sortOrder: number;
};
export type EatenPct = 25 | 50 | 75 | 100;
export type Meal = Synced & {
  date: string;
  slot: MealSlot;
  timeMinutes: number;
  title: string;
  eatenPct: EatenPct;
  items: MealItem[];
  source: 'photo' | 'text' | 'manual';
  analysisId: string | null;
};
export type UserPortion = Synced & { foodKey: string; grams: number; samples: number }; // id = foodKey
