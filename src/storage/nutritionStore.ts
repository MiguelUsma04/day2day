import AsyncStorage from '@react-native-async-storage/async-storage';

import { mealTotals } from '../lib/nutrition/mealMath';
import {
  ACTIVITY_FACTORS,
  MEAL_SLOTS,
  WORKOUT_KINDS,
  type BodyMeasurement,
  type EatenPct,
  type FoodRef,
  type FoodSource,
  type Goal,
  type Meal,
  type MealItem,
  type Profile,
  type SleepLog,
  type UserPortion,
  type WaterLog,
  type WeightEntry,
  type Workout,
} from '../types/nutrition';

export const NUTRITION_KEYS: Record<
  | 'profiles'
  | 'body_measurements'
  | 'weights'
  | 'sleep_logs'
  | 'water_logs'
  | 'workouts'
  | 'meals'
  | 'user_portions',
  string
> = {
  profiles: 'day2day:profiles:v1',
  body_measurements: 'day2day:body_measurements:v1',
  weights: 'day2day:weights:v1',
  sleep_logs: 'day2day:sleep_logs:v1',
  water_logs: 'day2day:water_logs:v1',
  workouts: 'day2day:workouts:v1',
  meals: 'day2day:meals:v1',
  user_portions: 'day2day:user_portions:v1',
};

export async function loadList<T>(
  key: string,
  normalize: (raw: unknown) => T | null,
): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((t): t is T => t !== null);
  } catch {
    // A corrupt payload should not brick the app; start clean instead.
    return [];
  }
}

export async function saveList<T>(key: string, items: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Best-effort; in-memory state stays authoritative for the session.
  }
}

// ---- Helpers ----------------------------------------------------------

type Obj = Record<string, unknown>;

function asObj(raw: unknown): Obj | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Obj) : null;
}

const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (num(v) ? v : null);
const oneOf = <T extends string | number>(list: readonly T[], v: unknown): v is T =>
  (list as readonly unknown[]).includes(v);

function stamps(o: Obj): { createdAt: number; updatedAt: number } {
  const createdAt = num(o.createdAt) ? o.createdAt : Date.now();
  // Records without updatedAt fall back to creation time, as in tasks.ts.
  return { createdAt, updatedAt: num(o.updatedAt) ? o.updatedAt : createdAt };
}

type SyncCols = {
  id: string;
  user_id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  synced_at?: string;
};

function syncCols(x: { id: string; createdAt: number; updatedAt: number }, userId: string): SyncCols {
  return {
    id: x.id,
    user_id: userId,
    created_at: x.createdAt,
    updated_at: x.updatedAt,
    deleted_at: null,
  };
}

const rowStamps = (row: SyncCols) => ({ createdAt: row.created_at, updatedAt: row.updated_at });

// ---- Profile ----------------------------------------------------------

export type ProfileRow = SyncCols & {
  sex: string;
  birth_date: string;
  height_cm: number;
  goal: string;
  weekly_rate_kg: number;
  target_weight_kg: number | null;
  target_fat_pct: number | null;
  activity_factor: number;
  protein_g_per_kg: number | null;
  sleep_goal_min: number;
  workouts_per_week: number;
};

const GOALS: readonly Goal[] = ['lose_fat', 'maintain', 'gain_muscle'];

export function normalizeProfile(raw: unknown): Profile | null {
  const o = asObj(raw);
  if (!o || !str(o.id) || !str(o.birthDate)) return null;
  if (o.sex !== 'female' && o.sex !== 'male') return null;
  return {
    id: o.id,
    ...stamps(o),
    sex: o.sex,
    birthDate: o.birthDate,
    heightCm: num(o.heightCm) ? o.heightCm : 0,
    goal: oneOf(GOALS, o.goal) ? o.goal : 'maintain',
    weeklyRateKg: num(o.weeklyRateKg) ? o.weeklyRateKg : 0,
    targetWeightKg: numOrNull(o.targetWeightKg),
    targetFatPct: numOrNull(o.targetFatPct),
    activityFactor: oneOf(ACTIVITY_FACTORS, o.activityFactor) ? o.activityFactor : 1.375,
    proteinGPerKg: numOrNull(o.proteinGPerKg),
    sleepGoalMin: num(o.sleepGoalMin) ? o.sleepGoalMin : 450,
    workoutsPerWeek: num(o.workoutsPerWeek) ? o.workoutsPerWeek : 0,
  };
}

