import { expect, test } from 'vitest';

import type { BodyMeasurement, Profile, UserPortion, WeightEntry } from '../types/nutrition';
import {
  addWorkoutIn,
  clearWeightIn,
  computeTarget,
  rememberPortionIn,
  setWeightIn,
  upsertProfileIn,
} from './nutritionReducers';

const weight = (date: string, weightKg: number): WeightEntry => ({
  id: date,
  date,
  weightKg,
  createdAt: 1,
  updatedAt: 1,
});

test('setWeightIn replaces the same date and keeps the others', () => {
  const list = [weight('2026-11-08', 60), weight('2026-11-09', 59.5)];
  const next = setWeightIn(list, '2026-11-09', 59.1, 100);
  expect(next).toHaveLength(2);
  expect(next[0]).toBe(list[0]);
  expect(next.find((w) => w.id === '2026-11-09')).toMatchObject({ weightKg: 59.1, createdAt: 1 });
});

test('setWeightIn adds a new date and returns the same list when nothing changes', () => {
  const list = [weight('2026-11-08', 60)];
  const added = setWeightIn(list, '2026-11-09', 59, 100);
  expect(added).toHaveLength(2);
  expect(added[1]).toMatchObject({ id: '2026-11-09', date: '2026-11-09', weightKg: 59, createdAt: 100 });
  expect(setWeightIn(list, '2026-11-08', 60, 100)).toBe(list);
});

test('clearWeightIn on a missing date returns the same reference', () => {
  const list = [weight('2026-11-08', 60)];
  expect(clearWeightIn(list, '2026-11-01')).toBe(list);
  expect(clearWeightIn(list, '2026-11-08')).toEqual([]);
});

test('rememberPortionIn averages the grams', () => {
  const first = rememberPortionIn([], 'tcac:arroz', 180, 10);
  expect(first).toEqual<UserPortion[]>([
    { id: 'tcac:arroz', foodKey: 'tcac:arroz', grams: 180, samples: 1, createdAt: 10, updatedAt: 10 },
  ]);
  const second = rememberPortionIn(first, 'tcac:arroz', 200, 20);
  expect(second[0]).toMatchObject({ grams: 190, samples: 2, createdAt: 10 });
});

test('addWorkoutIn computes met and kcalNet', () => {
  const next = addWorkoutIn(
    [],
    { date: '2026-11-09', kind: 'calisthenics', intensity: 'normal', minutes: 45 },
    65,
    'w1',
    50,
  );
  expect(next).toEqual([
    {
      id: 'w1',
      date: '2026-11-09',
      kind: 'calisthenics',
      intensity: 'normal',
      minutes: 45,
      met: 5,
      kcalNet: 195,
      createdAt: 50,
      updatedAt: 50,
    },
  ]);
});

const karenFields: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'> = {
  sex: 'female',
  birthDate: '2002-03-01',
  heightCm: 150,
  goal: 'lose_fat',
  weeklyRateKg: -0.5,
  targetWeightKg: null,
  targetFatPct: null,
  activityFactor: 1.375,
  proteinGPerKg: null,
  sleepGoalMin: 480,
  workoutsPerWeek: 3,
};

test('upsertProfileIn clamps the weekly rate', () => {
  const [p] = upsertProfileIn([], 'u', { ...karenFields, weeklyRateKg: -2 }, 5);
  expect(p).toMatchObject({ id: 'u', weeklyRateKg: -0.7, createdAt: 5 });
});

test('computeTarget: Karen with a measured BMR', () => {
  const measurement: BodyMeasurement = {
    id: 'm',
    createdAt: 0,
    updatedAt: 0,
    date: '2026-11-01',
    weightKg: 59,
    fatPct: 40.4,
    fatMassKg: null,
    leanMassKg: null,
    skeletalMuscleKg: null,
    visceralFatLevel: null,
    bmrMeasured: 1384,
    waistCm: null,
    source: 'bioimpedance',
  };
  const profile: Profile = { id: 'u', createdAt: 0, updatedAt: 0, ...karenFields };
  const t = computeTarget({
    profile,
    weights: [],
    measurements: [measurement],
    workouts: [],
    date: '2026-11-09',
  });
  expect(t).not.toBeNull();
  expect(t!.kcal).toBe(1353);
  expect(t!.kcal).toBeGreaterThan(1200);
  expect(t!.floorApplied).toBe(false);
});

test('computeTarget is null without a profile or a weight', () => {
  const profile: Profile = { id: 'u', createdAt: 0, updatedAt: 0, ...karenFields };
  const args = { weights: [], measurements: [], workouts: [], date: '2026-11-09' };
  expect(computeTarget({ ...args, profile: null })).toBeNull();
  expect(computeTarget({ ...args, profile })).toBeNull();
});
