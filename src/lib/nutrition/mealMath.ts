import type { Macros, Meal, MealItem, MealSlot } from '../../types/nutrition';

const ZERO: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
const round1 = (x: number) => Math.round(x * 10) / 10;

function roundMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    proteinG: round1(m.proteinG),
    carbsG: round1(m.carbsG),
    fatG: round1(m.fatG),
  };
}

function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      proteinG: a.proteinG + m.proteinG,
      carbsG: a.carbsG + m.carbsG,
      fatG: a.fatG + m.fatG,
    }),
    ZERO,
  );
}

export function scaleMacros(per100: Macros, grams: number): Macros {
  const f = grams / 100;
  return roundMacros({
    kcal: per100.kcal * f,
    proteinG: per100.proteinG * f,
    carbsG: per100.carbsG * f,
    fatG: per100.fatG * f,
  });
}

export function itemMacros(item: MealItem): Macros {
  return item.food ? scaleMacros(item.food.per100, item.grams) : { ...ZERO };
}

export function mealTotals(meal: Meal): Macros {
  const sum = sumMacros(meal.items.map(itemMacros));
  const f = meal.eatenPct / 100;
  return roundMacros({
    kcal: sum.kcal * f,
    proteinG: sum.proteinG * f,
    carbsG: sum.carbsG * f,
    fatG: sum.fatG * f,
  });
}

export function mealKcalRange(meal: Meal): { min: number; max: number } {
  const f = meal.eatenPct / 100;
  let min = 0;
  let max = 0;
  for (const item of meal.items) {
    if (!item.food) continue;
    const { gramsMin, gramsMax } = item;
    const lo = gramsMin !== null && gramsMax !== null ? gramsMin : item.grams;
    const hi = gramsMin !== null && gramsMax !== null ? gramsMax : item.grams;
    min += (item.food.per100.kcal * lo) / 100;
    max += (item.food.per100.kcal * hi) / 100;
  }
  return { min: Math.round(min * f), max: Math.round(max * f) };
}

export function dayTotals(meals: Meal[]): Macros {
  return roundMacros(sumMacros(meals.map(mealTotals)));
}

export function slotForMinutes(m: number): MealSlot {
  if (m < 10 * 60 + 30) return 'breakfast';
  if (m < 15 * 60) return 'lunch';
  if (m < 18 * 60 + 30) return 'snack';
  return 'dinner';
}
