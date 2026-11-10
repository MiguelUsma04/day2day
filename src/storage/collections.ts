import type { DayModeRecord, Task, Todo } from '../types/task';
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
import {
  fromDayModeRow,
  fromTaskRow,
  fromTodoRow,
  toDayModeRow,
  toTaskRow,
  toTodoRow,
  type DayModeRow,
  type TaskRow,
  type TodoRow,
} from './cloud';
import {
  NUTRITION_KEYS,
  fromBodyMeasurementRow,
  fromMealRow,
  fromProfileRow,
  fromSleepLogRow,
  fromUserPortionRow,
  fromWaterLogRow,
  fromWeightRow,
  fromWorkoutRow,
  normalizeBodyMeasurement,
  normalizeMeal,
  normalizeProfile,
  normalizeSleepLog,
  normalizeUserPortion,
  normalizeWaterLog,
  normalizeWeight,
  normalizeWorkout,
  toBodyMeasurementRow,
  toMealRow,
  toProfileRow,
  toSleepLogRow,
  toUserPortionRow,
  toWaterLogRow,
  toWeightRow,
  toWorkoutRow,
  type BodyMeasurementRow,
  type MealRow,
  type ProfileRow,
  type SleepLogRow,
  type UserPortionRow,
  type WaterLogRow,
  type WeightRow,
  type WorkoutRow,
} from './nutritionStore';
import { DAY_MODES_KEY, TASKS_KEY, TODOS_KEY, normalizeDayMode, normalizeTask, normalizeTodo } from './tasks';
import type { Rec, Row, Table } from './tables';

/**
 * Everything the sync machinery needs to know about one collection: where it
 * lives locally, which table mirrors it, and how to convert between the two.
 *
 * `onConflict` is the upsert target. Tables whose primary key is
 * `(user_id, id)` must name both columns or the upsert is rejected.
 */
export type CollectionDef<T extends Rec, R extends Row> = {
  table: Table;
  storageKey: string;
  normalize: (raw: unknown) => T | null;
  toRow: (item: T, uid: string) => R;
  fromRow: (row: R) => T | null;
  onConflict: string;
};

export const COLLECTIONS: {
  tasks: CollectionDef<Task, TaskRow>;
  todos: CollectionDef<Todo, TodoRow>;
  day_modes: CollectionDef<DayModeRecord, DayModeRow>;
  profiles: CollectionDef<Profile, ProfileRow>;
  body_measurements: CollectionDef<BodyMeasurement, BodyMeasurementRow>;
  weights: CollectionDef<WeightEntry, WeightRow>;
  sleep_logs: CollectionDef<SleepLog, SleepLogRow>;
  water_logs: CollectionDef<WaterLog, WaterLogRow>;
  workouts: CollectionDef<Workout, WorkoutRow>;
  meals: CollectionDef<Meal, MealRow>;
  user_portions: CollectionDef<UserPortion, UserPortionRow>;
} = {
  tasks: {
    table: 'tasks',
    storageKey: TASKS_KEY,
    normalize: normalizeTask,
    toRow: toTaskRow,
    fromRow: fromTaskRow,
    onConflict: 'id',
  },
  todos: {
    table: 'todos',
    storageKey: TODOS_KEY,
    normalize: normalizeTodo,
    toRow: toTodoRow,
    fromRow: fromTodoRow,
    onConflict: 'id',
  },
  day_modes: {
    table: 'day_modes',
    storageKey: DAY_MODES_KEY,
    normalize: normalizeDayMode,
    toRow: toDayModeRow,
    fromRow: fromDayModeRow,
    onConflict: 'user_id,id',
  },
  profiles: {
    table: 'profiles',
    storageKey: NUTRITION_KEYS.profiles,
    normalize: normalizeProfile,
    toRow: toProfileRow,
    fromRow: fromProfileRow,
    onConflict: 'user_id,id',
  },
  body_measurements: {
    table: 'body_measurements',
    storageKey: NUTRITION_KEYS.body_measurements,
    normalize: normalizeBodyMeasurement,
    toRow: toBodyMeasurementRow,
    fromRow: fromBodyMeasurementRow,
    onConflict: 'id',
  },
  weights: {
    table: 'weights',
    storageKey: NUTRITION_KEYS.weights,
    normalize: normalizeWeight,
    toRow: toWeightRow,
    fromRow: fromWeightRow,
    onConflict: 'user_id,id',
  },
  sleep_logs: {
    table: 'sleep_logs',
    storageKey: NUTRITION_KEYS.sleep_logs,
    normalize: normalizeSleepLog,
    toRow: toSleepLogRow,
    fromRow: fromSleepLogRow,
    onConflict: 'user_id,id',
  },
  water_logs: {
    table: 'water_logs',
    storageKey: NUTRITION_KEYS.water_logs,
    normalize: normalizeWaterLog,
    toRow: toWaterLogRow,
    fromRow: fromWaterLogRow,
    onConflict: 'user_id,id',
  },
  workouts: {
    table: 'workouts',
    storageKey: NUTRITION_KEYS.workouts,
    normalize: normalizeWorkout,
    toRow: toWorkoutRow,
    fromRow: fromWorkoutRow,
    onConflict: 'id',
  },
  meals: {
    table: 'meals',
    storageKey: NUTRITION_KEYS.meals,
    normalize: normalizeMeal,
    toRow: toMealRow,
    fromRow: fromMealRow,
    onConflict: 'id',
  },
  user_portions: {
    table: 'user_portions',
    storageKey: NUTRITION_KEYS.user_portions,
    normalize: normalizeUserPortion,
    toRow: toUserPortionRow,
    fromRow: fromUserPortionRow,
    onConflict: 'user_id,id',
  },
};
