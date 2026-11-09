import type { Task, TaskInstance, Todo } from '../types/task';
import type { DayModeMap } from './dayModes';
import { occursOn } from './occurrence';

/**
 * Pure read-side helpers shared by `useTasks` (my own data) and the partner
 * view (a snapshot fetched from the server). Keeping them here means both
 * views resolve routines, overrides and day modes exactly the same way.
 */

export function byOrder(a: Todo, b: Todo): number {
  return a.order - b.order || a.createdAt - b.createdAt;
}

/**
 * Scheduled entries sort by start time; unscheduled ones trail in creation order.
 *
 * Completed entries drop below the pending ones, so what is left to do stays at
 * the top of the day instead of being buried under what is already done.
 */
export function sortInstances(items: TaskInstance[]): TaskInstance[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.startMinutes === null && b.startMinutes === null) return a.createdAt - b.createdAt;
    if (a.startMinutes === null) return 1;
    if (b.startMinutes === null) return -1;
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.createdAt - b.createdAt;
  });
}

/** Applies any per-day override on top of the stored task. */
export function resolve(task: Task, dayKey: string): TaskInstance {
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

/** The day's entries: routines and one-offs that occur on it, resolved and sorted. */
export function tasksForDay(tasks: Task[], dayModes: DayModeMap, dayKey: string): TaskInstance[] {
  return sortInstances(
    tasks.filter((t) => occursOn(t, dayKey, dayModes)).map((t) => resolve(t, dayKey)),
  );
}

/** The day's todos; done items sink, matching how the schedule orders itself. */
export function todosForDay(todos: Todo[], dayKey: string): Todo[] {
  return todos
    .filter((t) => t.date === dayKey)
    .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : byOrder(a, b)));
}

/** Day keys that should show a dot in the week strip. */
export function markedDaysOf(tasks: Task[], todos: Todo[]): Set<string> {
  const keys = new Set<string>();
  for (const task of tasks) {
    if (task.repeat.kind === 'none') keys.add(task.date);
  }
  for (const todo of todos) keys.add(todo.date);
  return keys;
}
