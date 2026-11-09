import { describe, expect, it } from 'vitest';

import { mealTotals } from '../lib/nutrition/mealMath';
import type {
  BodyMeasurement,
  Meal,
  Profile,
  SleepLog,
  UserPortion,
  WeightEntry,
  Workout,
} from '../types/nutrition';
import {
  NUTRITION_KEYS,
  fromBodyMeasurementRow,
  fromMealRow,
  fromProfileRow,
  fromSleepLogRow,
  fromUserPortionRow,
  fromWeightRow,
  fromWorkoutRow,
  normalizeBodyMeasurement,
  normalizeMeal,
  normalizeProfile,
  normalizeSleepLog,
  normalizeUserPortion,
  normalizeWeight,
  normalizeWorkout,
  toBodyMeasurementRow,
  toMealRow,
  toProfileRow,
  toSleepLogRow,
  toUserPortionRow,
  toWeightRow,
  toWorkoutRow,
} from './nutritionStore';

const sync = { createdAt: 1000, updatedAt: 2000 };

const profile: Profile = {
  id: 'uid',
  ...sync,
  sex: 'male',
  birthDate: '1995-04-02',
  heightCm: 178,
  goal: 'lose_fat',
  weeklyRateKg: 0.4,
  targetWeightKg: 75,
  targetFatPct: 15,
  activityFactor: 1.55,
  proteinGPerKg: 2,
  sleepGoalMin: 480,
  workoutsPerWeek: 4,
};

const body: BodyMeasurement = {
  id: 'b1',
  ...sync,
  date: '2026-11-01',
  weightKg: 80.5,
  fatPct: 18,
  fatMassKg: 14.5,
  leanMassKg: 66,
  skeletalMuscleKg: 36,
  visceralFatLevel: 7,
  bmrMeasured: 1750,
  waistCm: 84,
  source: 'bioimpedance',
};

const weight: WeightEntry = { id: '2026-11-02', ...sync, date: '2026-11-02', weightKg: 80.1 };

const sleep: SleepLog = {
  id: '2026-11-02',
  ...sync,
  date: '2026-11-02',
  bedAtMinutes: 1410,
  wakeAtMinutes: 390,
  durationMin: 420,
};

const workout: Workout = {
  id: 'w1',
  ...sync,
  date: '2026-11-02',
  kind: 'gym_strength',
  minutes: 60,
  intensity: 'hard',
  met: 6,
  kcalNet: 350,
};

const meal: Meal = {
  id: 'm1',
  ...sync,
  date: '2026-11-02',
  slot: 'lunch',
  timeMinutes: 780,
  title: 'Arroz con pollo',
  eatenPct: 75,
  items: [
    {
      id: 'i1',
      food: {
        id: 'tcac:1',
        source: 'tcac',
        name: 'Arroz cocido',
        per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
        verified: true,
      },
      name: 'Arroz',
      grams: 200,
      gramsMin: 180,
      gramsMax: 220,
      weighed: true,
      confidence: 0.9,
      isHiddenFat: false,
      sortOrder: 0,
    },
    {
      id: 'i2',
      food: null,
      name: 'Aceite',
      grams: 10,
      gramsMin: null,
      gramsMax: null,
      weighed: false,
      confidence: null,
      isHiddenFat: true,
      sortOrder: 1,
    },
  ],
  source: 'photo',
  analysisId: 'an1',
};

const portion: UserPortion = { id: 'arroz', ...sync, foodKey: 'arroz', grams: 180, samples: 3 };

describe('storage keys', () => {
  it('uses day2day:<table>:v1', () => {
    expect(NUTRITION_KEYS.meals).toBe('day2day:meals:v1');
    expect(NUTRITION_KEYS.user_portions).toBe('day2day:user_portions:v1');
  });
});

describe('profile', () => {
  it('round-trips through a row', () => {
    const row = toProfileRow(profile, 'uid');
    expect(row.user_id).toBe('uid');
    expect(row.deleted_at).toBeNull();
    expect(fromProfileRow(row)).toEqual(profile);
  });
  it('fills defaults from a partial object', () => {
    const p = normalizeProfile({
      id: 'uid',
      sex: 'female',
      birthDate: '2000-01-01',
      heightCm: 165,
      activityFactor: 9,
      goal: 'nope',
      createdAt: 5,
    });
    expect(p).toMatchObject({
      sex: 'female',
      goal: 'maintain',
      activityFactor: 1.375,
      sleepGoalMin: 450,
      targetWeightKg: null,
      proteinGPerKg: null,
      createdAt: 5,
      updatedAt: 5,
    });
  });
  it('rejects an invalid sex', () => {
    expect(normalizeProfile({ id: 'uid', sex: 'x', birthDate: '2000-01-01', heightCm: 1 })).toBeNull();
  });
});

