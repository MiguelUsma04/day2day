import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local changes that still have to reach the server.
 *
 * Persisted so an edit made offline, or while signed out, is uploaded on the
 * next chance instead of being forgotten. Keyed by record id: only the latest
 * intent per record matters, so a delete after three edits is one delete.
 */

export type QueueOp = { op: 'upsert' } | { op: 'delete'; at: number };
export type Table = 'tasks' | 'todos' | 'day_modes';

type Stored = Record<Table, Record<string, QueueOp>>;

const KEY = 'day2day:syncQueue:v1';

const queue: Stored = { tasks: {}, todos: {}, day_modes: {} };
let loaded = false;

export async function loadQueue(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    for (const table of ['tasks', 'todos', 'day_modes'] as const) {
      const entries = parsed[table];
      if (entries && typeof entries === 'object') {
        // Anything already queued in this session wins over the stored copy.
        queue[table] = { ...entries, ...queue[table] };
      }
    }
  } catch {
    // A corrupt queue is not worth bricking sync over; start empty.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(KEY, JSON.stringify(queue)).catch(() => {});
  }, 200);
}

export function enqueue(table: Table, id: string, op: QueueOp) {
  queue[table][id] = op;
  persist();
}

export function dequeue(table: Table, id: string, expected: QueueOp) {
  // Only drop the entry if nothing newer replaced it while the upload ran.
  if (queue[table][id] === expected) {
    delete queue[table][id];
    persist();
  }
}

export function pending(table: Table, id: string): QueueOp | undefined {
  return queue[table][id];
}

export function snapshot(table: Table): Array<[string, QueueOp]> {
  return Object.entries(queue[table]);
}

export function pendingCount(): number {
  return (
    Object.keys(queue.tasks).length +
    Object.keys(queue.todos).length +
    Object.keys(queue.day_modes).length
  );
}
