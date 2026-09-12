import AsyncStorage from '@react-native-async-storage/async-storage';

import { NO_REPEAT, type Task } from '../types/task';

const STORAGE_KEY = 'day2day:tasks:v1';

/** Fills in fields added after a record was written, so older data still loads. */
function normalize(raw: unknown): Task | null {
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
    repeat: t.repeat ?? NO_REPEAT,
    completedDays: Array.isArray(t.completedDays) ? t.completedDays : [],
    skippedDays: Array.isArray(t.skippedDays) ? t.skippedDays : [],
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
  };
}

export async function loadTasks(): Promise<Task[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((t): t is Task => t !== null);
  } catch {
    // A corrupt payload should not brick the app; start clean instead.
    return [];
  }
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Storage is best-effort; in-memory state stays authoritative for the session.
  }
}
