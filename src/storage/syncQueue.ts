import AsyncStorage from '@react-native-async-storage/async-storage';

import { TABLES, type Table } from './tables';

/**
 * Local changes that still have to reach the server.
 *
 * Persisted so an edit made offline, or while signed out, is uploaded on the
 * next chance instead of being forgotten. Keyed by record id: only the latest
 * intent per record matters, so a delete after three edits is one delete.
 */

export type QueueOp = { op: 'upsert' } | { op: 'delete'; at: number };

type Stored = Record<Table, Record<string, QueueOp>>;

const KEY = 'day2day:syncQueue:v1';

const queue = Object.fromEntries(TABLES.map((t) => [t, {}])) as Stored;
/**
 * The one load, shared: every caller awaits the same promise, so none resumes
 * before the stored entries are merged (a plain `loaded` flag set before the
 * await let a second caller return early with an empty queue).
 */
let loading: Promise<void> | null = null;

export function loadQueue(): Promise<void> {
  loading ??= readStored();
  return loading;
}

async function readStored(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    // Payloads written before a table existed simply lack its key: it stays empty.
    for (const table of TABLES) {
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
  return TABLES.reduce((n, table) => n + Object.keys(queue[table]).length, 0);
}
