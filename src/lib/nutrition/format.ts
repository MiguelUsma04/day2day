import type { Meal, MealSlot } from '../../types/nutrition';

/** 65.4 -> "65,4 kg" (es-CO, one decimal at most). */
export function formatKg(kg: number): string {
  return `${kg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg`;
}

/** Rounded integer with es-CO grouping. Grouping is forced so 4-digit values also get the dot. */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('es-CO', {
    useGrouping: 'always',
  } as unknown as Intl.NumberFormatOptions);
}

/** 1610 -> "1.610 kcal". */
export function formatKcal(n: number): string {
  return `${formatNumber(n)} kcal`;
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  snack: 'Snack',
  dinner: 'Cena',
};

export function slotLabel(slot: MealSlot): string {
  return SLOT_LABELS[slot];
}

const DEFAULT_SLOT_MINUTES: Record<MealSlot, number> = {
  breakfast: 7 * 60,
  lunch: 12 * 60 + 30,
  snack: 16 * 60,
  dinner: 19 * 60 + 30,
};

export function defaultSlotMinutes(slot: MealSlot): number {
  return DEFAULT_SLOT_MINUTES[slot];
}

/** Median `timeMinutes` of the meals logged in `slot`, rounded to the minute; null when there are none. */
export function medianSlotMinutes(meals: Meal[], slot: MealSlot): number | null {
  const times = meals
    .filter((m) => m.slot === slot)
    .map((m) => m.timeMinutes)
    .sort((a, b) => a - b);
  if (times.length === 0) return null;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 === 1 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
}
