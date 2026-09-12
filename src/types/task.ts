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
 * A single entry in the schedule. A repeating entry is stored once and projected
 * onto every matching day, so editing the routine updates every day at once.
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
  repeat: Repeat;
  /**
   * Completion is per-day, keyed by "YYYY-MM-DD", so finishing a routine today
   * leaves tomorrow's instance untouched.
   */
  completedDays: string[];
  /** Days on which a repeating task was dismissed without deleting the routine. */
  skippedDays: string[];
  createdAt: number;
};

export type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'completedDays' | 'skippedDays'>;

/** A task resolved onto one specific day, ready to render. */
export type TaskInstance = Task & {
  dayKey: string;
  done: boolean;
  isRepeating: boolean;
};
