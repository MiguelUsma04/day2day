import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getAllKeys: vi.fn(async () => [...store.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
  },
}));

import { claimLocalData, OWNER_KEY } from './localOwner';
import { enqueue, loadQueue, pendingCount } from './syncQueue';

const MIGUEL = 'uid-miguel';
const KAREN = 'uid-karen';

function seedMiguel() {
  store.set('day2day:tasks:v1', JSON.stringify([{ id: 't1', title: 'Revisión de trading' }]));
  store.set('day2day:todos:v1', JSON.stringify([{ id: 'd1' }]));
  store.set('day2day:profiles:v1', JSON.stringify([{ id: MIGUEL }]));
  store.set('day2day:syncQueue:v1', JSON.stringify({ tasks: { t1: { op: 'upsert' } } }));
  store.set(`day2day:syncCursor:v1:${MIGUEL}:tasks,todos,day_modes`, '2026-11-10T00:00:00Z');
  store.set('day2day:mealDraft:v1', '{}');
  store.set('day2day:appearance:v1', '{"mode":"dark"}');
  store.set('day2day:deviceId:v1', 'device-1');
}

describe('claimLocalData', () => {
  beforeEach(() => {
    store.clear();
  });

  it('keeps everything when the same account comes back', async () => {
    seedMiguel();
    store.set(OWNER_KEY, MIGUEL);

    expect(await claimLocalData(MIGUEL)).toBe('kept');
    expect(store.get('day2day:tasks:v1')).toContain('Revisión de trading');
    expect(store.has('day2day:syncQueue:v1')).toBe(true);
  });

  it('drops the previous account data when another account signs in', async () => {
    seedMiguel();
    store.set(OWNER_KEY, MIGUEL);
    await loadQueue();
    enqueue('tasks', 't2', { op: 'upsert' });

    expect(await claimLocalData(KAREN)).toBe('reset');

    expect(store.has('day2day:tasks:v1')).toBe(false);
    expect(store.has('day2day:todos:v1')).toBe(false);
    expect(store.has('day2day:profiles:v1')).toBe(false);
    expect(store.has('day2day:syncQueue:v1')).toBe(false);
    expect(store.has('day2day:mealDraft:v1')).toBe(false);
    expect([...store.keys()].some((k) => k.startsWith('day2day:syncCursor:v1'))).toBe(false);
    // The queue in memory must not carry the other account's edits either.
    expect(pendingCount()).toBe(0);
    expect(store.get(OWNER_KEY)).toBe(KAREN);
    // Device-level settings are not account data.
    expect(store.get('day2day:appearance:v1')).toBe('{"mode":"dark"}');
    expect(store.get('day2day:deviceId:v1')).toBe('device-1');
  });

  it('resets data of unknown origin (written before owners were tracked)', async () => {
    seedMiguel();

    expect(await claimLocalData(KAREN)).toBe('reset');
    expect(store.has('day2day:tasks:v1')).toBe(false);
    expect(store.get(OWNER_KEY)).toBe(KAREN);
  });

  it('postpones the reset of unknown-origin data while offline', async () => {
    seedMiguel();

    expect(await claimLocalData(KAREN, { online: false })).toBe('kept');
    expect(store.has('day2day:tasks:v1')).toBe(true);
    expect(store.has(OWNER_KEY)).toBe(false);
  });

  it('claims an empty device without touching anything', async () => {
    store.set('day2day:appearance:v1', '{"mode":"dark"}');

    expect(await claimLocalData(KAREN)).toBe('kept');
    expect(store.get(OWNER_KEY)).toBe(KAREN);
    expect(store.get('day2day:appearance:v1')).toBe('{"mode":"dark"}');
  });
});
