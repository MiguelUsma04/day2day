import { expect, test } from 'vitest';
import { parseDecimal, parseHHMM } from './parse';

test('parseDecimal', () => {
  expect(parseDecimal('65,4')).toBe(65.4);
  expect(parseDecimal('65.4')).toBe(65.4);
  expect(parseDecimal(' 65 ')).toBe(65);
  expect(parseDecimal('')).toBeNull();
  expect(parseDecimal('   ')).toBeNull();
  expect(parseDecimal('abc')).toBeNull();
  expect(parseDecimal('Infinity')).toBeNull();
});
test('parseHHMM', () => {
  expect(parseHHMM('06:45')).toBe(405);
  expect(parseHHMM('6:05')).toBe(365);
  expect(parseHHMM('23:59')).toBe(1439);
  expect(parseHHMM('24:00')).toBeNull();
  expect(parseHHMM('12:60')).toBeNull();
  expect(parseHHMM('1245')).toBeNull();
});
