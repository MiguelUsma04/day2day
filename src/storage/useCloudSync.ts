import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSupabaseConfigured } from '../lib/supabase';
import type { DayModeRecord, Task, Todo } from '../types/task';
import {
  fetchChanges,
  fromDayModeRow,
  fromTaskRow,
  fromTodoRow,
  softDeleteRows,
  toDayModeRow,
  toTaskRow,
  toTodoRow,
  upsertDayModeRows,
  upsertTaskRows,
  upsertTodoRows,
} from './cloud';
import {
  dequeue,
  enqueue,
  loadQueue,
  pending,
  pendingCount,
  snapshot,
  type QueueOp,
  type Table,
} from './syncQueue';

/**
 * Two-way sync between the in-memory store and Supabase.
 *
 * Local is the source of truth for the session; the database is the shared
 * copy. The loop is:
 *
 *   1. Every state change is diffed against the last seen state. Changed
 *      records are queued as upserts, missing ones as deletes. The queue is
 *      persisted, so nothing is lost offline.
 *   2. A debounced flush uploads the queue when signed in.
 *   3. A pull (on sign-in, on foreground, on demand) fetches rows changed on
 *      the server since the last cursor and merges them: the newer
 *      `updatedAt` wins; a deletion wins over an older edit.
 *
 * Records applied from the server are remembered so step 1 does not mistake
 * them for local edits and echo them straight back.
 *
 * Three collections go through the same machinery: tasks, todos and day
 * modes. Each is described once in `COLLECTIONS` below.
 */

export type CloudSync = {
  /** Sign-in possible at all (env vars present). */
  available: boolean;
  /** Signed in and syncing. */
  active: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string | null;
  pending: number;
  syncNow: () => Promise<void>;
};

type Setter<T> = React.Dispatch<React.SetStateAction<T[]>>;

type Args = {
  userId: string | null;
  ready: boolean;
  tasks: Task[];
  todos: Todo[];
  dayModes: DayModeRecord[];
  setTasks: Setter<Task>;
  setTodos: Setter<Todo>;
  setDayModes: Setter<DayModeRecord>;
};

const CURSOR_KEY = 'day2day:syncCursor:v1';
const FLUSH_DELAY_MS = 800;

type Rec = { id: string; updatedAt: number };
type Row = { id: string; updated_at: number; deleted_at: number | null };

/** Per-collection bookkeeping: last seen state, and what came from the server. */
type Tracker<T extends Rec> = {
  last: Map<string, T> | null;
  applied: Map<string, T>;
  removed: Set<string>;
};

function tracker<T extends Rec>(): Tracker<T> {
  return { last: null, applied: new Map(), removed: new Set() };
}

/**
 * Compares the new state with the last seen one and queues what changed.
 * Records handed over by `applied`/`removed` came from the server and are
 * skipped, consuming their marker on the way.
 */
function diffAndQueue<T extends Rec>(table: Table, t: Tracker<T>, next: T[]): void {
  if (t.last === null) {
    // First render after hydration is the baseline, not a change.
    t.last = new Map(next.map((item) => [item.id, item]));
    return;
  }
  const seen = new Map<string, T>();
  for (const item of next) {
    seen.set(item.id, item);
    if (t.last.get(item.id) === item) continue;
    if (t.applied.get(item.id) === item) {
      t.applied.delete(item.id);
      continue;
    }
    enqueue(table, item.id, { op: 'upsert' });
  }
  for (const id of t.last.keys()) {
    if (seen.has(id)) continue;
    if (t.removed.has(id)) {
      t.removed.delete(id);
      continue;
    }
    enqueue(table, id, { op: 'delete', at: Date.now() });
  }
  t.last = seen;
}

type Merged<T> = { next: T[]; changed: boolean; upload: string[] };

/**
 * Folds server rows into local state. Pure apart from recording which records
 * it applied, which the diff step needs to know.
 */
