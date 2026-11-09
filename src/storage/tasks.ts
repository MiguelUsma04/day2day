import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DAY_MODES,
  NO_REPEAT,
  TASK_CONTEXTS,
  type DayModeRecord,
  type Task,
  type Todo,
} from '../types/task';

export const TASKS_KEY = 'day2day:tasks:v1';
export const TODOS_KEY = 'day2day:todos:v1';
export const DAY_MODES_KEY = 'day2day:dayModes:v1';

/** Fills in fields added after a record was written, so older data still loads. */
export function normalizeTask(raw: unknown): Task | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<Task>;
  if (typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.date !== 'string') {
    return null;
  }

  const createdAt = typeof t.createdAt === 'number' ? t.createdAt : Date.now();
  return {
    id: t.id,
    title: t.title,
    notes: typeof t.notes === 'string' ? t.notes : undefined,
    date: t.date,
    startMinutes: typeof t.startMinutes === 'number' ? t.startMinutes : null,
    durationMinutes: typeof t.durationMinutes === 'number' ? t.durationMinutes : 30,
    category: t.category ?? 'other',
    icon: typeof t.icon === 'string' ? t.icon : undefined,
    repeat: t.repeat ?? NO_REPEAT,
    context: (TASK_CONTEXTS as readonly string[]).includes(t.context as string)
      ? (t.context as Task['context'])
      : 'any',
    completedDays: Array.isArray(t.completedDays) ? t.completedDays : [],
    skippedDays: Array.isArray(t.skippedDays) ? t.skippedDays : [],
    overrides:
      typeof t.overrides === 'object' && t.overrides !== null && !Array.isArray(t.overrides)
        ? t.overrides
        : {},
    reminderMinutes: typeof t.reminderMinutes === 'number' ? t.reminderMinutes : null,
    createdAt,
    // Records written before sync existed carry no updatedAt; their creation
    // time is the best guess and keeps them older than any real edit.
    updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : createdAt,
  };
}

export function normalizeTodo(raw: unknown): Todo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<Todo>;
  if (typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.date !== 'string') {
    return null;
  }
  const createdAt = typeof t.createdAt === 'number' ? t.createdAt : Date.now();
  return {
    id: t.id,
    title: t.title,
    date: t.date,
    done: t.done === true,
    order: typeof t.order === 'number' && Number.isFinite(t.order) ? t.order : createdAt,
    createdAt,
    updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : createdAt,
  };
}

export function normalizeDayMode(raw: unknown): DayModeRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<DayModeRecord>;
  const id = typeof r.id === 'string' ? r.id : typeof r.date === 'string' ? r.date : null;
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(id)) return null;
  if (!(DAY_MODES as readonly string[]).includes(r.mode as string)) return null;
  const createdAt = typeof r.createdAt === 'number' ? r.createdAt : Date.now();
  return {
    id,
    date: id,
    mode: r.mode as DayModeRecord['mode'],
    createdAt,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : createdAt,
  };
}

async function loadList<T>(key: string, normalize: (raw: unknown) => T | null): Promise<T[]> {
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

export function loadDayModes(): Promise<DayModeRecord[]> {
  return loadList(DAY_MODES_KEY, normalizeDayMode);
}

export async function saveDayModes(records: DayModeRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DAY_MODES_KEY, JSON.stringify(records));
  } catch {
    // Best-effort, as below.
  }
}

export async function loadTasks(): Promise<Task[]> {
  try {
    const raw = await AsyncStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTask).filter((t): t is Task => t !== null);
  } catch {
    // A corrupt payload should not brick the app; start clean instead.
    return [];
  }
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch {
    // Storage is best-effort; in-memory state stays authoritative for the session.
  }
}

export async function loadTodos(): Promise<Todo[]> {
  try {
    const raw = await AsyncStorage.getItem(TODOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTodo).filter((t): t is Todo => t !== null);
  } catch {
    return [];
  }
}

export async function saveTodos(todos: Todo[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TODOS_KEY, JSON.stringify(todos));
  } catch {
    // Best-effort, as above.
  }
}
