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

/**
 * Talks to the two user tables in Supabase.
 *
 * Rows mirror the local types with snake_case names. Deletion is soft
 * (`deleted_at`), so another device learns about it on its next pull instead of
 * silently keeping a ghost. `synced_at` is the server clock and only serves as
 * the pull cursor; who wins a conflict is decided by the client-side
 * `updated_at`, which is what the user actually experienced as "later".
 */

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
  tasks: TaskRow[];
  todos: TodoRow[];
  dayModes: DayModeRow[];
  cursor: string | null;
};

/**
 * Everything that changed on the server after `since` (an ISO timestamp from a
 * previous pull), deleted rows included. `null` means "everything".
 */
export async function fetchChanges(since: string | null): Promise<Changes> {
  if (!supabase) throw new Error('Supabase no configurado');

  const query = (table: 'tasks' | 'todos' | 'day_modes') => {
    let q = supabase!.from(table).select('*').order('synced_at', { ascending: true });
    if (since) q = q.gt('synced_at', since);
    return q;
  };

  const [tasksRes, todosRes, modesRes] = await Promise.all([
    query('tasks'),
    query('todos'),
    query('day_modes'),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (todosRes.error) throw todosRes.error;
  if (modesRes.error) throw modesRes.error;

  const tasks = (tasksRes.data ?? []) as TaskRow[];
  const todos = (todosRes.data ?? []) as TodoRow[];
  const dayModes = (modesRes.data ?? []) as DayModeRow[];

  // The newest server timestamp seen becomes the next cursor. Rows are ordered
  // ascending, so it is simply the last one of each list.
  const candidates = [
    tasks.at(-1)?.synced_at,
    todos.at(-1)?.synced_at,
    dayModes.at(-1)?.synced_at,
  ].filter((v): v is string => typeof v === 'string');
  const cursor = candidates.length ? candidates.sort().at(-1)! : since;

  return { tasks, todos, dayModes, cursor };
}

export async function upsertTaskRows(rows: TaskRow[]): Promise<void> {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function upsertTodoRows(rows: TodoRow[]): Promise<void> {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from('todos').upsert(rows, { onConflict: 'id' });
  if (!error) return;
  // A server that predates `sort_order` (migration 20261104 not applied yet)
  // rejects the whole batch over that one column. Keep everything else in
  // sync and let the order stay per device until the column lands.
  if (error.code === 'PGRST204' || error.code === '42703') {
    const legacy = rows.map(({ sort_order: _dropped, ...rest }) => rest);
    const retry = await supabase.from('todos').upsert(legacy, { onConflict: 'id' });
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
}

export async function upsertDayModeRows(rows: DayModeRow[]): Promise<void> {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from('day_modes').upsert(rows, { onConflict: 'user_id,id' });
  if (error) throw error;
}

/** Marks rows deleted. A row that never reached the server is simply absent, which is fine. */
export async function softDeleteRows(
  table: 'tasks' | 'todos' | 'day_modes',
  ids: string[],
  at: number,
): Promise<void> {
  if (!supabase || ids.length === 0) return;
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: at, updated_at: at })
    .in('id', ids);
  if (error) throw error;
}