function merge<T extends Rec, R extends Row>(
  table: Table,
  t: Tracker<T>,
  local: T[],
  rows: R[],
  convert: (row: R) => T | null,
  firstPull: boolean,
): Merged<T> {
  const byId = new Map(local.map((item) => [item.id, item]));
  const remoteIds = new Set<string>();
  const upload: string[] = [];
  let changed = false;

  for (const row of rows) {
    remoteIds.add(row.id);
    const mine = byId.get(row.id);
    const queued = pending(table, row.id);

    if (row.deleted_at !== null) {
      // Deleted elsewhere. Keep ours only if we edited it *after* that deletion
      // and have not yet uploaded the edit — then our edit will resurrect it.
      if (mine && !(queued?.op === 'upsert' && mine.updatedAt > row.deleted_at)) {
        byId.delete(row.id);
        t.removed.add(row.id);
        changed = true;
      }
      continue;
    }

    const theirs = convert(row);
    if (!theirs) continue;

    if (!mine) {
      // We deleted it locally and the delete is still in flight: ours wins.
      if (queued?.op === 'delete') continue;
      byId.set(row.id, theirs);
      t.applied.set(row.id, theirs);
      changed = true;
    } else if (theirs.updatedAt > mine.updatedAt) {
      byId.set(row.id, theirs);
      t.applied.set(row.id, theirs);
      changed = true;
    } else if (theirs.updatedAt < mine.updatedAt && !queued) {
      // Ours is newer but was never uploaded (e.g. the queue was lost).
      upload.push(row.id);
    }
  }

  if (firstPull) {
    // First time this account sees this device: whatever exists only here
    // (data from before sign-in) goes up.
    for (const item of local) {
      if (!remoteIds.has(item.id) && !pending(table, item.id)) upload.push(item.id);
    }
  }

  // Preserve the original order for untouched items; new ones go at the end.
  const next: T[] = [];
  const placed = new Set<string>();
  for (const item of local) {
    const current = byId.get(item.id);
    if (current) {
      next.push(current);
      placed.add(item.id);
    }
  }
  for (const [id, item] of byId) {
    if (!placed.has(id)) next.push(item);
  }

  return { next: changed ? next : local, changed, upload };
}

/** Groups queued deletes by timestamp so one request covers each batch. */
function groupDeletes(list: Array<[string, QueueOp]>): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const [id, op] of list) {
    if (op.op !== 'delete') continue;
    const ids = groups.get(op.at) ?? [];
    ids.push(id);
    groups.set(op.at, ids);
  }
  return groups;
}

/** Uploads one collection's queue: upserts, then deletes; returns what to dequeue. */
async function flushTable<T extends Rec, R>(
  table: Table,
  uid: string,
  current: Map<string, T>,
  toRow: (item: T, uid: string) => R,
  upsert: (rows: R[]) => Promise<void>,
): Promise<Array<[Table, string, QueueOp]>> {
  const ops = snapshot(table);
  if (ops.length === 0) return [];
  const rows: R[] = [];
  const deletes: Array<[string, QueueOp]> = [];
  const done: Array<[Table, string, QueueOp]> = [];

  for (const [id, op] of ops) {
    if (op.op === 'upsert') {
      const item = current.get(id);
      // Queued but gone from state: a delete will follow or already did.
      if (item) rows.push(toRow(item, uid));
    } else deletes.push([id, op]);
    done.push([table, id, op]);
  }

  await upsert(rows);
  for (const [at, ids] of groupDeletes(deletes)) await softDeleteRows(table, ids, at);
  return done;
}

