/** Daily water goal: 35 ml per kg of body weight, rounded to 50 ml, never under 1,5 L. */
export const WATER_ML_PER_KG = 35;

export function waterGoalMl(weightKg: number): number {
  const raw = Math.round((WATER_ML_PER_KG * weightKg) / 50) * 50;
  return Math.max(1500, raw);
}

/** 1250 -> "1,25 L"; 500 -> "0,5 L"; 0 -> "0 L". */
export function formatLiters(ml: number): string {
  return `${(ml / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} L`;
}
