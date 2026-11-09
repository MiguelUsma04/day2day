import { expect, test } from 'vitest';
import { MET_TABLE, WORKOUT_LABELS, workoutKcal } from './met';

test('workoutKcal uses (MET - 1) x kg x hours', () => {
  expect(workoutKcal('calisthenics', 'normal', 45, 65)).toBe(195);
  expect(workoutKcal('football', 'normal', 90, 65)).toBe(585);
  expect(workoutKcal('gym_strength', 'hard', 60, 59)).toBe(236);
});

test('MET table and labels', () => {
  expect(MET_TABLE.walk).toEqual({ light: 2.8, normal: 3.5, hard: 4.3 });
  expect(MET_TABLE.football.hard).toBe(9.5);
  expect(WORKOUT_LABELS.gym_strength).toBe('Gym fuerza');
  expect(WORKOUT_LABELS.football).toBe('Fútbol');
});