export function useCloudSync({
  userId,
  ready,
  tasks,
  todos,
  dayModes,
  setTasks,
  setTodos,
  setDayModes,
}: Args): CloudSync {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingN, setPendingN] = useState(0);

  const taskT = useRef(tracker<Task>());
  const todoT = useRef(tracker<Todo>());
  const modeT = useRef(tracker<DayModeRecord>());

  // Latest state, for the flush to read without being re-created on every change.
  const tasksRef = useRef(tasks);
  const todosRef = useRef(todos);
  const modesRef = useRef(dayModes);
  tasksRef.current = tasks;
  todosRef.current = todos;
  modesRef.current = dayModes;

  const userRef = useRef(userId);
  userRef.current = userId;

  const inFlight = useRef<Promise<void> | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 1. diff local changes into the queue --------------------------------
  useEffect(() => {
    if (!ready) return;
    diffAndQueue('tasks', taskT.current, tasks);
    setPendingN(pendingCount());
    scheduleFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, ready]);

  useEffect(() => {
    if (!ready) return;
    diffAndQueue('todos', todoT.current, todos);
    setPendingN(pendingCount());
    scheduleFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, ready]);

  useEffect(() => {
    if (!ready) return;
    diffAndQueue('day_modes', modeT.current, dayModes);
    setPendingN(pendingCount());
    scheduleFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayModes, ready]);

  // ---- 2. flush the queue --------------------------------------------------
  const flush = useCallback(async () => {
    const uid = userRef.current;
    if (!uid || !isSupabaseConfigured) return;
    await loadQueue();

    const byId = <T extends Rec>(list: T[]) => new Map(list.map((t) => [t.id, t]));
    const done = [
      ...(await flushTable('tasks', uid, byId(tasksRef.current), toTaskRow, upsertTaskRows)),
      ...(await flushTable('todos', uid, byId(todosRef.current), toTodoRow, upsertTodoRows)),
      ...(await flushTable(
        'day_modes',
        uid,
        byId(modesRef.current),
        toDayModeRow,
        upsertDayModeRows,
      )),
    ];
    for (const [table, id, op] of done) dequeue(table, id, op);
  }, []);

  // ---- 3. pull and merge ---------------------------------------------------
  const pull = useCallback(async () => {
    const uid = userRef.current;
    if (!uid || !isSupabaseConfigured) return;

    const cursorKey = `${CURSOR_KEY}:${uid}`;
    const since = await AsyncStorage.getItem(cursorKey).catch(() => null);
    const firstPull = since === null;

    const changes = await fetchChanges(since);

    // Functional updates, so an edit that landed while the fetch was in flight
    // is merged against, not overwritten. The bookkeeping side effects are
    // idempotent, which keeps a double-invoked updater (StrictMode) harmless.
    setTasks((prev) => {
      const r = merge('tasks', taskT.current, prev, changes.tasks, fromTaskRow, firstPull);
      for (const id of r.upload) enqueue('tasks', id, { op: 'upsert' });
      return r.next;
    });
    setTodos((prev) => {
      const r = merge('todos', todoT.current, prev, changes.todos, fromTodoRow, firstPull);
      for (const id of r.upload) enqueue('todos', id, { op: 'upsert' });
      return r.next;
    });
    setDayModes((prev) => {
      const r = merge(
        'day_modes',
        modeT.current,
        prev,
        changes.dayModes,
        fromDayModeRow,
        firstPull,
      );
      for (const id of r.upload) enqueue('day_modes', id, { op: 'upsert' });
      return r.next;
    });

    if (changes.cursor) await AsyncStorage.setItem(cursorKey, changes.cursor).catch(() => {});
    else if (firstPull) {
      // Empty account: still record that the first pull happened, with the
      // oldest possible cursor, so the next pull is incremental.
      await AsyncStorage.setItem(cursorKey, new Date(0).toISOString()).catch(() => {});
    }
  }, [setTasks, setTodos, setDayModes]);

  /** Full cycle, serialised: a second call while one runs waits for it. */
  const syncNow = useCallback(async () => {
    if (!userRef.current || !isSupabaseConfigured) return;
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      setSyncing(true);
      setError(null);
      try {
        await flush();
        await pull();
        // Anything the pull asked to upload goes out right away.
        await flush();
        setLastSyncAt(Date.now());
      } catch (e) {
        setError(describe(e));
      } finally {
        setPendingN(pendingCount());
        setSyncing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [flush, pull]);

  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;

  function scheduleFlush() {
    if (!userRef.current) return;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      void (async () => {
        setSyncing(true);
        try {
          await flush();
          setError(null);
          setLastSyncAt(Date.now());
        } catch (e) {
          setError(describe(e));
        } finally {
          setPendingN(pendingCount());
          setSyncing(false);
        }
      })();
    }, FLUSH_DELAY_MS);
  }

  // Sign-in (or app start while signed in): load the queue, then full sync.
  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    void loadQueue().then(() => {
      if (!cancelled) void syncRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userId]);

  return {
    available: isSupabaseConfigured,
    active: Boolean(userId) && isSupabaseConfigured,
    syncing,
    lastSyncAt,
    error,
    pending: pendingN,
    syncNow,
  };
}

function describe(e: unknown): string {
  const m = (e as { message?: string })?.message ?? '';
  if (/fetch|network/i.test(m)) return 'Sin conexión. Se sincroniza al volver la red.';
  if (/JWT|expired|401/i.test(m)) return 'La sesión venció. Vuelve a iniciar sesión.';
  if (/relation .* does not exist/i.test(m)) return 'Faltan las tablas: ejecuta la migración SQL en Supabase.';
  return m || 'No se pudo sincronizar.';
}
