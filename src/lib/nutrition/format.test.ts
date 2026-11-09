import { expect, test } from 'vitest';
import type { Meal, MealSlot } from '../../types/nutrition';
import { formatKcal, formatKg, medianSlotMinutes } from './format';

const meal = (slot: MealSlot, timeMinutes: number): Meal => ({
  id: `${slot}-${timeMinutes}`,
  createdAt: 0,
  updatedAt: 0,
  date: '2026-11-09',
  slot,
  timeMinutes,
  title: '',
  eatenPct: 100,
  items: [],
  source: 'manual',
  analysisId: null,
});

test('medianSlotMinutes: none in the slot -> null', () => {
  expect(medianSlotMinutes([], 'lunch')).toBeNull();
  expect(medianSlotMinutes([meal('dinner', 1200)], 'lunch')).toBeNull();
});

test('medianSlotMinutes: odd count takes the middle value', () => {
  const meals = [meal('lunch', 780), meal('lunch', 720), meal('lunch', 750), meal('dinner', 100)];
  expect(medianSlotMinutes(meals, 'lunch')).toBe(750);
});

test('medianSlotMinutes: even count averages the two middle values', () => {
  const meals = [meal('breakfast', 451), meal('breakfast', 420)];
  expect(medianSlotMinutes(meals, 'breakfast')).toBe(436);
});

test('formatKcal groups thousands es-CO style', () => {
  expect(formatKcal(1610)).toBe('1.610 kcal');
  expect(formatKcal(845.6)).toBe('846 kcal');
});

test('formatKg uses a decimal comma', () => {
  expect(formatKg(65.4)).toBe('65,4 kg');
  expect(formatKg(70)).toBe('70 kg');
});
