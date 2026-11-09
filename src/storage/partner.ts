import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { emaTrend } from '../lib/nutrition/trend';
import type { DayModeRecord, Task, Todo } from '../types/task';
import type {
  BodyMeasurement,
  Meal,
  Profile,
  SleepLog,
  WeightEntry,
  Workout,
} from '../types/nutrition';
import { toTodoRow } from './cloud';
import { COLLECTIONS, type CollectionDef } from './collections';
import { computeTarget, currentWeightOf, latestMeasurementOf } from './nutritionReducers';
import type { Rec, Row } from './tables';
import type { NutritionStore } from './useNutrition';

/**
 * Read-only access to the partner's data.
 *
 * RLS lets each account read (and insert todos for) its partner. None of this
 * ever touches AsyncStorage or the sync queue: the snapshot lives in memory
 * only, so switching back to "me" leaves the local store exactly as it was.
 */

export type PartnerSnapshot = {
  tasks: Task[];
  todos: Todo[];
  dayModes: DayModeRecord[];
  meals: Meal[];
  weights: WeightEntry[];
  sleepLogs: SleepLog[];
  workouts: Workout[];
  profile: Profile | null;
  measurements: BodyMeasurement[];
};

const OFFLINE_TODO = 'Sin conexión: el pendiente no se creó';
const TODO_FAILED = 'No se pudo crear el pendiente';

function looksOffline(message: string | undefined): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /fetch|network|offline/i.test(message ?? '');
}

/** Live (not soft-deleted) rows of one table owned by `partnerId`, converted to records. */
async function fetchLive<T extends Rec, R extends Row>(
  client: SupabaseClient,
  def: CollectionDef<T, R>,
  partnerId: string,
): Promise<T[]> {
  const { data, error } = await client
    .from(def.table)
    .select('*')
    .eq('user_id', partnerId)
    .is('deleted_at', null);
  if (error) throw new Error((error as { message?: string }).message ?? 'No se pudo leer');
  return ((data ?? []) as R[]).map(def.fromRow).filter((x): x is T => x !== null);
}

export async function fetchPartnerSnapshot(
  partnerId: string,
  client: SupabaseClient | null = supabase,
): Promise<PartnerSnapshot> {
  if (!client) throw new Error('Sin conexión con el servidor');
  const c = COLLECTIONS;
  const [tasks, todos, dayModes, meals, weights, sleepLogs, workouts, profiles, measurements] =
    await Promise.all([
      fetchLive(client, c.tasks, partnerId),
      fetchLive(client, c.todos, partnerId),
      fetchLive(client, c.day_modes, partnerId),
      fetchLive(client, c.meals, partnerId),
      fetchLive(client, c.weights, partnerId),
      fetchLive(client, c.sleep_logs, partnerId),
      fetchLive(client, c.workouts, partnerId),
      fetchLive(client, c.profiles, partnerId),
      fetchLive(client, c.body_measurements, partnerId),
    ]);
  // The partner's own profile carries their user id; a leftover local one is a fallback.
  const profile = profiles.find((p) => p.id === partnerId) ?? profiles[0] ?? null;
  return { tasks, todos, dayModes, meals, weights, sleepLogs, workouts, profile, measurements };
}

/** Creates a todo straight in the partner's list; it reaches them on their next sync. */
export async function insertTodoFor(
  partnerId: string,
  todo: Todo,
  client: SupabaseClient | null = supabase,
): Promise<void> {
  if (!client) throw new Error(OFFLINE_TODO);
  let result: { error: { message?: string } | null };
  try {
    result = await client.from('todos').insert(toTodoRow(todo, partnerId));
  } catch {
    throw new Error(OFFLINE_TODO);
  }
  if (result.error) {
    if (looksOffline(result.error.message)) throw new Error(OFFLINE_TODO);
    // E.g. an RLS rejection: the detail is for debugging, not for the banner.
    console.warn('insertTodoFor failed', result.error);
    throw new Error(TODO_FAILED);
  }
}

/** The partner linked to `userId` in the `partners` table, or null. */
export async function fetchPartnerId(
  userId: string,
  client: SupabaseClient | null = supabase,
): Promise<string | null> {
  if (!client) return null;
  const { data, error } = await client
    .from('partners')
    .select('partner_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const id = (data as { partner_id?: unknown }).partner_id;
  return typeof id === 'string' && id ? id : null;
}

const noop = () => {};

/**
 * A `NutritionStore` over a snapshot: queries answer from the snapshot with the
 * same helpers `useNutrition` uses, every mutator does nothing.
 */
export function readOnlyNutritionStore(snapshot: PartnerSnapshot): NutritionStore {
  const { profile, measurements, weights, sleepLogs, workouts, meals } = snapshot;
  const trendPoints = emaTrend(weights);
  return {
    isLoading: false,
    profile,
    measurements,
    weights,
    sleepLogs,
    workouts,
    meals,
    portions: [],
    saveProfile: noop,
    addMeasurement: noop,
    updateMeasurement: noop,
    deleteMeasurement: noop,
    setWeight: noop,
    clearWeight: noop,
    setSleep: noop,
    clearSleep: noop,
    addWorkout: noop,
    deleteWorkout: noop,
    addMeal: (m) => ({ ...m, id: '', createdAt: 0, updatedAt: 0 }),
    updateMeal: noop,
    deleteMeal: noop,
    rememberPortion: noop,
    getMealsForDay: (date) =>
      meals
        .filter((m) => m.date === date)
        .sort((a, b) => a.timeMinutes - b.timeMinutes || a.createdAt - b.createdAt),
    getWeightFor: (date) => weights.find((w) => w.id === date) ?? null,
    getSleepFor: (date) => sleepLogs.find((s) => s.id === date) ?? null,
    getWorkoutsFor: (date) => workouts.filter((w) => w.date === date),
    latestMeasurement: () => latestMeasurementOf(measurements),
    currentWeightKg: () => currentWeightOf(weights, measurements),
    trend: () => trendPoints,
    targetFor: (date) => computeTarget({ profile, weights, measurements, workouts, date }),
    cloud: {
      available: false,
      active: false,
      syncing: false,
      lastSyncAt: null,
      error: null,
      pending: 0,
      syncNow: async () => {},
    },
  };
}
