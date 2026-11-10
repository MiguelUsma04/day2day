import type { Macros } from '../../types/nutrition';

/**
 * Closes the day: what to eat to land on the target without going over, or
 * how long to move when the target was passed. Pure arithmetic over the
 * day's totals; no model involved.
 */

type ProteinFood = { name: string; kcal100: number; protein100: number; unitG?: number; unit?: string; units?: string };

/** Per 100 g, TCAC/USDA. Ordered by preference when several fit. */
const PROTEIN_FOODS: ProteinFood[] = [
  { name: 'pechuga de pollo a la plancha', kcal100: 165, protein100: 31 },
  { name: 'huevo entero', kcal100: 143, protein100: 12.6, unitG: 50, unit: 'huevo', units: 'huevos' },
  { name: 'atún en agua', kcal100: 116, protein100: 25.5 },
  { name: 'pescado blanco a la plancha', kcal100: 128, protein100: 26 },
  { name: 'yogur griego natural', kcal100: 59, protein100: 10 },
  { name: 'carne de res magra', kcal100: 180, protein100: 26 },
  { name: 'clara de huevo', kcal100: 52, protein100: 10.9, unitG: 33, unit: 'clara', units: 'claras' },
];

type LightFood = { name: string; kcal100: number };
const LIGHT_FOODS: LightFood[] = [
  { name: 'ensalada de verduras', kcal100: 25 },
  { name: 'manzana', kcal100: 52 },
  { name: 'papaya', kcal100: 43 },
];

/** Gross MET (resting 1 MET is subtracted when converting to minutes, like workouts). */
const BURN_OPTIONS = [
  { name: 'saltar la cuerda', met: 11 },
  { name: 'trotar', met: 7 },
  { name: 'bicicleta', met: 6.8 },
  { name: 'caminar rápido', met: 4.3 },
] as const;

/** Under this the day counts as done. */
const DONE_KCAL = 80;
/** Over the target by less than this is noise, not an excess. */
const OVER_KCAL = 50;
const PROTEIN_DONE_G = 5;
/** Suggestions after this hour are framed as optional. */
const LATE_MINUTES = 20 * 60 + 30;

export type EatOption = { label: string; kcal: number; proteinG: number; coversProtein: boolean };
export type BurnOption = { label: string; minutes: number };

export type CoachAdvice =
  | { kind: 'eat'; remainingKcal: number; remainingProteinG: number; options: EatOption[]; note: string | null }
  | { kind: 'done'; remainingKcal: number; remainingProteinG: number }
  | { kind: 'burn'; excessKcal: number; options: BurnOption[] }
  | { kind: 'none' };

function round10(g: number): number {
  return Math.max(10, Math.round(g / 10) * 10);
}

function foodLabel(f: ProteinFood | LightFood, grams: number): string {
  const pf = f as ProteinFood;
  if (pf.unitG && pf.unit && pf.units) {
    const n = Math.max(1, Math.round(grams / pf.unitG));
    return `${n} ${n === 1 ? pf.unit : pf.units} (${n * pf.unitG} g)`;
  }
  return `${grams} g de ${f.name}`;
}

/** A single serving never goes past this: nobody eats 12 egg whites. */
const MAX_SERVING_G = 250;
const MAX_UNITS = 4;

function proteinOptions(remainingKcal: number, remainingProteinG: number): EatOption[] {
  const out: (EatOption & { rank: number })[] = [];
  PROTEIN_FOODS.forEach((f, rank) => {
    const byProtein = (remainingProteinG / f.protein100) * 100;
    const byKcal = (remainingKcal / f.kcal100) * 100;
    let grams = Math.min(MAX_SERVING_G, round10(Math.min(byProtein, byKcal)));
    if (f.unitG) grams = Math.min(MAX_UNITS * f.unitG, Math.max(f.unitG, Math.round(grams / f.unitG) * f.unitG));
    const kcal = Math.round((grams * f.kcal100) / 100);
    if (kcal > remainingKcal + 25) return;
    const proteinG = Math.round((grams * f.protein100) / 100);
    if (proteinG < Math.min(10, remainingProteinG)) return;
    out.push({ label: foodLabel(f, grams), kcal, proteinG, coversProtein: proteinG >= remainingProteinG - 3, rank });
  });
  // Options that close the protein gap first, then catalog order; keep three.
  return out
    .sort((a, b) => Number(b.coversProtein) - Number(a.coversProtein) || a.rank - b.rank)
    .slice(0, 3)
    .map(({ rank: _r, ...o }) => o);
}

function lightOptions(remainingKcal: number): EatOption[] {
  return LIGHT_FOODS.map((f) => {
    const grams = Math.min(300, round10((remainingKcal / f.kcal100) * 100));
    const kcal = Math.round((grams * f.kcal100) / 100);
    return { label: foodLabel(f, grams), kcal, proteinG: 0, coversProtein: true };
  }).filter((o) => o.kcal > 0);
}

/** Minutes of an activity that burn `kcal` net, rounded up to 5. */
export function minutesToBurn(kcal: number, met: number, weightKg: number): number {
  const perMinute = ((met - 1) * weightKg) / 60;
  return Math.max(5, Math.ceil(kcal / perMinute / 5) * 5);
}

export function coachAdvice(a: {
  eaten: Macros;
  target: { kcal: number; proteinG: number } | null;
  weightKg: number;
  /** Minutes since midnight, local time; null when the day is not today. */
  nowMinutes: number | null;
  mealsLogged: number;
}): CoachAdvice {
  const { eaten, target } = a;
  if (!target || a.mealsLogged === 0) return { kind: 'none' };
  const remainingKcal = Math.round(target.kcal - eaten.kcal);
  const remainingProteinG = Math.round(target.proteinG - eaten.proteinG);

  if (remainingKcal < -OVER_KCAL) {
    const excessKcal = -remainingKcal;
    return {
      kind: 'burn',
      excessKcal,
      options: BURN_OPTIONS.map((b) => ({ label: b.name, minutes: minutesToBurn(excessKcal, b.met, a.weightKg) })),
    };
  }
  if (remainingKcal < DONE_KCAL) return { kind: 'done', remainingKcal, remainingProteinG };

  const late = a.nowMinutes !== null && a.nowMinutes >= LATE_MINUTES;
  if (remainingProteinG <= PROTEIN_DONE_G) {
    return {
      kind: 'eat',
      remainingKcal,
      remainingProteinG: Math.max(0, remainingProteinG),
      options: lightOptions(remainingKcal),
      note: late
        ? 'Proteína cumplida. Si no tienes hambre, no comas por cumplir la meta.'
        : 'Proteína cumplida. Lo que falta puede ser fruta o verdura, o nada si no hay hambre.',
    };
  }
  const options = proteinOptions(remainingKcal, remainingProteinG);
  const bestKcal = options[0]?.kcal ?? 0;
  const room = remainingKcal - bestKcal;
  return {
    kind: 'eat',
    remainingKcal,
    remainingProteinG,
    options,
    note: late
      ? 'Ya es tarde: algo liviano con proteína basta, o déjalo si no hay hambre.'
      : room >= 120
        ? 'Acompáñalo con ensalada o verduras al gusto; sin arroz, jugo ni fritos.'
        : 'Solo eso, sin acompañantes: el margen de kcal es corto.',
  };
}
