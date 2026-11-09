import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import {
  NO_REPEAT,
  type DayModeRecord,
  type Repeat,
  type Task,
  type Todo,
  type Weekday,
} from '../types/task';
import { normalizeDayMode, normalizeTask, normalizeTodo } from './tasks';
import type { Row, Table } from './tables';

/**
 * Talks to the per-user tables in Supabase.
 *
 * Rows mirror the local types with snake_case names. Deletion is soft
 * (`deleted_at`), so another device learns about it on its next pull instead of
 * silently keeping a ghost. `synced_at` is the server clock and only serves as
 * the pull cursor; who wins a conflict is decided by the client-side
 * `updated_at`, which is what the user actually experienced as "later".
 *
 * Every read and soft delete is scoped to the signed-in user explicitly rather
 * than leaning on RLS alone: RLS also lets each account read its partner's
 * rows, which must never be pulled into this device's own store.
 */

let clientOverride: SupabaseClient | null = null;

/** Test hook: route every call through `client` instead of the real one; `null` restores it. */
export function __setClientForTests(client: SupabaseClient | null): void {
  clientOverride = client;
}

function db(): SupabaseClient | null {
  return clientOverride ?? supabase;
}

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  date: string;
  start_minutes: number | null;
  duration_minutes: number;
  category: string;
  icon: string | null;
  repeat_kind: string;
  repeat_days: number[];
  context: string;
  completed_days: string[];
  skipped_days: string[];
  overrides: Task['overrides'];
  reminder_minutes: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  synced_at?: string;
};

export type TodoRow = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  done: boolean;
  /** Null on rows written before ordering existed; falls back to created_at. */
  sort_order: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  synced_at?: string;
};

export function toTaskRow(task: Task, userId: string): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    notes: task.notes ?? null,
    date: task.date,
    start_minutes: task.startMinutes,
    duration_minutes: task.durationMinutes,
    category: task.category,
    icon: task.icon ?? null,
    repeat_kind: task.repeat.kind,
    repeat_days: task.repeat.days,
    context: task.context,
    completed_days: task.completedDays,
    skipped_days: task.skippedDays,
    overrides: task.overrides,
    reminder_minutes: task.reminderMinutes,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    deleted_at: null,
  };
}

export function fromTaskRow(row: TaskRow): Task | null {
  const repeat: Repeat =
    row.repeat_kind === 'none'
      ? NO_REPEAT
      : {
          kind: row.repeat_kind as Repeat['kind'],
          days: (row.repeat_days ?? []).filter(
            (d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6,
          ),
        };
  // Run through the same normaliser as local storage so a row written by an
  // older or newer build still yields a well-formed task.
  return normalizeTask({
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    date: row.date,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
    category: row.category,
    icon: row.icon ?? undefined,
    repeat,
    context: row.context,
    completedDays: row.completed_days ?? [],
    skippedDays: row.skipped_days ?? [],
    overrides: row.overrides ?? {},
    reminderMinutes: row.reminder_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function toTodoRow(todo: Todo, userId: string): TodoRow {
  return {
    id: todo.id,
    user_id: userId,
    title: todo.title,
    date: todo.date,
    done: todo.done,
    sort_order: todo.order,
    created_at: todo.createdAt,
    updated_at: todo.updatedAt,
    deleted_at: null,
  };
}

export function fromTodoRow(row: TodoRow): Todo | null {
  return normalizeTodo({
    id: row.id,
    title: row.title,
    date: row.date,
    done: row.done,
    order: row.sort_order ?? row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type DayModeRow = {
  id: string;
  user_id: string;
  date: string;
  mode: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  synced_at?: string;
};

export function toDayModeRow(record: DayModeRecord, userId: string): DayModeRow {
  return {
    id: record.id,
    user_id: userId,
    date: record.date,
    mode: record.mode,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: null,
  };
}

export function fromDayModeRow(row: DayModeRow): DayModeRecord | null {
  return normalizeDayMode({
    id: row.id,
    date: row.date,
    mode: row.mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type Changes = {
  /** Rows per table; only the tables asked for are filled. */
  rows: Record<Table, Row[]>;
  cursor: string | null;
};

/**
 * Everything of `uid`'s that changed on the server after `since` (an ISO
 * timestamp from a previous pull) in the given tables, deleted rows included.
 * `null` means "everything".
 */
export async function fetchChanges(
  since: string | null,
  uid: string,
  tables: readonly Table[],
): Promise<Changes> {
  const client = db();
  if (!client) throw new Error('Supabase no configurado');

  const query = (table: Table) => {
    let q = client
      .from(table)
      .select('*')
      .order('synced_at', { ascending: true })
      .eq('user_id', uid);
    if (since) q = q.gt('synced_at', since);
    return q;
  };

  const results = await Promise.all(tables.map((table) => query(table)));
  const rows = {} as Record<Table, Row[]>;
  // The newest server timestamp seen becomes the next cursor. Rows are ordered
  // ascending, so it is simply the last one of each list.
  const candidates: string[] = [];
  tables.forEach((table, i) => {
    const res = results[i];
    if (res.error) throw res.error;
    const list = (res.data ?? []) as Row[];
    rows[table] = list;
    const last = list.at(-1)?.synced_at;
    if (typeof last === 'string') candidates.push(last);
  });
  const cursor = candidates.length ? candidates.sort().at(-1)! : since;

  return { rows, cursor };
}

/** Upserts rows into `table`, resolving conflicts on `onConflict`. */
export async function upsertRows(table: Table, rows: Row[], onConflict: string): Promise<void> {
  const client = db();
  if (!client || rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict });
  if (!error) return;
  // A server that predates `todos.sort_order` (migration 20261104 not applied
  // yet) rejects the whole batch over that one column. Keep everything else in
  // sync and let the order stay per device until the column lands.
  if (table === 'todos' && (error.code === 'PGRST204' || error.code === '42703')) {
    const legacy = (rows as TodoRow[]).map(({ sort_order: _dropped, ...rest }) => rest);
    const retry = await client.from(table).upsert(legacy, { onConflict });
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
}

/** Marks `uid`'s rows deleted. A row that never reached the server is simply absent, which is fine. */
export async function softDeleteRows(
  table: Table,
  ids: string[],
  at: number,
  uid: string,
): Promise<void> {
  const client = db();
  if (!client || ids.length === 0) return;
  const { error } = await client
    .from(table)
    .update({ deleted_at: at, updated_at: at })
    .in('id', ids)
    .eq('user_id', uid);
  if (error) throw error;
}
