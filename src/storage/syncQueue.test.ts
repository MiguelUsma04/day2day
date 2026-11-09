import { describe, expect, it, vi } from 'vitest';

/** In-memory AsyncStorage whose reads resolve on a later tick, like the real one. */
const store = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return store.get(key) ?? null;
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  },
}));

describe('loadQueue', () => {
  it('lets two concurrent callers both see the stored entries', async () => {
    store.set(
      'day2day:syncQueue:v1',
      JSON.stringify({ tasks: { 'task-1': { op: 'upsert' } }, meals: { 'meal-1': { op: 'delete', at: 42 } } }),
    );
    const { loadQueue, pending, pendingCount } = await import('./syncQueue');

    const seen: number[] = [];
    await Promise.all([
      loadQueue().then(() => seen.push(pendingCount())),
      loadQueue().then(() => seen.push(pendingCount())),
    ]);

    expect(seen).toEqual([2, 2]);
    expect(pending('tasks', 'task-1')).toEqual({ op: 'upsert' });
    expect(pending('meals', 'meal-1')).toEqual({ op: 'delete', at: 42 });
  });
});
