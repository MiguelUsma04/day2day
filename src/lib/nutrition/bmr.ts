import type { BodyMeasurement, Profile, Sex } from '../../types/nutrition';

const DAY_MS = 86_400_000;
const MEASURED_MAX_AGE_DAYS = 90;

function utc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole years completed on `onDate`. */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [oy, om, od] = onDate.split('-').map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

export function mifflinStJeor(a: { sex: Sex; weightKg: number; heightCm: number; ageYears: number }): number {
  const base = 10 * a.weightKg + 6.25 * a.heightCm - 5 * a.ageYears;
  return base + (a.sex === 'male' ? 5 : -161);
}

export function leanMassFrom(weightKg: number, fatPct: number): number {
  return weightKg * (1 - fatPct / 100);
}

export function katchMcArdle(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

export function pickBmr(a: {
  profile: Profile;
  weightKg: number;
  latest: BodyMeasurement | null;
  today: string;
}): { bmr: number; method: 'measured' | 'katch' | 'mifflin' } {
  const { profile, weightKg, latest, today } = a;
  if (latest?.bmrMeasured != null) {
    const days = Math.round((utc(today) - utc(latest.date)) / DAY_MS);
    if (days <= MEASURED_MAX_AGE_DAYS) return { bmr: latest.bmrMeasured, method: 'measured' };
  }
  if (latest?.fatPct != null) {
    return { bmr: katchMcArdle(leanMassFrom(weightKg, latest.fatPct)), method: 'katch' };
  }
  const bmr = mifflinStJeor({
    sex: profile.sex,
    weightKg,
    heightCm: profile.heightCm,
    ageYears: ageOn(profile.birthDate, today),
  });
  return { bmr, method: 'mifflin' };
}
