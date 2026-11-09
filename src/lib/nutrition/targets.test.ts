import { expect, test } from 'vitest';
import type { BodyMeasurement, Profile } from '../../types/nutrition';
import { clampRate, dailyTarget, proteinTarget, rebalanceMacros } from './targets';

const base: Profile = {
  id: 'u', createdAt: 0, updatedAt: 0, sex: 'female', birthDate: '2002-03-01', heightCm: 150,
  goal: 'lose_fat', weeklyRateKg: -0.5, targetWeightKg: null, targetFatPct: null,
  activityFactor: 1.375, proteinGPerKg: null, sleepGoalMin: 480, workoutsPerWeek: 3,
};
const measured = (date: string): BodyMeasurement => ({
  id: 'm', createdAt: 0, updatedAt: 0, date, weightKg: 59, fatPct: 40.4, fatMassKg: null,
  leanMassKg: null, skeletalMuscleKg: null, visceralFatLevel: null, bmrMeasured: 1384,
  waistCm: null, source: 'bioimpedance',
});

test('Karen: measured BMR, lose fat', () => {
  const t = dailyTarget({ profile: base, weightKg: 59, latest: measured('2026-11-01'), today: '2026-11-09', workoutKcal: 0 });
  expect(t.method).toBe('measured');
  expect(t.kcal).toBe(1353);
  expect(t.proteinG).toBe(106);
  expect(t.fatG).toBe(47);
  // (1353 - 424 - 423) / 4 = 126.5 -> Math.round gives 127 (brief said 126)
  expect(t.carbsG).toBe(127);
  expect(t.floorApplied).toBe(false);
});

test('Miguel: mifflin, gain muscle, with workout', () => {
  const profile: Profile = { ...base, sex: 'male', birthDate: '2003-05-20', heightCm: 168, goal: 'gain_muscle', weeklyRateKg: 0.15 };
  const t = dailyTarget({ profile, weightKg: 65, latest: null, today: '2026-11-09', workoutKcal: 195 });
  expect(t.method).toBe('mifflin');
  expect(t.bmr).toBe(1590);
  expect(t.kcal).toBe(2546);
  expect(t.proteinG).toBe(130);
  expect(t.fatG).toBe(52);
  expect(t.carbsG).toBe(390);
});

test('calorie floor applies', () => {
  const profile: Profile = { ...base, activityFactor: 1.2, weeklyRateKg: -0.7 };
  const t = dailyTarget({ profile, weightKg: 45, latest: null, today: '2026-11-09', workoutKcal: 0 });
  expect(t.kcal).toBe(1200);
  expect(t.floorApplied).toBe(true);
});

test('clampRate', () => {
  expect(clampRate('lose_fat', -1.0)).toBe(-0.7);
  expect(clampRate('gain_muscle', 0.5)).toBe(0.3);
  expect(clampRate('maintain', -0.3)).toBe(0);
});

test('proteinTarget', () => {
  expect(proteinTarget({ goal: 'lose_fat', weightKg: 59, proteinGPerKg: 2.2 })).toBeCloseTo(129.8);
  expect(Math.round(proteinTarget({ goal: 'lose_fat', weightKg: 59, proteinGPerKg: 2.2 }))).toBe(130);
  expect(proteinTarget({ goal: 'maintain', weightKg: 60, proteinGPerKg: null })).toBeCloseTo(96);
});

test('rebalanceMacros keeps kcal fixed', () => {
  const t = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 67 };
  // (2000 - 680 - 603) / 4 = 179.25 -> 179 (brief said 180)
  expect(rebalanceMacros(t, { proteinG: 170 })).toEqual({ kcal: 2000, proteinG: 170, carbsG: 179, fatG: 67 });
  const c = rebalanceMacros(t, { carbsG: 300 });
  expect(c.kcal).toBe(2000);
  expect(c.fatG).toBe(Math.round((2000 - 600 - 1200) / 9));
  expect(c.fatG).toBeLessThan(67);
});

test('rebalanceMacros never goes negative', () => {
  const t = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 67 };
  const r = rebalanceMacros(t, { fatG: 200 });
  expect(r.carbsG).toBe(0);
  expect(r.fatG).toBe(Math.round((2000 - 600) / 9));
  expect(rebalanceMacros(t, { carbsG: 600 }).fatG).toBe(0);
});
