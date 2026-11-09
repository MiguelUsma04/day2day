import { describe, expect, test, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Meal } from '../types/nutrition';
import type { Todo } from '../types/task';
import {
  fetchPartnerId,
  fetchPartnerSnapshot,
  insertTodoFor,
  readOnlyNutritionStore,
  type PartnerSnapshot,
} from './partner';

type Call = { table: string; method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

/** Records every builder call; awaiting the builder resolves to `result`. */
function fakeClient(result: Result | ((table: string) => Result) = { data: [], error: null }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'insert', 'maybeSingle']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(typeof result === 'function' ? result(table) : result).then(resolve, reject);
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const TABLES = [
  'tasks',
  'todos',
  'day_modes',
  'meals',
  'weights',
  'sleep_logs',
  'workouts',
  'profiles',
  'body_measurements',
];

describe('fetchPartnerSnapshot', () => {
  test('scopes every table to the partner and skips soft-deleted rows', async () => {
    const { client, calls } = fakeClient();
    const snap = await fetchPartnerSnapshot('p1', client);

    expect(new Set(calls.map((c) => c.table))).toEqual(new Set(TABLES));
    for (const table of TABLES) {
      const mine = calls.filter((c) => c.table === table);
      expect(mine).toContainEqual({ table, method: 'eq', args: ['user_id', 'p1'] });
      expect(mine).toContainEqual({ table, method: 'is', args: ['deleted_at', null] });
    }
    expect(snap.tasks).toEqual([]);
    expect(snap.profile).toBeNull();
  });

  test('converts rows with the collection converters', async () => {
    const { client } = fakeClient((table) =>
      table === 'todos'
        ? {
            data: [
              {
                id: 't1',
                user_id: 'p1',
                title: 'Comprar pan',
                date: '2026-11-09',
                done: false,
                sort_order: 5,
                created_at: 1,
                updated_at: 2,
                deleted_at: null,
              },
            ],
            error: null,
          }
        : { data: [], error: null },
    );
    const snap = await fetchPartnerSnapshot('p1', client);
    expect(snap.todos).toHaveLength(1);
    expect(snap.todos[0]).toMatchObject({ id: 't1', title: 'Comprar pan', order: 5 });
  });

  test('a query error rejects', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(fetchPartnerSnapshot('p1', client)).rejects.toThrow('boom');
  });
});

describe('insertTodoFor', () => {
  const todo: Todo = {
    id: 'n1',
    title: 'Llamar al médico',
    date: '2026-11-09',
    done: false,
    order: 10,
    createdAt: 10,
    updatedAt: 10,
  };

  test('inserts the row owned by the partner', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await insertTodoFor('p1', todo, client);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('todos');
    expect(calls[0].method).toBe('insert');
    expect(calls[0].args[0]).toMatchObject({ id: 'n1', user_id: 'p1', title: 'Llamar al médico' });
  });

  test('a network failure becomes the offline message', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    await expect(insertTodoFor('p1', todo, client)).rejects.toThrow(
      'Sin conexión: el pendiente no se creó',
    );
  });

  test('any other failure (e.g. RLS) gives the generic message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = fakeClient({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' },
    });
    await expect(insertTodoFor('p1', todo, client)).rejects.toThrow('No se pudo crear el pendiente');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('without a client it is offline too', async () => {
    await expect(insertTodoFor('p1', todo, null)).rejects.toThrow('Sin conexión');
  });
});

describe('fetchPartnerId', () => {
  test('reads the partner row of the user', async () => {
    const { client, calls } = fakeClient({ data: { partner_id: 'p1' }, error: null });
    expect(await fetchPartnerId('u1', client)).toBe('p1');
    expect(calls).toContainEqual({ table: 'partners', method: 'eq', args: ['user_id', 'u1'] });
  });

  test('no row means no partner', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await fetchPartnerId('u1', client)).toBeNull();
  });
});

describe('readOnlyNutritionStore', () => {
  const meal = (id: string, date: string, timeMinutes: number): Meal =>
    ({ id, date, timeMinutes, createdAt: 1, updatedAt: 1, slot: 'lunch', title: '', items: [] }) as unknown as Meal;

  const snapshot: PartnerSnapshot = {
    tasks: [],
    todos: [],
    dayModes: [],
    meals: [meal('a', '2026-11-09', 800), meal('b', '2026-11-08', 700), meal('c', '2026-11-09', 600)],
    weights: [{ id: '2026-11-09', date: '2026-11-09', weightKg: 60, createdAt: 1, updatedAt: 1 }],
    sleepLogs: [],
    workouts: [],
    profile: null,
    measurements: [],
  };

  test('mutators do nothing', () => {
    const store = readOnlyNutritionStore(snapshot);
    store.setWeight('2026-11-09', 99);
    store.deleteMeal('a');
    expect(store.getWeightFor('2026-11-09')?.weightKg).toBe(60);
    expect(store.meals).toHaveLength(3);
    expect(snapshot.weights[0].weightKg).toBe(60);
  });

  test('getMealsForDay filters by date and sorts by time', () => {
    const store = readOnlyNutritionStore(snapshot);
    expect(store.getMealsForDay('2026-11-09').map((m) => m.id)).toEqual(['c', 'a']);
    expect(store.currentWeightKg()).toBe(60);
    expect(store.targetFor('2026-11-09')).toBeNull();
  });
});
