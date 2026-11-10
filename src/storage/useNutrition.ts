import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { DailyTarget } from '../lib/nutrition/targets';
import { emaTrend, type TrendPoint } from '../lib/nutrition/trend';
import type {
  BodyMeasurement,
  Meal,
  Profile,
  SleepLog,
  UserPortion,
  WaterLog,
  WeightEntry,
  Workout,
} from '../types/nutrition';
import { createId } from '../utils/id';
import { COLLECTIONS } from './collections';
import {
  addMealIn,
  addWaterIn,
  addWorkoutIn,
  clearSleepIn,
  clearWeightIn,
  computeTarget,
  currentWeightOf,
  deleteByIdIn,
  latestMeasurementOf,
  rememberPortionIn,
  setSleepIn,
  setWaterIn,
  setWeightIn,
  updateMealIn,
  upsertMeasurementIn,
  upsertProfileIn,
  type MealFields,
  type MeasurementFields,
  type ProfileFields,
  type SleepFields,
  type WorkoutDraft,
} from './nutritionReducers';
import { loadList, saveList } from './nutritionStore';
import { useCloudSync, type CloudSync } from './useCloudSync';

/** Profile id while signed out; replaced by the user id on the first save after sign-in. */
const LOCAL_PROFILE_ID = 'local';

export type NutritionStore = {
  isLoading: boolean;
  profile: Profile | null;
  measurements: BodyMeasurement[];
  weights: WeightEntry[];
  sleepLogs: SleepLog[];
  waterLogs: WaterLog[];
  workouts: Workout[];
  meals: Meal[];
  portions: UserPortion[];
  saveProfile(patch: ProfileFields): void;
  addMeasurement(m: MeasurementFields): void;
  updateMeasurement(id: string, patch: Partial<MeasurementFields>): void;
  deleteMeasurement(id: string): void;
  setWeight(date: string, weightKg: number): void;
  clearWeight(date: string): void;
  setSleep(date: string, log: SleepFields): void;
  clearSleep(date: string): void;
  setWater(date: string, ml: number): void;
  addWater(date: string, deltaMl: number): void;
  addWorkout(w: WorkoutDraft, weightKg: number): void;
  deleteWorkout(id: string): void;
  addMeal(m: MealFields): Meal;
  updateMeal(id: string, patch: Partial<MealFields>): void;
  deleteMeal(id: string): void;
  rememberPortion(foodKey: string, grams: number): void;
  getMealsForDay(date: string): Meal[];
  getWeightFor(date: string): WeightEntry | null;
  getSleepFor(date: string): SleepLog | null;
  getWaterFor(date: string): WaterLog | null;
  getWorkoutsFor(date: string): Workout[];
  latestMeasurement(): BodyMeasurement | null;
  currentWeightKg(): number | null;
  trend(): TrendPoint[];
  targetFor(date: string): DailyTarget | null;
  cloud: CloudSync;
};

/** Same as in `useTasks`: re-stamps `updatedAt` on every record the updater replaced. */
function stamped<T extends { id: string; updatedAt: number }>(prev: T[], next: T[]): T[] {
  if (prev === next) return next;
  const before = new Map(prev.map((t) => [t.id, t]));
  const now = Date.now();
  return next.map((t) => (before.get(t.id) === t ? t : { ...t, updatedAt: now }));
}

type Updater<T> = (prev: T[]) => T[];

/**
 * One local-first collection: state hydrated from AsyncStorage, persisted on
 * every change after hydration, with a stamping setter for local edits and the
 * raw setter for the sync to apply server records as-is.
 */
function useCollection<T extends { id: string; updatedAt: number }>(storageKey: string, hydrated: boolean) {
  const [items, setRaw] = useState<T[]>([]);
  const set = useCallback((updater: Updater<T>) => setRaw((prev) => stamped(prev, updater(prev))), []);
  // Persist only after hydration, so the initial empty state never overwrites stored data.
  useEffect(() => {
    if (!hydrated) return;
    void saveList(storageKey, items);
  }, [items, hydrated, storageKey]);
  return { items, set, setRaw };
}