export function toProfileRow(p: Profile, userId: string): ProfileRow {
  return {
    ...syncCols(p, userId),
    sex: p.sex,
    birth_date: p.birthDate,
    height_cm: p.heightCm,
    goal: p.goal,
    weekly_rate_kg: p.weeklyRateKg,
    target_weight_kg: p.targetWeightKg,
    target_fat_pct: p.targetFatPct,
    activity_factor: p.activityFactor,
    protein_g_per_kg: p.proteinGPerKg,
    sleep_goal_min: p.sleepGoalMin,
    workouts_per_week: p.workoutsPerWeek,
  };
}

export function fromProfileRow(row: ProfileRow): Profile | null {
  return normalizeProfile({
    id: row.id,
    ...rowStamps(row),
    sex: row.sex,
    birthDate: row.birth_date,
    heightCm: row.height_cm,
    goal: row.goal,
    weeklyRateKg: row.weekly_rate_kg,
    targetWeightKg: row.target_weight_kg,
    targetFatPct: row.target_fat_pct,
    activityFactor: row.activity_factor,
    proteinGPerKg: row.protein_g_per_kg,
    sleepGoalMin: row.sleep_goal_min,
    workoutsPerWeek: row.workouts_per_week,
  });
}

// ---- Body measurements ------------------------------------------------

export type BodyMeasurementRow = SyncCols & {
  date: string;
  weight_kg: number | null;
  fat_pct: number | null;
  fat_mass_kg: number | null;
  lean_mass_kg: number | null;
  skeletal_muscle_kg: number | null;
  visceral_fat_level: number | null;
  bmr_measured: number | null;
  waist_cm: number | null;
  source: string;
};

const BODY_SOURCES: readonly BodyMeasurement['source'][] = ['scale', 'bioimpedance', 'tape'];

export function normalizeBodyMeasurement(raw: unknown): BodyMeasurement | null {
  const o = asObj(raw);
  if (!o || !str(o.id) || !str(o.date)) return null;
  return {
    id: o.id,
    ...stamps(o),
    date: o.date,
    weightKg: numOrNull(o.weightKg),
    fatPct: numOrNull(o.fatPct),
    fatMassKg: numOrNull(o.fatMassKg),
    leanMassKg: numOrNull(o.leanMassKg),
    skeletalMuscleKg: numOrNull(o.skeletalMuscleKg),
    visceralFatLevel: numOrNull(o.visceralFatLevel),
    bmrMeasured: numOrNull(o.bmrMeasured),
    waistCm: numOrNull(o.waistCm),
    source: oneOf(BODY_SOURCES, o.source) ? o.source : 'scale',
  };
}

export function toBodyMeasurementRow(b: BodyMeasurement, userId: string): BodyMeasurementRow {
  return {
    ...syncCols(b, userId),
    date: b.date,
    weight_kg: b.weightKg,
    fat_pct: b.fatPct,
    fat_mass_kg: b.fatMassKg,
    lean_mass_kg: b.leanMassKg,
    skeletal_muscle_kg: b.skeletalMuscleKg,
    visceral_fat_level: b.visceralFatLevel,
    bmr_measured: b.bmrMeasured,
    waist_cm: b.waistCm,
    source: b.source,
  };
}

export function fromBodyMeasurementRow(row: BodyMeasurementRow): BodyMeasurement | null {
  return normalizeBodyMeasurement({
    id: row.id,
    ...rowStamps(row),
    date: row.date,
    weightKg: row.weight_kg,
    fatPct: row.fat_pct,
    fatMassKg: row.fat_mass_kg,
    leanMassKg: row.lean_mass_kg,
    skeletalMuscleKg: row.skeletal_muscle_kg,
    visceralFatLevel: row.visceral_fat_level,
    bmrMeasured: row.bmr_measured,
    waistCm: row.waist_cm,
    source: row.source,
  });
}

// ---- Weights (id = date) ----------------------------------------------

export type WeightRow = SyncCols & { date: string; weight_kg: number };

export function normalizeWeight(raw: unknown): WeightEntry | null {
  const o = asObj(raw);
  if (!o || !str(o.date) || !num(o.weightKg)) return null;
  return { id: o.date, ...stamps(o), date: o.date, weightKg: o.weightKg };
}