describe('body measurement', () => {
  it('round-trips through a row', () => {
    expect(fromBodyMeasurementRow(toBodyMeasurementRow(body, 'uid'))).toEqual(body);
  });
  it('fills defaults from a partial object', () => {
    const b = normalizeBodyMeasurement({ id: 'b2', date: '2026-11-03', weightKg: 'x', source: '??' });
    expect(b).toMatchObject({ weightKg: null, fatPct: null, waistCm: null, source: 'scale' });
    expect(normalizeBodyMeasurement({ id: 'b3' })).toBeNull();
  });
});

describe('weight', () => {
  it('round-trips through a row with id = date', () => {
    const row = toWeightRow(weight, 'uid');
    expect(row.id).toBe('2026-11-02');
    expect(fromWeightRow(row)).toEqual(weight);
  });
  it('normalizes a partial object', () => {
    expect(normalizeWeight({ date: '2026-11-04', weightKg: 79, createdAt: 7 })).toEqual({
      id: '2026-11-04',
      date: '2026-11-04',
      weightKg: 79,
      createdAt: 7,
      updatedAt: 7,
    });
    expect(normalizeWeight({ date: '2026-11-04' })).toBeNull();
  });
});

describe('sleep log', () => {
  it('round-trips through a row with id = date', () => {
    const row = toSleepLogRow(sleep, 'uid');
    expect(row.id).toBe('2026-11-02');
    expect(fromSleepLogRow(row)).toEqual(sleep);
  });
  it('normalizes a partial object', () => {
    expect(normalizeSleepLog({ date: '2026-11-05', durationMin: 400 })).toMatchObject({
      id: '2026-11-05',
      bedAtMinutes: null,
      wakeAtMinutes: null,
      durationMin: 400,
    });
  });
});

describe('workout', () => {
  it('round-trips through a row', () => {
    expect(fromWorkoutRow(toWorkoutRow(workout, 'uid'))).toEqual(workout);
  });
  it('defaults intensity and rejects an invalid kind', () => {
    const base = { id: 'w2', date: '2026-11-03', minutes: 30, met: 5, kcalNet: 100 };
    expect(normalizeWorkout({ ...base, kind: 'walk', intensity: 'insane' })?.intensity).toBe('normal');
    expect(normalizeWorkout({ ...base, kind: 'yoga' })).toBeNull();
  });
});

describe('meal', () => {
  it('round-trips through a row', () => {
    expect(fromMealRow(toMealRow(meal, 'uid'))).toEqual(meal);
  });
  it('fills row totals with mealTotals', () => {
    const row = toMealRow(meal, 'uid');
    const t = mealTotals(meal);
    expect(row.kcal).toBe(t.kcal);
    expect(row.protein_g).toBe(t.proteinG);
    expect(row.carbs_g).toBe(t.carbsG);
    expect(row.fat_g).toBe(t.fatG);
    expect(row.kcal).toBeGreaterThan(0);
  });
  it('fills defaults and cleans items', () => {
    const m = normalizeMeal({
      id: 'm2',
      date: '2026-11-03',
      slot: 'dinner',
      eatenPct: 60,
      items: [
        { id: 'a', name: 'Pan', grams: 50, food: { id: 'f', per100: 'bad' } },
        { id: 'b', grams: 10 },
        { id: 'c', name: 'Queso', grams: Infinity },
      ],
    });
    expect(m?.eatenPct).toBe(100);
    expect(m?.source).toBe('manual');
    expect(m?.items).toHaveLength(1);
    expect(m?.items[0]).toMatchObject({ name: 'Pan', grams: 50, food: null, weighed: false });
    expect(normalizeMeal({ id: 'm3', date: '2026-11-03', slot: 'dinner', items: 'x' })?.items).toEqual([]);
  });
  it('rejects a missing date or an invalid slot', () => {
    expect(normalizeMeal({ id: 'm4', slot: 'lunch' })).toBeNull();
    expect(normalizeMeal({ id: 'm5', date: '2026-11-03', slot: 'brunch' })).toBeNull();
  });
});

describe('user portion', () => {
  it('round-trips through a row with id = foodKey', () => {
    const row = toUserPortionRow(portion, 'uid');
    expect(row.id).toBe('arroz');
    expect(fromUserPortionRow(row)).toEqual(portion);
  });
  it('normalizes a partial object', () => {
    expect(normalizeUserPortion({ foodKey: 'pan', grams: 40 })).toMatchObject({
      id: 'pan',
      foodKey: 'pan',
      grams: 40,
      samples: 1,
    });
    expect(normalizeUserPortion({ grams: 40 })).toBeNull();
  });
});