export function useNutrition(userId: string | null): NutritionStore {
  const [isLoading, setIsLoading] = useState(true);
  const hydratedRef = useRef(false);
  const hydrated = !isLoading;

  const profiles = useCollection<Profile>(COLLECTIONS.profiles.storageKey, hydrated);
  const measurements = useCollection<BodyMeasurement>(COLLECTIONS.body_measurements.storageKey, hydrated);
  const weights = useCollection<WeightEntry>(COLLECTIONS.weights.storageKey, hydrated);
  const sleepLogs = useCollection<SleepLog>(COLLECTIONS.sleep_logs.storageKey, hydrated);
  const waterLogs = useCollection<WaterLog>(COLLECTIONS.water_logs.storageKey, hydrated);
  const workouts = useCollection<Workout>(COLLECTIONS.workouts.storageKey, hydrated);
  const meals = useCollection<Meal>(COLLECTIONS.meals.storageKey, hydrated);
  const portions = useCollection<UserPortion>(COLLECTIONS.user_portions.storageKey, hydrated);

  useEffect(() => {
    let active = true;
    const c = COLLECTIONS;
    Promise.all([
      loadList(c.profiles.storageKey, c.profiles.normalize),
      loadList(c.body_measurements.storageKey, c.body_measurements.normalize),
      loadList(c.weights.storageKey, c.weights.normalize),
      loadList(c.sleep_logs.storageKey, c.sleep_logs.normalize),
      loadList(c.water_logs.storageKey, c.water_logs.normalize),
      loadList(c.workouts.storageKey, c.workouts.normalize),
      loadList(c.meals.storageKey, c.meals.normalize),
      loadList(c.user_portions.storageKey, c.user_portions.normalize),
    ]).then(([p, m, w, s, wa, wo, me, po]) => {
      if (!active || hydratedRef.current) return;
      profiles.setRaw(p);
      measurements.setRaw(m);
      weights.setRaw(w);
      sleepLogs.setRaw(s);
      waterLogs.setRaw(wa);
      workouts.setRaw(wo);
      meals.setRaw(me);
      portions.setRaw(po);
      hydratedRef.current = true;
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Raw setters: what arrives from the server already carries its own updatedAt.
  // The binding list is fixed, as useCloudSync requires.
  const cloud = useCloudSync({
    userId,
    ready: hydrated,
    bindings: [
      { def: COLLECTIONS.profiles, items: profiles.items, setItems: profiles.setRaw },
      { def: COLLECTIONS.body_measurements, items: measurements.items, setItems: measurements.setRaw },
      { def: COLLECTIONS.weights, items: weights.items, setItems: weights.setRaw },
      { def: COLLECTIONS.sleep_logs, items: sleepLogs.items, setItems: sleepLogs.setRaw },
      { def: COLLECTIONS.water_logs, items: waterLogs.items, setItems: waterLogs.setRaw },
      { def: COLLECTIONS.workouts, items: workouts.items, setItems: workouts.setRaw },
      { def: COLLECTIONS.meals, items: meals.items, setItems: meals.setRaw },
      { def: COLLECTIONS.user_portions, items: portions.items, setItems: portions.setRaw },
    ],
  });

  // Pull when the app comes back to the foreground, like useTasks does for the routine.
  useEffect(() => {
    if (!userId) return;
    const onActive = () => void cloud.syncNow();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onActive();
    });
    let detach: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') onActive();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onActive);
      detach = () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onActive);
      };
    }
    return () => {
      sub.remove();
      detach?.();
    };
  }, [userId, cloud.syncNow]);

  const profileId = userId ?? LOCAL_PROFILE_ID;
  const profile = useMemo(
    () =>
      profiles.items.find((p) => p.id === profileId) ??
      profiles.items.find((p) => p.id === LOCAL_PROFILE_ID) ??
      null,
    [profiles.items, profileId],
  );

  // ---- mutations ---------------------------------------------------------

  const saveProfile = useCallback(
    (patch: ProfileFields) => {
      const now = Date.now();
      profiles.set((prev) => {
        // Signed in: the profile set up while signed out becomes this user's.
        const base = userId ? deleteByIdIn(prev, LOCAL_PROFILE_ID) : prev;
        return upsertProfileIn(base, profileId, patch, now);
      });
    },
    [profiles.set, userId, profileId],
  );

  const addMeasurement = useCallback(
    (m: MeasurementFields) => {
      const id = createId();
      const now = Date.now();
      measurements.set((prev) => upsertMeasurementIn(prev, id, m, now));
    },
    [measurements.set],
  );
  const updateMeasurement = useCallback(
    (id: string, patch: Partial<MeasurementFields>) => {
      const now = Date.now();
      measurements.set((prev) =>
        prev.some((m) => m.id === id) ? upsertMeasurementIn(prev, id, patch, now) : prev,
      );
    },
    [measurements.set],
  );
  const deleteMeasurement = useCallback(
    (id: string) => measurements.set((prev) => deleteByIdIn(prev, id)),
    [measurements.set],
  );

  const setWeight = useCallback(
    (date: string, weightKg: number) => {
      const now = Date.now();
      weights.set((prev) => setWeightIn(prev, date, weightKg, now));
    },
    [weights.set],
  );
  const clearWeight = useCallback(
    (date: string) => weights.set((prev) => clearWeightIn(prev, date)),
    [weights.set],
  );

  const setSleep = useCallback(
    (date: string, log: SleepFields) => {
      const now = Date.now();
      sleepLogs.set((prev) => setSleepIn(prev, date, log, now));
    },
    [sleepLogs.set],
  );
  const clearSleep = useCallback(
    (date: string) => sleepLogs.set((prev) => clearSleepIn(prev, date)),
    [sleepLogs.set],
  );

  const setWater = useCallback(
    (date: string, ml: number) => {
      const now = Date.now();
      waterLogs.set((prev) => setWaterIn(prev, date, ml, now));
    },
    [waterLogs.set],
  );
  const addWater = useCallback(
    (date: string, deltaMl: number) => {
      const now = Date.now();
      waterLogs.set((prev) => addWaterIn(prev, date, deltaMl, now));
    },
    [waterLogs.set],
  );

  const addWorkout = useCallback(
    (w: WorkoutDraft, weightKg: number) => {
      const id = createId();
      const now = Date.now();
      workouts.set((prev) => addWorkoutIn(prev, w, weightKg, id, now));
    },
    [workouts.set],
  );
  const deleteWorkout = useCallback(
    (id: string) => workouts.set((prev) => deleteByIdIn(prev, id)),
    [workouts.set],
  );

  const addMeal = useCallback(
    (m: MealFields): Meal => {
      const id = createId();
      const now = Date.now();
      meals.set((prev) => addMealIn(prev, m, id, now));
      return { ...m, id, createdAt: now, updatedAt: now };
    },
    [meals.set],
  );
  const updateMeal = useCallback(
    (id: string, patch: Partial<MealFields>) => meals.set((prev) => updateMealIn(prev, id, patch)),
    [meals.set],
  );
  const deleteMeal = useCallback(
    (id: string) => meals.set((prev) => deleteByIdIn(prev, id)),
    [meals.set],
  );

  const rememberPortion = useCallback(
    (foodKey: string, grams: number) => {
      const now = Date.now();
      portions.set((prev) => rememberPortionIn(prev, foodKey, grams, now));
    },
    [portions.set],
  );

  // ---- queries -----------------------------------------------------------

  const getMealsForDay = useCallback(
    (date: string) =>
      meals.items
        .filter((m) => m.date === date)
        .sort((a, b) => a.timeMinutes - b.timeMinutes || a.createdAt - b.createdAt),
    [meals.items],
  );
  const getWeightFor = useCallback(
    (date: string) => weights.items.find((w) => w.id === date) ?? null,
    [weights.items],
  );
  const getSleepFor = useCallback(
    (date: string) => sleepLogs.items.find((s) => s.id === date) ?? null,
    [sleepLogs.items],
  );
  const getWaterFor = useCallback(
    (date: string) => waterLogs.items.find((w) => w.id === date) ?? null,
    [waterLogs.items],
  );
  const getWorkoutsFor = useCallback(
    (date: string) => workouts.items.filter((w) => w.date === date),
    [workouts.items],
  );

  const latestMeasurement = useCallback(
    () => latestMeasurementOf(measurements.items),
    [measurements.items],
  );
  const currentWeightKg = useCallback(
    () => currentWeightOf(weights.items, measurements.items),
    [weights.items, measurements.items],
  );
  const trendPoints = useMemo(() => emaTrend(weights.items), [weights.items]);
  const trend = useCallback(() => trendPoints, [trendPoints]);
  const targetFor = useCallback(
    (date: string) =>
      computeTarget({
        profile,
        weights: weights.items,
        measurements: measurements.items,
        workouts: workouts.items,
        date,
      }),
    [profile, weights.items, measurements.items, workouts.items],
  );

  return {
    isLoading,
    profile,
    measurements: measurements.items,
    weights: weights.items,
    sleepLogs: sleepLogs.items,
    waterLogs: waterLogs.items,
    workouts: workouts.items,
    meals: meals.items,
    portions: portions.items,
    saveProfile,
    addMeasurement,
    updateMeasurement,
    deleteMeasurement,
    setWeight,
    clearWeight,
    setSleep,
    clearSleep,
    setWater,
    addWater,
    addWorkout,
    deleteWorkout,
    addMeal,
    updateMeal,
    deleteMeal,
    rememberPortion,
    getMealsForDay,
    getWeightFor,
    getSleepFor,
    getWaterFor,
    getWorkoutsFor,
    latestMeasurement,
    currentWeightKg,
    trend,
    targetFor,
    cloud,
  };
}
