import { MET_TABLE, workoutKcal } from '../lib/nutrition/met';
import { sleepDuration } from '../lib/nutrition/sleep';
import { clampRate, dailyTarget, type DailyTarget } from '../lib/nutrition/targets';
import type {
  BodyMeasurement,
  Meal,
  Profile,
  SleepLog,
  Synced,
  UserPortion,
  WaterLog,
  WeightEntry,
  Workout,
} from '../types/nutrition';

/**
 * Pure list updates behind `useNutrition`. Each returns the same reference when
 * nothing changes and new objects only for what it touched, so the hook's
 * `stamped` wrapper can tell which records to re-stamp and sync.
 */

export type ProfileFields = Omit<Profile, keyof Synced>;
export type MeasurementFields = Omit<BodyMeasurement, keyof Synced>;
export type SleepFields = Omit<SleepLog, keyof Synced | 'date'>;
/** `kcalNet` is optional: when the watch or the machine reports it, it replaces the MET estimate. */
export type WorkoutDraft = Omit<Workout, keyof Synced | 'met' | 'kcalNet'> & { kcalNet?: number | null };
export type MealFields = Omit<Meal, keyof Synced>;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function deleteByIdIn<T extends { id: string }>(list: T[], id: string): T[] {
  const next = list.filter((item) => item.id !== id);
  return next.length === list.length ? list : next;
}

/** Replaces `id` with `build(existing)`, or appends it; no-op when `same` says nothing changed. */
function upsert<T extends { id: string }>(
  list: T[],
  id: string,
  build: (existing: T | undefined) => T,
  same: (a: T, b: T) => boolean,
): T[] {
  const index = list.findIndex((item) => item.id === id);
  const existing = index === -1 ? undefined : list[index];
  const next = build(existing);
  if (existing && same(existing, next)) return list;
  if (index === -1) return [...list, next];
  const copy = [...list];
  copy[index] = next;
  return copy;
}

/** Shallow field comparison, ignoring the sync timestamps. */
function sameFields<T extends object>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === 'updatedAt' || key === 'createdAt') continue;
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
  }
  return true;
}

// ---- Weight (id = date) -------------------------------------------------

export function setWeightIn(list: WeightEntry[], date: string, weightKg: number, now: number): WeightEntry[] {
  return upsert(
    list,
    date,
    (old) => ({ id: date, date, weightKg, createdAt: old?.createdAt ?? now, updatedAt: now }),
    sameFields,
  );
}

export function clearWeightIn(list: WeightEntry[], date: string): WeightEntry[] {
  return deleteByIdIn(list, date);
}

// ---- Water (id = date) --------------------------------------------------

/** Sets the day's total; a zero or negative total clears the day. */
export function setWaterIn(list: WaterLog[], date: string, ml: number, now: number): WaterLog[] {
  const total = Math.round(ml);
  if (total <= 0) return deleteByIdIn(list, date);
  return upsert(
    list,
    date,
    (old) => ({ id: date, date, ml: total, createdAt: old?.createdAt ?? now, updatedAt: now }),
    sameFields,
  );
}

export function addWaterIn(list: WaterLog[], date: string, deltaMl: number, now: number): WaterLog[] {
  const current = list.find((w) => w.id === date)?.ml ?? 0;
  return setWaterIn(list, date, current + deltaMl, now);
}

// ---- Sleep (id = date) --------------------------------------------------

/** When both bed and wake times are given, the duration is derived from them. */
export function setSleepIn(list: SleepLog[], date: string, log: SleepFields, now: number): SleepLog[] {
  const durationMin =
    log.bedAtMinutes !== null && log.wakeAtMinutes !== null
      ? sleepDuration(log.bedAtMinutes, log.wakeAtMinutes)
      : log.durationMin;
  return upsert(
    list,
    date,
    (old) => ({
      id: date,
      date,
      bedAtMinutes: log.bedAtMinutes,
      wakeAtMinutes: log.wakeAtMinutes,
      durationMin,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    }),
    sameFields,
  );
}

export function clearSleepIn(list: SleepLog[], date: string): SleepLog[] {
  return deleteByIdIn(list, date);
}

// ---- Workouts -----------------------------------------------------------

