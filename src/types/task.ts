export const CATEGORIES = ['work', 'personal', 'health', 'study', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

/** 0 = Sunday … 6 = Saturday, matching Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const REPEAT_KINDS = ['none', 'daily', 'weekdays', 'custom'] as const;
export type RepeatKind = (typeof REPEAT_KINDS)[number];

export type Repeat = {
  kind: RepeatKind;
  /** Only meaningful when kind is 'custom'. */
  days: Weekday[];
};

export const NO_REPEAT: Repeat = { kind: 'none', days: [] };

/**
 * Where an activity belongs. Weekends can be spent in the city or at the farm
 * and carry different routines; weekdays are implicitly "city".
 */
export const TASK_CONTEXTS = ['any', 'city', 'farm'] as const;
export type TaskContext = (typeof TASK_CONTEXTS)[number];

/**
 * How a given day is being spent. Weekends default to 'city'; a weekday marked
 * 'holiday' shows no activities and does not count against the streak.
 */
export const DAY_MODES = ['city', 'farm', 'holiday'] as const;
export type DayMode = (typeof DAY_MODES)[number];

/** A day's mode, resolved with defaults: weekdays are 'normal' unless marked. */
export type ResolvedDayMode = DayMode | 'normal';

/** One explicitly marked day. `id` is the day key itself, so it syncs like any record. */
export type DayModeRecord = {
  id: string;
  /** Local "YYYY-MM-DD". Same as id; kept for symmetry with the other records. */
  date: string;
  mode: DayMode;
  createdAt: number;
  updatedAt: number;
};

/** Fields a single day can override on a repeating task. */
export type Override = Partial<
  Pick<Task, 'title' | 'notes' | 'startMinutes' | 'durationMinutes' | 'category' | 'icon'>
>;

/**
 * A single entry in the schedule. A repeating entry is stored once and projected
 * onto every matching day, so editing the routine updates every day at once.
 * A single day can deviate via `overrides`, keyed by day.
 */
export type Task = {
  id: string;
  title: string;
  notes?: string;
  /** For one-off tasks, the day it belongs to. For repeating ones, the day it starts. */
  date: string;
  startMinutes: number | null;
  durationMinutes: number;
  category: Category;
  /** Ionicons name; falls back to the category icon when absent. */
  icon?: string;
  repeat: Repeat;
  /** Which kind of day this belongs to; 'any' shows everywhere. */
  context: TaskContext;
  /**
   * Completion is per-day, keyed by "YYYY-MM-DD", so finishing a routine today
   * leaves tomorrow's instance untouched.
   */
  completedDays: string[];
  /** Days on which a repeating task was dismissed without deleting the routine. */
  skippedDays: string[];
  /** Per-day edits that apply to one occurrence only. */
  overrides: Record<string, Override>;
  /** Minutes before the start time to fire a reminder; null disables it. */
  reminderMinutes: number | null;
  createdAt: number;
  /**
   * Last local change, in ms. Drives sync: when the same record was edited on
   * two devices, the later edit wins.
   */
  updatedAt: number;
};

export type TaskDraft = Omit<
  Task,
  'id' | 'createdAt' | 'updatedAt' | 'completedDays' | 'skippedDays' | 'overrides'
>;

/** A task resolved onto one specific day, ready to render. */
export type TaskInstance = Task & {
  dayKey: string;
  done: boolean;
  isRepeating: boolean;
  /** True when this day carries its own edits. */
  hasOverride: boolean;
};

/** How an edit to a repeating task should apply. */
export type EditScope = 'one' | 'all';

/** A lightweight item on the day's to-do list, outside the timed schedule. */
export type Todo = {
  id: string;
  title: string;
  /** Local "YYYY-MM-DD" the item belongs to. */
  date: string;
  done: boolean;
  /**
   * Position in the day's list, chosen by dragging; lower comes first. It is
   * a float so a drop between two neighbours takes their midpoint and only
   * the moved item changes. Defaults to `createdAt`, which keeps the old
   * "in the order they were written" behaviour for untouched lists.
   */
  order: number;
  createdAt: number;
  /** Last local change, in ms; see Task.updatedAt. */
  updatedAt: number;
};
