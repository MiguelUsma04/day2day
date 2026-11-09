import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type {
  DayMode,
  DayModeRecord,
  EditScope,
  Task,
  TaskDraft,
  TaskInstance,
  Todo,
} from '../types/task';
import { addDays, fromDayKey, toDayKey } from '../utils/date';
import { createId } from '../utils/id';
import { COLLECTIONS } from './collections';
import { resolveDayMode, toDayModeMap } from './dayModes';
import { byOrder, markedDaysOf, tasksForDay, todosForDay } from './dayView';
import {
  loadDayModes,
  loadTasks,
  loadTodos,
  normalizeDayMode,
  normalizeTask,
  normalizeTodo,
  saveDayModes,
  saveTasks,
  saveTodos,
} from './tasks';
import { useCloudSync, type CloudSync } from './useCloudSync';

/** Gap left between items when one lands at either end of the list. */
const ORDER_STEP = 1000;

/**
 * Stamps `updatedAt` on every record the updater replaced.
 *
 * Every mutation below returns new objects for what it touched and the same
 * references for the rest, so identity is a reliable "did this change" signal.
 * Doing it here, once, means no mutation can forget to bump the timestamp,
 * which is what sync relies on to pick a winner.
 */
function stamped<T extends { id: string; updatedAt: number }>(prev: T[], next: T[]): T[] {
  if (prev === next) return next;
  const before = new Map(prev.map((t) => [t.id, t]));
  const now = Date.now();
  return next.map((t) => (before.get(t.id) === t ? t : { ...t, updatedAt: now }));
}

export type TaskStore = ReturnType<typeof useTasks>;