export function addWorkoutIn(
  list: Workout[],
  w: WorkoutDraft,
  weightKg: number,
  id: string,
  now: number,
): Workout[] {
  const { kcalNet: reported, ...fields } = w;
  const workout: Workout = {
    ...fields,
    id,
    met: MET_TABLE[w.kind][w.intensity],
    kcalNet:
      typeof reported === 'number' && Number.isFinite(reported) && reported > 0
        ? Math.round(reported)
        : workoutKcal(w.kind, w.intensity, w.minutes, weightKg),
    createdAt: now,
    updatedAt: now,
  };
  return [...list, workout];
}

// ---- Meals --------------------------------------------------------------

export function addMealIn(list: Meal[], m: MealFields, id: string, now: number): Meal[] {
  return [...list, { ...m, id, createdAt: now, updatedAt: now }];
}

export function updateMealIn(list: Meal[], id: string, patch: Partial<MealFields>): Meal[] {
  const index = list.findIndex((m) => m.id === id);
  if (index === -1) return list;
  const merged = { ...list[index], ...patch };
  if (sameFields(list[index], merged)) return list;
  const copy = [...list];
  copy[index] = merged;
  return copy;
}

// ---- Portions (id = foodKey) --------------------------------------------

/** Running mean of the grams served for a food, so the next serving can be pre-filled. */
export function rememberPortionIn(
  list: UserPortion[],
  foodKey: string,
  grams: number,
  now: number,
): UserPortion[] {
  return upsert(
    list,
    foodKey,
    (old) => ({
      id: foodKey,
      foodKey,
      grams: old ? round1((old.grams * old.samples + grams) / (old.samples + 1)) : round1(grams),
      samples: (old?.samples ?? 0) + 1,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    }),
    // Every call adds a sample, so it always counts as a change.
    () => false,
  );
}

// ---- Profile and measurements -------------------------------------------

export function upsertProfileIn(list: Profile[], id: string, patch: ProfileFields, now: number): Profile[] {
  const fields = { ...patch, weeklyRateKg: clampRate(patch.goal, patch.weeklyRateKg) };
  return upsert(
    list,
    id,
    (old) => ({ ...fields, id, createdAt: old?.createdAt ?? now, updatedAt: now }),
    sameFields,
  );
}

/** Creates the measurement `id`, or merges `patch` into it. */
export function upsertMeasurementIn(
  list: BodyMeasurement[],
  id: string,
  patch: Partial<MeasurementFields>,
  now: number,
): BodyMeasurement[] {
  const index = list.findIndex((m) => m.id === id);
  if (index === -1) {
    // Creating needs the full record; the hook passes one.
    return [...list, { ...(patch as MeasurementFields), id, createdAt: now, updatedAt: now }];
  }
  const merged = { ...list[index], ...patch };
  if (sameFields(list[index], merged)) return list;
  const copy = [...list];
  copy[index] = merged;
  return copy;
}

// ---- Derived values -----------------------------------------------------

export function latestMeasurementOf(list: BodyMeasurement[]): BodyMeasurement | null {
  let latest: BodyMeasurement | null = null;
  for (const m of list) if (!latest || m.date > latest.date) latest = m;
  return latest;
}

/** Latest logged weight; else the latest measurement's weight; else null. */
export function currentWeightOf(weights: WeightEntry[], measurements: BodyMeasurement[]): number | null {
  let latest: WeightEntry | null = null;
  for (const w of weights) if (!latest || w.date > latest.date) latest = w;
  if (latest) return latest.weightKg;
  return latestMeasurementOf(measurements)?.weightKg ?? null;
}

/** The day's target, or null without a profile or any known weight. */
export function computeTarget(a: {
  profile: Profile | null;
  weights: WeightEntry[];
  measurements: BodyMeasurement[];
  workouts: Workout[];
  date: string;
}): DailyTarget | null {
  if (!a.profile) return null;
  const weightKg = currentWeightOf(a.weights, a.measurements);
  if (weightKg === null) return null;
  const burned = a.workouts.filter((w) => w.date === a.date).reduce((sum, w) => sum + w.kcalNet, 0);
  return dailyTarget({
    profile: a.profile,
    weightKg,
    latest: latestMeasurementOf(a.measurements),
    today: a.date,
    workoutKcal: burned,
  });
}
