import { expect, test } from 'vitest';
import type { Meal, MealItem } from '../../types/nutrition';
import { dayTotals, itemMacros, mealKcalRange, mealTotals, scaleMacros, slotForMinutes } from './mealMath';

const rice = { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 };
const item = (o: Partial<MealItem> = {}): MealItem => ({
  id: 'i', food: { id: 'f', source: 'tcac', name: 'Arroz', per100: rice, verified: true },
  name: 'Arroz', grams: 100, gramsMin: null, gramsMax: null, weighed: true, confidence: null,
  isHiddenFat: false, sortOrder: 0, ...o,
});
const meal = (items: MealItem[], eatenPct: Meal['eatenPct'] = 100): Meal => ({
  id: 'm', createdAt: 0, updatedAt: 0, date: '2026-11-09', slot: 'lunch', timeMinutes: 760,
  title: 'x', eatenPct, items, source: 'manual', analysisId: null,
});

test('scaleMacros rounds kcal to int and grams to 1 decimal', () => {
  expect(scaleMacros(rice, 180)).toEqual({ kcal: 234, proteinG: 4.9, carbsG: 50.4, fatG: 0.5 });
});
test('itemMacros: null food gives zeros', () => {
  expect(itemMacros(item({ food: null }))).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  expect(itemMacros(item({ grams: 200 }))).toEqual({ kcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6 });
});
test('mealTotals sums items and applies eatenPct', () => {
  const items = [item({ grams: 200 }), item({ grams: 100 })];
  expect(mealTotals(meal(items))).toEqual({ kcal: 390, proteinG: 8.1, carbsG: 84, fatG: 0.9 });
  expect(mealTotals(meal(items, 50))).toEqual({ kcal: 195, proteinG: 4.1, carbsG: 42, fatG: 0.5 });
});
test('mealKcalRange uses min/max when both set, else grams', () => {
  expect(mealKcalRange(meal([item({ grams: 100, gramsMin: 80, gramsMax: 150 })]))).toEqual({ min: 104, max: 195 });
  expect(mealKcalRange(meal([item({ grams: 100 })]))).toEqual({ min: 130, max: 130 });
  expect(mealKcalRange(meal([item({ grams: 100, gramsMin: 80, gramsMax: 150 })], 50))).toEqual({ min: 52, max: 98 });
});
test('dayTotals sums meals', () => {
  const a = meal([item({ grams: 100 })]);
  const b = meal([item({ grams: 100 })], 50);
  expect(dayTotals([a, b])).toEqual({ kcal: 195, proteinG: 4.1, carbsG: 42, fatG: 0.5 });
  expect(dayTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
});
test('slotForMinutes boundaries', () => {
  expect(slotForMinutes(12 * 60 + 40)).toBe('lunch');
  expect(slotForMinutes(10 * 60 + 29)).toBe('breakfast');
  expect(slotForMinutes(10 * 60 + 30)).toBe('lunch');
  expect(slotForMinutes(14 * 60 + 59)).toBe('lunch');
  expect(slotForMinutes(15 * 60)).toBe('snack');
  expect(slotForMinutes(18 * 60 + 30)).toBe('dinner');
});
