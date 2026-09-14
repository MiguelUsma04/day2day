import AsyncStorage from '@react-native-async-storage/async-storage';

import { NO_REPEAT, type Task, type Todo } from '../types/task';

const TASKS_KEY = 'day2day:tasks:v1';
const TODOS_KEY = 'day2day:todos:v1';

/** Fills in fields added after a record was written, so older data still loads. */
function normalizeTask(raw: unknown): Task | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<Task>;
  if (typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.date !== 'string') {
    return null;
  }

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
    completedDays: Array.isArray(t.completedDays) ? t.completedDays : [],
    skippedDays: Array.isArray(t.skippedDays) ? t.skippedDays : [],
    overrides:
      typeof t.overrides === 'object' && t.overrides !== null && !Array.isArray(t.overrides)
        ? t.overrides
        : {},
    reminderMinutes: typeof t.reminderMinutes === 'number' ? t.reminderMinutes : null,
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
  };
}

function normalizeTodo(raw: unknown): Todo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<Todo>;
  if (typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.date !== 'string') {
    return null;
  }
  return {
    id: t.id,
    title: t.title,
    date: t.date,
    done: t.done === true,
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
  };
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
