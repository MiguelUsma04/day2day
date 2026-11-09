/**
 * Anchoring reported items to food rows. Energy and macros always come from a
 * database row; the only exception is the labelled `ai` fallback, which the
 * choice call estimates when no candidate fits.
 */

import type { AnalyzedItem, Choice, Estimate, FoodRef, FoodSource, ReportedItem } from './schema.ts';

/** One row of `search_foods(q, n)`. Postgres numerics may arrive as strings. */
export type FoodHit = {
  id: string;
  source: string;
  name_es: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  verified: boolean;
  similarity: number;
};

export const MAX_CANDIDATES = 6;
const SOURCES: readonly FoodSource[] = ['tcac', 'usda', 'off', 'user', 'ai'];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Union of the hits for every search term: one per id, best similarity first. */
export function dedupeCandidates(hits: FoodHit[][]): FoodHit[] {
  const best = new Map<string, FoodHit>();
  for (const list of hits) {
    for (const h of list) {
      const prev = best.get(h.id);
      if (!prev || num(h.similarity) > num(prev.similarity)) best.set(h.id, h);
    }
  }
  return [...best.values()]
    .sort((a, b) => num(b.similarity) - num(a.similarity))
    .slice(0, MAX_CANDIDATES);
}

export function rowToFoodRef(row: FoodHit): FoodRef {
  const source = (SOURCES as readonly string[]).includes(row.source) ? (row.source as FoodSource) : 'user';
  return {
    id: row.id,
    source,
    name: row.name_es,
    per100: { kcal: num(row.kcal), proteinG: num(row.protein_g), carbsG: num(row.carbs_g), fatG: num(row.fat_g) },
    verified: row.verified === true,
  };
}

/** A food estimated by the model, always labelled as such and never verified. */
export function fallbackFoodRef(estimate: Estimate, name: string): FoodRef {
  return {
    id: 'ai:' + crypto.randomUUID(),
    source: 'ai',
    name,
    per100: {
      kcal: num(estimate.kcal),
      proteinG: num(estimate.protein_g),
      carbsG: num(estimate.carbs_g),
      fatG: num(estimate.fat_g),
    },
    verified: false,
  };
}

/**
 * Makes every choice point at one of the item's own candidates or at an
 * estimate. An id the model made up is replaced by its estimate when it gave
 * one, otherwise by the best candidate; with neither, the analysis fails.
 */
export function resolveChoices(choices: Choice[], candidates: FoodHit[][]): Choice[] | { error: string } {
  const out: Choice[] = [];
  for (const c of choices) {
    const own = candidates[c.itemIndex] ?? [];
    if (c.foodId !== null && own.some((h) => h.id === c.foodId)) {
      out.push({ itemIndex: c.itemIndex, foodId: c.foodId });
    } else if (c.estimate) {
      out.push({ itemIndex: c.itemIndex, foodId: null, estimate: c.estimate });
    } else if (own.length) {
      out.push({ itemIndex: c.itemIndex, foodId: own[0].id });
    } else {
      return { error: `Sin alimento para el ítem ${c.itemIndex}` };
    }
  }
  return out;
}

/**
 * Joins reported items with their chosen food. `created` holds the fallback
 * refs (already stored in `user_foods`) for the items whose choice was null.
 */
export function applyChoice(
  items: ReportedItem[],
  choices: Choice[],
  created: Map<number, FoodRef>,
  candidates: FoodHit[][],
): AnalyzedItem[] {
  const byIndex = new Map(choices.map((c) => [c.itemIndex, c]));
  return items.map((item, i) => {
    const choice = byIndex.get(i);
    let food: FoodRef | undefined;
    if (choice?.foodId) {
      const row = (candidates[i] ?? []).find((h) => h.id === choice.foodId);
      if (row) food = rowToFoodRef(row);
    } else {
      food = created.get(i);
    }
    if (!food) throw new Error(`No food for item ${i}`);
    const { searchTerms: _searchTerms, ...rest } = item;
    return { ...rest, food };
  });
}