export function useTasks(userId: string | null) {
  const [tasks, setTasksRaw] = useState<Task[]>([]);
  const [todos, setTodosRaw] = useState<Todo[]>([]);
  const [dayModeList, setDayModesRaw] = useState<DayModeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hydrated = useRef(false);

  const setTasks = useCallback((updater: (prev: Task[]) => Task[]) => {
    setTasksRaw((prev) => stamped(prev, updater(prev)));
  }, []);
  const setTodos = useCallback((updater: (prev: Todo[]) => Todo[]) => {
    setTodosRaw((prev) => stamped(prev, updater(prev)));
  }, []);
  const setDayModes = useCallback((updater: (prev: DayModeRecord[]) => DayModeRecord[]) => {
    setDayModesRaw((prev) => stamped(prev, updater(prev)));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadTasks(), loadTodos(), loadDayModes()]).then(
      ([storedTasks, storedTodos, storedModes]) => {
        if (!active) return;
        setTasksRaw(storedTasks);
        setTodosRaw(storedTodos);
        setDayModesRaw(storedModes);
        setIsLoading(false);
        hydrated.current = true;
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Persist only after hydration, so the initial empty state never overwrites stored data.
  useEffect(() => {
    if (!hydrated.current) return;
    void saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    if (!hydrated.current) return;
    void saveTodos(todos);
  }, [todos]);

  useEffect(() => {
    if (!hydrated.current) return;
    void saveDayModes(dayModeList);
  }, [dayModeList]);

  /** Marked days by key; the schedule, the report and the reminders all consult it. */
  const dayModes = useMemo(() => toDayModeMap(dayModeList), [dayModeList]);

  // Mirror local changes to the database and fold remote ones back in. Raw
  // setters on purpose: what arrives from the server already carries its own
  // updatedAt and must not be re-stamped as a fresh local edit.
  const cloud: CloudSync = useCloudSync({
    userId,
    ready: !isLoading,
    bindings: [
      { def: COLLECTIONS.tasks, items: tasks, setItems: setTasksRaw },
      { def: COLLECTIONS.todos, items: todos, setItems: setTodosRaw },
      { def: COLLECTIONS.day_modes, items: dayModeList, setItems: setDayModesRaw },
    ],
  });

  // Pull when the app comes back to the foreground: that is when another
  // device's edits are most likely to be waiting.
  useEffect(() => {
    if (!userId) return;
    const onActive = () => void cloud.syncNow();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onActive();
    });
    let detach: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') onActive();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onActive);
      detach = () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onActive);
      };
    }
    return () => {
      sub.remove();
      detach?.();
    };
  }, [userId, cloud.syncNow]);

  const addTask = useCallback(
    (draft: TaskDraft) => {
      const now = Date.now();
      setTasks((prev) => [
        ...prev,
        {
          ...draft,
          id: createId(),
          completedDays: [],
          skippedDays: [],
          overrides: {},
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },
    [setTasks],
  );

  /**
   * Scope 'all' rewrites the task itself; scope 'one' records a per-day override,
   * leaving the other occurrences of a routine untouched.
   */
  const updateTask = useCallback(
    (id: string, patch: Partial<TaskDraft>, scope: EditScope, dayKey: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;

          if (scope === 'all' || t.repeat.kind === 'none') {
            // Editing the whole series makes stale per-day copies misleading.
            const { repeat: _r, ...rest } = patch;
            const clearedOverrides = Object.keys(rest).length > 0 ? {} : t.overrides;
            return { ...t, ...patch, overrides: clearedOverrides };
          }

          const {
            repeat: _ignored,
            reminderMinutes: _r2,
            date: _r3,
            context: _r4,
            ...dayFields
          } = patch;
          return {
            ...t,
            overrides: {
              ...t.overrides,
              [dayKey]: { ...(t.overrides[dayKey] ?? {}), ...dayFields },
            },
          };
        }),
      );
    },
    [setTasks],
  );

  /** Toggling affects only the given day, keeping routine history per-day. */
  const toggleTask = useCallback(
    (id: string, dayKey: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const done = t.completedDays.includes(dayKey);
          return {
            ...t,
            completedDays: done
              ? t.completedDays.filter((d) => d !== dayKey)
              : [...t.completedDays, dayKey],
          };
        }),
      );
    },
    [setTasks],
  );

  const deleteTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    },
    [setTasks],
  );

  /** Removes a single day from a routine without deleting the routine itself. */
  const skipOccurrence = useCallback(
    (id: string, dayKey: string) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id && t.repeat.kind !== 'none'
            ? { ...t, skippedDays: [...t.skippedDays, dayKey] }
            : t,
        ),
      );
    },
    [setTasks],
  );

  /** Replaces or appends imported entries; returns how many were added. */
  const importTasks = useCallback(
    (incoming: TaskDraft[], replace: boolean) => {
      const now = Date.now();
      const built: Task[] = incoming.map((draft, i) => ({
        ...draft,
        id: createId(),
        completedDays: [],
        skippedDays: [],
        overrides: {},
        // Stagger so same-time entries keep their listed order.
        createdAt: now + i,
        updatedAt: now + i,
      }));
      setTasks((prev) => (replace ? built : [...prev, ...built]));
      return built.length;
    },
    [setTasks],
  );

  const getTasksForDay = useCallback(
    (dayKey: string): TaskInstance[] => tasksForDay(tasks, dayModes, dayKey),
    [tasks, dayModes],
  );

  const getDayMode = useCallback(
    (dayKey: string) => resolveDayMode(dayModes, dayKey),
    [dayModes],
  );

  /**
   * Marks how a day is spent. `null` clears the mark, so the day falls back to
   * its default (city at the weekend, normal on a weekday).
   */
  const setDayMode = useCallback(
    (dayKey: string, mode: DayMode | null) => {
      setDayModes((prev) => {
        const rest = prev.filter((r) => r.id !== dayKey);
        if (mode === null) return rest.length === prev.length ? prev : rest;
        const existing = prev.find((r) => r.id === dayKey);
        if (existing?.mode === mode) return prev;
        const now = Date.now();
        return [
          ...rest,
          {
            id: dayKey,
            date: dayKey,
            mode,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          },
        ];
      });
    },
    [setDayModes],
  );

  /** Day keys that should show a dot in the week strip. */
  const markedDays = useMemo(() => markedDaysOf(tasks, todos), [tasks, todos]);

  const addTodo = useCallback(
    (title: string, date: string) => {
      const now = Date.now();
      setTodos((prev) => [
        ...prev,
        { id: createId(), title, date, done: false, order: now, createdAt: now, updatedAt: now },
      ]);
    },
    [setTodos],
  );

  const updateTodo = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)));
    },
    [setTodos],
  );

  /** Moves an item by whole days, keeping its position in the new day's list. */
  const moveTodo = useCallback(
    (id: string, deltaDays: number) => {
      setTodos((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, date: toDayKey(addDays(fromDayKey(t.date), deltaDays)) } : t,
        ),
      );
    },
    [setTodos],
  );

  const toggleTodo = useCallback(
    (id: string) => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    },
    [setTodos],
  );

  /**
   * Drops a pending item at `index` among the day's other pending items.
   * Only the moved item changes: its order becomes the midpoint of its new
   * neighbours, so one row goes up to the server instead of the whole list.
   */
  const reorderTodo = useCallback(
    (id: string, index: number) => {
      setTodos((prev) => {
        const me = prev.find((t) => t.id === id);
        if (!me || me.done) return prev;
        const others = prev
          .filter((t) => t.date === me.date && !t.done && t.id !== id)
          .sort(byOrder);
        const at = Math.max(0, Math.min(index, others.length));
        const before = others[at - 1];
        const after = others[at];
        let order: number;
        if (before && after) order = (before.order + after.order) / 2;
        else if (before) order = before.order + ORDER_STEP;
        else if (after) order = after.order - ORDER_STEP;
        else order = me.order;
        // Two neighbours so close that the midpoint collapses: spread the
        // whole list out again. Rare, and the list is short.
        if ((before && order <= before.order) || (after && order >= after.order)) {
          const spread = [...others.slice(0, at), me, ...others.slice(at)];
          const base = Date.now();
          const orders = new Map(spread.map((t, i) => [t.id, base + i * ORDER_STEP]));
          return prev.map((t) => (orders.has(t.id) ? { ...t, order: orders.get(t.id)! } : t));
        }
        if (order === me.order) return prev;
        return prev.map((t) => (t.id === id ? { ...t, order } : t));
      });
    },
    [setTodos],
  );

  const deleteTodo = useCallback(
    (id: string) => {
      setTodos((prev) => prev.filter((t) => t.id !== id));
    },
    [setTodos],
  );

  /** Wipes data in bulk. Each part is opt-in so nothing goes beyond the request. */
  const clearData = useCallback(
    (what: { tasks?: boolean; todos?: boolean; history?: boolean }) => {
      if (what.tasks) setTasks(() => []);
      else if (what.history) {
        // Keep the activities, forget only what was ticked off.
        setTasks((prev) =>
          prev.map((t) => ({ ...t, completedDays: [], skippedDays: [], overrides: {} })),
        );
      }
      if (what.todos) setTodos(() => []);
      if (what.tasks && what.todos) setDayModes(() => []);
    },
    [setTasks, setTodos, setDayModes],
  );

  /**
   * Replaces everything from a backup, history included. Records are
   * normalised (a backup may predate fields added later) and get a fresh
   * updatedAt, so restoring deliberately overrides whatever other devices hold.
   */
  const restoreBackup = useCallback(
    (nextTasks: Task[], nextTodos: Todo[], nextModes: DayModeRecord[] = []) => {
      const cleanTasks = nextTasks.map(normalizeTask).filter((t): t is Task => t !== null);
      const cleanTodos = nextTodos.map(normalizeTodo).filter((t): t is Todo => t !== null);
      const cleanModes = nextModes
        .map(normalizeDayMode)
        .filter((t): t is DayModeRecord => t !== null);
      setTasks(() => cleanTasks);
      setTodos(() => cleanTodos);
      setDayModes(() => cleanModes);
    },
    [setTasks, setTodos, setDayModes],
  );

  const getTodosForDay = useCallback(
    (dayKey: string) => todosForDay(todos, dayKey),
    [todos],
  );

  return {
    tasks,
    todos,
    dayModes,
    dayModeList,
    getDayMode,
    setDayMode,
    isLoading,
    cloud,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    skipOccurrence,
    importTasks,
    restoreBackup,
    clearData,
    getTasksForDay,
    markedDays,
    addTodo,
    updateTodo,
    moveTodo,
    toggleTodo,
    reorderTodo,
    deleteTodo,
    getTodosForDay,
  };
}
