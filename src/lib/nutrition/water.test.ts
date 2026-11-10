import { expect, test } from 'vitest';

import { formatLiters, waterGoalMl } from './water';

test('waterGoalMl is 35 ml/kg rounded to 50 ml with a 1,5 L floor', () => {
  expect(waterGoalMl(59)).toBe(2050);
  expect(waterGoalMl(65)).toBe(2300);
  expect(waterGoalMl(30)).toBe(1500);
});

test('formatLiters uses the comma and drops trailing zeros', () => {
  expect(formatLiters(1250)).toBe('1,25 L');
  expect(formatLiters(500)).toBe('0,5 L');
  expect(formatLiters(0)).toBe('0 L');
  expect(formatLiters(2000)).toBe('2 L');
});
