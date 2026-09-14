import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EditScope, Task, TaskDraft, TaskInstance, Todo } from '../types/task';
import { occursOn } from './occurrence';
import { loadTasks, loadTodos, saveTasks, saveTodos } from './tasks';

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Scheduled entries sort by start time; unscheduled ones trail in creation order. */
function sortInstances(items: TaskInstance[]): TaskInstance[] {
  return [...items].sort((a, b) => {
    if (a.startMinutes === null && b.startMinutes === null) return a.createdAt - b.createdAt;
    if (a.startMinutes === null) return 1;
    if (b.startMinutes === null) return -1;
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.createdAt - b.createdAt;
  });
}

/** Applies any per-day override on top of the stored task. */
function resolve(task: Task, dayKey: string): TaskInstance {
  const override = task.overrides[dayKey];
  return {
    ...task,
    ...(override ?? {}),
    dayKey,
    done: task.completedDays.includes(dayKey),
    isRepeating: task.repeat.kind !== 'none',
    hasOverride: override !== undefined,
  };
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([loadTasks(), loadTodos()]).then(([storedTasks, storedTodos]) => {
      if (!active) return;
      setTasks(storedTasks);
      setTodos(storedTodos);
      setIsLoading(false);
      hydrated.current = true;
    });
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

  const addTask = useCallback((draft: TaskDraft) => {
    setTasks((prev) => [
      ...prev,
      {
        ...draft,
        id: createId(),
        completedDays: [],
        skippedDays: [],
        overrides: {},
        createdAt: Date.now(),
      },
    ]);
  }, []);

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
            const clearedOverrides =
              Object.keys(rest).length > 0 ? {} : t.overrides;
            return { ...t, ...patch, overrides: clearedOverrides };
          }

          const { repeat: _ignored, reminderMinutes: _r2, ...dayFields } = patch;
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
    [],
  );

  /** Toggling affects only the given day, keeping routine history per-day. */
  const toggleTask = useCallback((id: string, dayKey: string) => {
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
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Removes a single day from a routine without deleting the routine itself. */
  const skipOccurrence = useCallback((id: string, dayKey: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id && t.repeat.kind !== 'none'
          ? { ...t, skippedDays: [...t.skippedDays, dayKey] }
          : t,
      ),
    );
  }, []);

  /** Replaces or appends imported entries; returns how many were added. */
  const importTasks = useCallback((incoming: TaskDraft[], replace: boolean) => {
    const now = Date.now();
    const built: Task[] = incoming.map((draft, i) => ({
      ...draft,
      id: createId(),
      completedDays: [],
      skippedDays: [],
      overrides: {},
      // Stagger so same-time entries keep their listed order.
      createdAt: now + i,
    }));
    setTasks((prev) => (replace ? built : [...prev, ...built]));
    return built.length;
  }, []);

  const getTasksForDay = useCallback(
    (dayKey: string): TaskInstance[] =>
      sortInstances(tasks.filter((t) => occursOn(t, dayKey)).map((t) => resolve(t, dayKey))),
    [tasks],
  );

  /** Day keys that should show a dot in the week strip. */
  const markedDays = useMemo(() => {
    const keys = new Set<string>();
    for (const task of tasks) {
      if (task.repeat.kind === 'none') keys.add(task.date);
    }
    for (const todo of todos) keys.add(todo.date);
    return keys;
  }, [tasks, todos]);

  const addTodo = useCallback((title: string, date: string) => {
    setTodos((prev) => [
      ...prev,
      { id: createId(), title, date, done: false, createdAt: Date.now() },
    ]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Replaces everything from a backup, history included. */
  const restoreBackup = useCallback((nextTasks: Task[], nextTodos: Todo[]) => {
    setTasks(nextTasks);
    setTodos(nextTodos);
  }, []);

  const getTodosForDay = useCallback(
    (dayKey: string) =>
      todos.filter((t) => t.date === dayKey).sort((a, b) => a.createdAt - b.createdAt),
    [todos],
  );

  return {
    tasks,
    todos,
    isLoading,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    skipOccurrence,
    importTasks,
    restoreBackup,
    getTasksForDay,
    markedDays,
    addTodo,
    toggleTodo,
    deleteTodo,
    getTodosForDay,
  };
}
