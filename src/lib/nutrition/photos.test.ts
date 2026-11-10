import { expect, test } from 'vitest';

import { expiredPhotoNames, mealPhotoPath, photoOwner } from './photos';

test('mealPhotoPath puts the photo under the owner folder', () => {
  expect(mealPhotoPath('u1', 'm1', 'webp')).toBe('u1/m1.webp');
  expect(photoOwner('u1/m1.webp')).toBe('u1');
  expect(photoOwner('m1.webp')).toBeNull();
});

test('expiredPhotoNames keeps only photos older than the retention window', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const day = 86_400_000;
  const objects = [
    { name: 'old.webp', created_at: new Date(now - 181 * day).toISOString() },
    { name: 'edge.webp', created_at: new Date(now - 179 * day).toISOString() },
    { name: 'new.webp', created_at: new Date(now - day).toISOString() },
    { name: 'unknown.webp', created_at: null },
  ];
  expect(expiredPhotoNames(objects, now)).toEqual(['old.webp']);
  expect(expiredPhotoNames(objects, now, 30)).toEqual(['old.webp', 'edge.webp']);
});