export function toWeightRow(w: WeightEntry, userId: string): WeightRow {
  return { ...syncCols(w, userId), date: w.date, weight_kg: w.weightKg };
}

export function fromWeightRow(row: WeightRow): WeightEntry | null {
  return normalizeWeight({
    ...rowStamps(row),
    date: row.date,
    weightKg: row.weight_kg,
  });
}

// ---- Water logs (id = date) -------------------------------------------

export type WaterLogRow = SyncCols & { date: string; ml: number };

export function normalizeWaterLog(raw: unknown): WaterLog | null {
  const o = asObj(raw);
  if (!o || !str(o.date) || !num(o.ml) || o.ml < 0) return null;
  return { id: o.date, ...stamps(o), date: o.date, ml: Math.round(o.ml) };
}

export function toWaterLogRow(w: WaterLog, userId: string): WaterLogRow {
  return { ...syncCols(w, userId), date: w.date, ml: w.ml };
}

export function fromWaterLogRow(row: WaterLogRow): WaterLog | null {
  return normalizeWaterLog({ ...rowStamps(row), date: row.date, ml: row.ml });
}

// ---- Sleep logs (id = date) -------------------------------------------

export type SleepLogRow = SyncCols & {
  date: string;
  bed_at_minutes: number | null;
  wake_at_minutes: number | null;
  duration_min: number;
};

export function normalizeSleepLog(raw: unknown): SleepLog | null {
  const o = asObj(raw);
  if (!o || !str(o.date) || !num(o.durationMin)) return null;
  return {
    id: o.date,
    ...stamps(o),
    date: o.date,
    bedAtMinutes: numOrNull(o.bedAtMinutes),
    wakeAtMinutes: numOrNull(o.wakeAtMinutes),
    durationMin: o.durationMin,
  };
}

export function toSleepLogRow(s: SleepLog, userId: string): SleepLogRow {
  return {
    ...syncCols(s, userId),
    date: s.date,
    bed_at_minutes: s.bedAtMinutes,
    wake_at_minutes: s.wakeAtMinutes,
    duration_min: s.durationMin,
  };
}

export function fromSleepLogRow(row: SleepLogRow): SleepLog | null {
  return normalizeSleepLog({
    ...rowStamps(row),
    date: row.date,
    bedAtMinutes: row.bed_at_minutes,
    wakeAtMinutes: row.wake_at_minutes,
    durationMin: row.duration_min,
  });
}

// ---- Workouts ---------------------------------------------------------

export type WorkoutRow = SyncCols & {
  date: string;
  kind: string;
  minutes: number;
  intensity: string;
  met: number;
  kcal_net: number;
};

const INTENSITIES: readonly Workout['intensity'][] = ['light', 'normal', 'hard'];

export function normalizeWorkout(raw: unknown): Workout | null {
  const o = asObj(raw);
  if (!o || !str(o.id) || !str(o.date) || !oneOf(WORKOUT_KINDS, o.kind)) return null;
  return {
    id: o.id,
    ...stamps(o),
    date: o.date,
    kind: o.kind,
    minutes: num(o.minutes) ? o.minutes : 0,
    intensity: oneOf(INTENSITIES, o.intensity) ? o.intensity : 'normal',
    met: num(o.met) ? o.met : 0,
    kcalNet: num(o.kcalNet) ? o.kcalNet : 0,
  };
}

export function toWorkoutRow(w: Workout, userId: string): WorkoutRow {
  return {
    ...syncCols(w, userId),
    date: w.date,
    kind: w.kind,
    minutes: w.minutes,
    intensity: w.intensity,
    met: w.met,
    kcal_net: w.kcalNet,
  };
}

export function fromWorkoutRow(row: WorkoutRow): Workout | null {
  return normalizeWorkout({
    id: row.id,
    ...rowStamps(row),
    date: row.date,
    kind: row.kind,
    minutes: row.minutes,
    intensity: row.intensity,
    met: row.met,
    kcalNet: row.kcal_net,
  });
}

// ---- Meals ------------------------------------------------------------

