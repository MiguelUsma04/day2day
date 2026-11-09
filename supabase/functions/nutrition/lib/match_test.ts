import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  applyChoice,
  dedupeCandidates,
  fallbackFoodRef,
  type FoodHit,
  resolveChoices,
  rowToFoodRef,
} from './match.ts';
import type { ReportedItem } from './schema.ts';

function hit(id: string, similarity: number): FoodHit {
  return {
    id,
    source: 'tcac',
    name_es: id,
    kcal: 100,
    protein_g: 1,
    carbs_g: 2,
    fat_g: 3,
    verified: true,
    similarity,
  };
}

Deno.test('dedupeCandidates keeps the highest similarity per id and caps at 6', () => {
  const out = dedupeCandidates([
    [hit('a', 0.2), hit('b', 0.5), hit('c', 0.3), hit('d', 0.1)],
    [hit('a', 0.9), hit('e', 0.4), hit('f', 0.35), hit('g', 0.05)],
  ]);
  assertEquals(out.length, 6);
  assertEquals(out[0].id, 'a');
  assertEquals(out[0].similarity, 0.9);
  assertEquals(out.map((h) => h.id), ['a', 'b', 'e', 'f', 'c', 'd']);
});

const reported: ReportedItem = {
  name: 'Chicharrón',
  nameEn: 'Pork rind',
  cooking: 'frito',
  grams: 60,
  gramsMin: 40,
  gramsMax: 80,
  confidence: 0.6,
  isHiddenFat: false,
  searchTerms: ['chicharrón'],
};

Deno.test('applyChoice uses the matched row', () => {
  const out = applyChoice([reported], [{ itemIndex: 0, foodId: 'tcac:9' }], new Map(), [[hit('tcac:9', 0.8)]]);
  assertEquals(out[0].food.id, 'tcac:9');
  assertEquals(out[0].food.per100, { kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 });
  assertEquals(out[0].grams, 60);
  assertEquals(out[0].name, 'Chicharrón');
});

Deno.test('applyChoice with a null foodId uses fallbackFoodRef', () => {
  const estimate = { kcal: 500, protein_g: 30, carbs_g: 0, fat_g: 42 };
  const created = new Map([[0, fallbackFoodRef(estimate, 'Chicharrón')]]);
  const out = applyChoice([reported], [{ itemIndex: 0, foodId: null, estimate }], created, [[]]);
  assert(out[0].food.source === 'ai' && out[0].food.verified === false);
  assert(out[0].food.id.startsWith('ai:'));
  assertEquals(out[0].food.per100.kcal, 500);
});

Deno.test('resolveChoices replaces an unknown id with the estimate, else the best candidate', () => {
  const estimate = { kcal: 200, protein_g: 1, carbs_g: 1, fat_g: 1 };
  const out = resolveChoices(
    [
      { itemIndex: 0, foodId: 'made-up', estimate },
      { itemIndex: 1, foodId: 'made-up' },
      { itemIndex: 2, foodId: 'b' },
    ],
    [[hit('a', 0.9)], [hit('a', 0.9), hit('b', 0.3)], [hit('a', 0.9), hit('b', 0.3)]],
  );
  if ('error' in out) throw new Error(out.error);
  assertEquals(out[0], { itemIndex: 0, foodId: null, estimate });
  assertEquals(out[1].foodId, 'a');
  assertEquals(out[2].foodId, 'b');
});

Deno.test('resolveChoices fails when nothing usable is left', () => {
  const out = resolveChoices([{ itemIndex: 0, foodId: 'made-up' }], [[]]);
  assert('error' in out);
});

Deno.test('rowToFoodRef maps snake_case macros to per100', () => {
  const ref = rowToFoodRef({ ...hit('usda:1', 1), kcal: '120' as unknown as number });
  assertEquals(ref, {
    id: 'usda:1',
    source: 'tcac',
    name: 'usda:1',
    per100: { kcal: 120, proteinG: 1, carbsG: 2, fatG: 3 },
    verified: true,
  });
});
