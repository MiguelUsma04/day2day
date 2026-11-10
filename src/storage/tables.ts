/**
 * Names and shapes shared by every synced collection.
 *
 * Deliberately import-free: `cloud`, `syncQueue` and `collections` all depend
 * on it, and `collections` depends on `cloud`, so anything here that imported
 * back would close a cycle.
 */

export const TABLES = [
  'tasks',
  'todos',
  'day_modes',
  'profiles',
  'body_measurements',
  'weights',
  'sleep_logs',
  'water_logs',
  'workouts',
  'meals',
  'user_portions',
] as const;

export type Table = (typeof TABLES)[number];

/** What every local record has in common: an id and the client-side edit time. */
export type Rec = { id: string; updatedAt: number };

/** What every server row has in common. `synced_at` is the server clock (pull cursor). */
export type Row = { id: string; updated_at: number; deleted_at: number | null; synced_at?: string };
