import type { WorkoutIntensity, WorkoutKind } from '../../types/nutrition';

export const MET_TABLE: Record<WorkoutKind, Record<WorkoutIntensity, number>> = {
  gym_strength: { light: 3.0, normal: 3.5, hard: 5.0 },
  treadmill: { light: 3.0, normal: 4.0, hard: 6.0 },
  calisthenics: { light: 3.5, normal: 5.0, hard: 7.5 },
  cardio: { light: 5.0, normal: 7.0, hard: 9.0 },
  football: { light: 5.0, normal: 7.0, hard: 9.5 },
  walk: { light: 2.8, normal: 3.5, hard: 4.3 },
  other: { light: 3.0, normal: 4.0, hard: 5.0 },
};

export const WORKOUT_LABELS: Record<WorkoutKind, string> = {
  gym_strength: 'Gym fuerza',
  treadmill: 'Caminadora',
  calisthenics: 'Calistenia',
  cardio: 'Cardio',
  football: 'Fútbol',
  walk: 'Caminata',
  other: 'Otro',
};

/** Net kcal burned (resting expenditure, 1 MET, is subtracted). */
export function workoutKcal(
  kind: WorkoutKind,
  intensity: WorkoutIntensity,
  minutes: number,
  weightKg: number,
): number {
  return Math.round((MET_TABLE[kind][intensity] - 1) * weightKg * (minutes / 60));
}
