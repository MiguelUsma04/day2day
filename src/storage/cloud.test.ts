import { afterEach, describe, expect, test } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { __setClientForTests, fetchChanges, softDeleteRows, upsertRows, type TodoRow } from './cloud';

type Call = { table: string; method: string; args: unknown[] };

/**
 * A stand-in for the Supabase client that records every builder call and
 * resolves to an empty result when awaited, like a real query would.
 */
type Result = { data: unknown[] | null; error: unknown };

function fakeClient(result: Result | Result[] = { data: [], error: null }) {
  const calls: Call[] = [];
  // A list hands out one result per awaited query, in order.
  const next = () => (Array.isArray(result) ? result.shift()! : result);
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'eq', 'gt', 'in', 'update', 'upsert']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject);
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

afterEach(() => __setClientForTests(null));

describe('fetchChanges', () => {
  test('filters every requested table by user_id', async () => {
    const { client, calls } = fakeClient();
    __setClientForTests(client);

    const tables = ['tasks', 'todos', 'meals'] as const;
    const res = await fetchChanges('2026-11-01T00:00:00Z', 'u1', tables);

    for (const table of tables) {
      const eqs = calls.filter((c) => c.table === table && c.method === 'eq');
      expect(eqs).toEqual([{ table, method: 'eq', args: ['user_id', 'u1'] }]);
      const gts = calls.filter((c) => c.table === table && c.method === 'gt');
      expect(gts).toEqual([{ table, method: 'gt', args: ['synced_at', '2026-11-01T00:00:00Z'] }]);
    }
    // Only the requested tables are queried.
    expect(new Set(calls.map((c) => c.table))).toEqual(new Set(tables));
    expect(res.rows.tasks).toEqual([]);
    expect(res.rows.meals).toEqual([]);
    expect(res.cursor).toBe('2026-11-01T00:00:00Z');
  });

  test('without a cursor still scopes to the user and skips the synced_at filter', async () => {
    const { client, calls } = fakeClient();
    __setClientForTests(client);

    await fetchChanges(null, 'u1', ['day_modes']);

    expect(calls.filter((c) => c.method === 'eq')).toEqual([
      { table: 'day_modes', method: 'eq', args: ['user_id', 'u1'] },
    ]);
    expect(calls.some((c) => c.method === 'gt')).toBe(false);
  });

  test('the newest synced_at seen becomes the cursor', async () => {
    const { client } = fakeClient({
      data: [
        { id: 'a', updated_at: 1, deleted_at: null, synced_at: '2026-11-02T00:00:00Z' },
        { id: 'b', updated_at: 1, deleted_at: null, synced_at: '2026-11-03T00:00:00Z' },
      ],
      error: null,
    });
    __setClientForTests(client);

    const res = await fetchChanges('2026-11-01T00:00:00Z', 'u1', ['tasks', 'todos']);
    expect(res.cursor).toBe('2026-11-03T00:00:00Z');
    expect(res.rows.tasks).toHaveLength(2);
  });
});

describe('softDeleteRows', () => {
  test('scopes the update to the user', async () => {
    const { client, calls } = fakeClient();
    __setClientForTests(client);

    await softDeleteRows('tasks', ['x', 'y'], 123, 'u1');

    expect(calls).toEqual([
      { table: 'tasks', method: 'update', args: [{ deleted_at: 123, updated_at: 123 }] },
      { table: 'tasks', method: 'in', args: ['id', ['x', 'y']] },
      { table: 'tasks', method: 'eq', args: ['user_id', 'u1'] },
    ]);
  });
});

describe('upsertRows', () => {
  const todo: TodoRow = {
    id: 't1',
    user_id: 'u1',
    title: 'x',
    date: '2026-11-09',
    done: false,
    sort_order: 5,
    created_at: 1,
    updated_at: 2,
    deleted_at: null,
  };

  test('uses the given conflict target', async () => {
    const { client, calls } = fakeClient();
    __setClientForTests(client);

    await upsertRows('day_modes', [todo], 'user_id,id');

    expect(calls).toEqual([
      { table: 'day_modes', method: 'upsert', args: [[todo], { onConflict: 'user_id,id' }] },
    ]);
  });

  test('retries todos without sort_order on a server that lacks the column', async () => {
    const { client, calls } = fakeClient([
      { data: null, error: { code: 'PGRST204', message: 'no sort_order' } },
      { data: null, error: null },
    ]);
    __setClientForTests(client);

    await upsertRows('todos', [todo], 'id');

    const { sort_order: _dropped, ...legacy } = todo;
    expect(calls.map((c) => c.args)).toEqual([
      [[todo], { onConflict: 'id' }],
      [[legacy], { onConflict: 'id' }],
    ]);
  });
});
