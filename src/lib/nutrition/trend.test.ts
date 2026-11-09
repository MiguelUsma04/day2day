import { expect, test } from 'vitest';
import { emaTrend, weeklyDelta } from './trend';

test('first trend equals first weight, then smooths', () => {
  const t = emaTrend([
    { date: '2026-11-01', weightKg: 60 },
    { date: '2026-11-02', weightKg: 61 },
  ]);
  expect(t[0].trendKg).toBe(60);
  expect(t[1].trendKg).toBe(60.1);
});

test('returns empty for empty input', () => {
  expect(emaTrend([])).toEqual([]);
});

test('sorts by date before smoothing', () => {
  const t = emaTrend([
    { date: '2026-11-02', weightKg: 61 },
    { date: '2026-11-01', weightKg: 60 },
  ]);
  expect(t.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-02']);
  expect(t[0].trendKg).toBe(60);
  expect(t[1].trendKg).toBe(60.1);
});

test('weeklyDelta uses the point ~7 days back', () => {
  const days = Array.from({ length: 11 }, (_, i) => ({
    date: `2026-11-${String(i + 1).padStart(2, '0')}`,
    weightKg: i === 10 ? 58 : 59,
  }));
  const delta = weeklyDelta(emaTrend(days));
  expect(delta).toBeCloseTo(-0.1, 2);
});

test('weeklyDelta is null with less than 5 days of history', () => {
  const t = emaTrend([
    { date: '2026-11-01', weightKg: 60 },
    { date: '2026-11-04', weightKg: 59 },
  ]);
  expect(weeklyDelta(t)).toBeNull();
  expect(weeklyDelta([])).toBeNull();
});