export type MealRow = SyncCols & {
  date: string;
  slot: string;
  time_minutes: number;
  title: string;
  eaten_pct: number;
  items: MealItem[];
  source: string;
  analysis_id: string | null;
  photo_path: string | null;
  // Derived from items on write so the server can aggregate; ignored on read.
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const EATEN_PCTS: readonly EatenPct[] = [25, 50, 75, 100];
const FOOD_SOURCES: readonly FoodSource[] = ['tcac', 'usda', 'off', 'user', 'ai'];
const MEAL_SOURCES: readonly Meal['source'][] = ['photo', 'text', 'manual'];

function normalizeFood(raw: unknown): FoodRef | null {
  const f = asObj(raw);
  const p = f ? asObj(f.per100) : null;
  if (!f || !p || !str(f.id)) return null;
  if (!num(p.kcal) || !num(p.proteinG) || !num(p.carbsG) || !num(p.fatG)) return null;
  return {
    id: f.id,
    source: oneOf(FOOD_SOURCES, f.source) ? f.source : 'user',
    name: str(f.name) ? f.name : '',
    per100: { kcal: p.kcal, proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG },
    verified: f.verified === true,
  };
}

function normalizeItem(raw: unknown, index: number): MealItem | null {
  const o = asObj(raw);
  if (!o || !str(o.name) || !num(o.grams)) return null;
  return {
    id: str(o.id) ? o.id : `item-${index}`,
    food: normalizeFood(o.food),
    name: o.name,
    grams: o.grams,
    gramsMin: numOrNull(o.gramsMin),
    gramsMax: numOrNull(o.gramsMax),
    weighed: o.weighed === true,
    confidence: numOrNull(o.confidence),
    isHiddenFat: o.isHiddenFat === true,
    sortOrder: num(o.sortOrder) ? o.sortOrder : index,
  };
}

export function normalizeMeal(raw: unknown): Meal | null {
  const o = asObj(raw);
  if (!o || !str(o.id) || !str(o.date) || !oneOf(MEAL_SLOTS, o.slot)) return null;
  const items = Array.isArray(o.items)
    ? o.items.map(normalizeItem).filter((i): i is MealItem => i !== null)
    : [];
  return {
    id: o.id,
    ...stamps(o),
    date: o.date,
    slot: o.slot,
    timeMinutes: num(o.timeMinutes) ? o.timeMinutes : 0,
    title: str(o.title) ? o.title : '',
    eatenPct: oneOf(EATEN_PCTS, o.eatenPct) ? o.eatenPct : 100,
    items,
    source: oneOf(MEAL_SOURCES, o.source) ? o.source : 'manual',
    analysisId: str(o.analysisId) ? o.analysisId : null,
    photoPath: str(o.photoPath) && o.photoPath ? o.photoPath : null,
  };
}

export function toMealRow(m: Meal, userId: string): MealRow {
  const totals = mealTotals(m);
  return {
    ...syncCols(m, userId),
    date: m.date,
    slot: m.slot,
    time_minutes: m.timeMinutes,
    title: m.title,
    eaten_pct: m.eatenPct,
    items: m.items,
    source: m.source,
    analysis_id: m.analysisId,
    photo_path: m.photoPath,
    kcal: totals.kcal,
    protein_g: totals.proteinG,
    carbs_g: totals.carbsG,
    fat_g: totals.fatG,
  };
}

export function fromMealRow(row: MealRow): Meal | null {
  return normalizeMeal({
    id: row.id,
    ...rowStamps(row),
    date: row.date,
    slot: row.slot,
    timeMinutes: row.time_minutes,
    title: row.title,
    eatenPct: row.eaten_pct,
    items: row.items,
    source: row.source,
    analysisId: row.analysis_id,
    photoPath: row.photo_path,
  });
}

// ---- User portions (id = foodKey) -------------------------------------

export type UserPortionRow = SyncCols & { food_key: string; grams: number; samples: number };

export function normalizeUserPortion(raw: unknown): UserPortion | null {
  const o = asObj(raw);
  if (!o || !str(o.foodKey) || !num(o.grams)) return null;
  return {
    id: o.foodKey,
    ...stamps(o),
    foodKey: o.foodKey,
    grams: o.grams,
    samples: num(o.samples) ? o.samples : 1,
  };
}

export function toUserPortionRow(p: UserPortion, userId: string): UserPortionRow {
  return { ...syncCols(p, userId), food_key: p.foodKey, grams: p.grams, samples: p.samples };
}

export function fromUserPortionRow(row: UserPortionRow): UserPortion | null {
  return normalizeUserPortion({
    ...rowStamps(row),
    foodKey: row.food_key,
    grams: row.grams,
    samples: row.samples,
  });
}
