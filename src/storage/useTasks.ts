import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Task, TaskDraft, TaskInstance, Weekday } from '../types/task';
import { fromDayKey } from '../utils/date';
import { loadTasks, saveTasks } from './tasks';

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

/** Does a repeating task land on this day? Repeats never apply before their start date. */
function occursOn(task: Task, dayKey: string): boolean {
  if (task.repeat.kind === 'none') return task.date === dayKey;
  if (dayKey < task.date) return false;
  if (task.skippedDays.includes(dayKey)) return false;

  const weekday = fromDayKey(dayKey).getDay() as Weekday;
  switch (task.repeat.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday >= 1 && weekday <= 5;
    case 'custom':
      return task.repeat.days.includes(weekday);
    default:
      return false;
  }
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    loadTasks().then((stored) => {
      if (!active) return;
      setTasks(stored);
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

  const addTask = useCallback((draft: TaskDraft) => {
    setTasks((prev) => [
      ...prev,
      { ...draft, id: createId(), completedDays: [], skippedDays: [], createdAt: Date.now() },
    ]);
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<TaskDraft>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

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

  const getTasksForDay = useCallback(
    (dayKey: string): TaskInstance[] => {
      const instances = tasks
        .filter((task) => occursOn(task, dayKey))
        .map<TaskInstance>((task) => ({
          ...task,
          dayKey,
          done: task.completedDays.includes(dayKey),
          isRepeating: task.repeat.kind !== 'none',
        }));
      return sortInstances(instances);
    },
    [tasks],
  );

  /** Day keys that should show a dot in the week strip. */
  const markedDays = useMemo(() => {
    const keys = new Set<string>();
    for (const task of tasks) {
      if (task.repeat.kind === 'none') keys.add(task.date);
    }
    return keys;
  }, [tasks]);

  const hasRoutines = useMemo(() => tasks.some((t) => t.repeat.kind !== 'none'), [tasks]);

  return {
    tasks,
    isLoading,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    skipOccurrence,
    getTasksForDay,
    markedDays,
    hasRoutines,
  };
}
