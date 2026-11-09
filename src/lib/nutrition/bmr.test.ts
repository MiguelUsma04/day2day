import { expect, test } from 'vitest';
import type { BodyMeasurement, Profile } from '../../types/nutrition';
import { ageOn, katchMcArdle, leanMassFrom, mifflinStJeor, pickBmr } from './bmr';

const profile: Profile = {
  id: 'u', createdAt: 0, updatedAt: 0, sex: 'female', birthDate: '2002-03-01', heightCm: 150,
  goal: 'lose_fat', weeklyRateKg: -0.5, targetWeightKg: null, targetFatPct: null,
  activityFactor: 1.375, proteinGPerKg: null, sleepGoalMin: 480, workoutsPerWeek: 3,
};
const meas = (date: string, o: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
  id: 'm', createdAt: 0, updatedAt: 0, date, weightKg: 59, fatPct: null, fatMassKg: null,
  leanMassKg: null, skeletalMuscleKg: null, visceralFatLevel: null, bmrMeasured: null,
  waistCm: null, source: 'bioimpedance', ...o,
});

test('mifflinStJeor', () => {
  expect(mifflinStJeor({ sex: 'female', weightKg: 59, heightCm: 150, ageYears: 24 })).toBeCloseTo(1246.5);
  expect(mifflinStJeor({ sex: 'male', weightKg: 65, heightCm: 168, ageYears: 23 })).toBe(1590);
});

test('leanMassFrom and katchMcArdle', () => {
  expect(leanMassFrom(59, 40.4)).toBeCloseTo(35.16, 1);
  expect(katchMcArdle(35.164)).toBeCloseTo(1129.5, 0);
});

test('ageOn counts whole years', () => {
  expect(ageOn('2003-05-20', '2026-11-09')).toBe(23);
  expect(ageOn('2003-11-09', '2026-11-09')).toBe(23);
  expect(ageOn('2003-11-10', '2026-11-09')).toBe(22);
});

test('pickBmr prefers a recent measured BMR', () => {
  const latest = meas('2026-10-30', { bmrMeasured: 1384, fatPct: 40.4 });
  expect(pickBmr({ profile, weightKg: 59, latest, today: '2026-11-09' })).toEqual({ bmr: 1384, method: 'measured' });
});

test('pickBmr falls back to katch when the measurement is 91 days old', () => {
  const latest = meas('2026-08-10', { bmrMeasured: 1384, fatPct: 40.4 });
  const r = pickBmr({ profile, weightKg: 59, latest, today: '2026-11-09' });
  expect(r.method).toBe('katch');
  expect(r.bmr).toBeCloseTo(370 + 21.6 * leanMassFrom(59, 40.4), 5);
});

test('pickBmr still measured at exactly 90 days', () => {
  const latest = meas('2026-08-11', { bmrMeasured: 1384 });
  expect(pickBmr({ profile, weightKg: 59, latest, today: '2026-11-09' }).method).toBe('measured');
});

test('pickBmr falls back to mifflin without measurements', () => {
  const r = pickBmr({ profile, weightKg: 59, latest: null, today: '2026-11-09' });
  expect(r.method).toBe('mifflin');
  expect(r.bmr).toBeCloseTo(10 * 59 + 6.25 * 150 - 5 * 24 - 161, 5);
});
