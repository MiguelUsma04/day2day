import type { DayModeRecord, Task, Todo } from '../types/task';
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
};
