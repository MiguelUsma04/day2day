import { describe, expect, it } from 'vitest';
import { analyzeMeal, toFoodRef, toMealItems } from './api';
import type { AnalyzeRequest, AnalyzeResponse, AnalyzedItem, FoodHit } from '../../types/nutrition';

const food = {
  id: 'f1',
  source: 'tcac' as const,
  name: 'Arroz',
  per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  verified: true,
};
const item = (name: string, isHiddenFat = false): AnalyzedItem => ({
  name, nameEn: name, cooking: null, grams: 100, gramsMin: 80, gramsMax: 120,
  confidence: 0.9, isHiddenFat, food,
});
const req: AnalyzeRequest = {
  slot: 'lunch', date: '2026-11-09', note: 'arroz',
  hints: { portions: [], recentFoods: [] },
};
const res: AnalyzeResponse = { analysisId: 'a1', items: [item('a'), item('b', true)], question: null, model: 'm' };
const json = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

describe('toMealItems', () => {
  it('assigns sortOrder, weighed false and keeps hidden fat and food', () => {
    const items = toMealItems(res);
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(items.every((i) => i.weighed === false)).toBe(true);
    expect(items[1].isHiddenFat).toBe(true);
    expect(items[0].food).toBe(food);
    expect(items[0].id).not.toBe(items[1].id);
  });
});

describe('analyzeMeal', () => {
  const getToken = async () => 'tok';
  it('maps 429 to the daily limit message', async () => {
    await expect(analyzeMeal(req, { fetchImpl: json(429, {}), getToken })).rejects.toThrow(
      'Llegaste al límite diario de 40 análisis',
    );
  });
  it('resolves with the parsed body on 200', async () => {
    await expect(analyzeMeal(req, { fetchImpl: json(200, res), getToken })).resolves.toEqual(res);
  });
  it('throws the server error message on other failures', async () => {
    await expect(analyzeMeal(req, { fetchImpl: json(500, { error: 'boom' }), getToken })).rejects.toThrow('boom');
  });
  it('requires a session token', async () => {
    await expect(
      analyzeMeal(req, { fetchImpl: json(200, res), getToken: async () => null }),
    ).rejects.toThrow('Inicia sesión para analizar comidas');
  });
  it('reports network failures', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('x');
    }) as typeof fetch;
    await expect(analyzeMeal(req, { fetchImpl, getToken })).rejects.toThrow('Sin conexión con el servidor');
  });
});

describe('toFoodRef', () => {
  it('maps hit fields', () => {
    const hit: FoodHit = {
      id: 'x', source: 'usda', name_es: 'Pollo', kcal: 165, protein_g: 31, carbs_g: 0,
      fat_g: 3.6, verified: false, similarity: 0.8,
    };
    expect(toFoodRef(hit)).toEqual({
      id: 'x', source: 'usda', name: 'Pollo', verified: false,
      per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
    });
  });
});
