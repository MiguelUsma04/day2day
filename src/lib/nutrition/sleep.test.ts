import { expect, test } from 'vitest';
import { formatHours, sleepDuration } from './sleep';

test('sleepDuration crosses midnight', () => {
  expect(sleepDuration(23 * 60 + 30, 6 * 60 + 45)).toBe(435);
});
test('sleepDuration same day', () => {
  expect(sleepDuration(60, 540)).toBe(480);
});
test('formatHours', () => {
  expect(formatHours(430)).toBe('7 h 10');
  expect(formatHours(480)).toBe('8 h 00');
});
