import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  applyChoice,
  dedupeCandidates,
  fallbackFoodRef,
  type FoodHit,
  questionForChosen,
  resolveChoices,
  rowToFoodRef,
} from './match.ts';
import { parseChooseFoods, type ReportedItem } from './schema.ts';

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
  assertEquals(out[0], { itemIndex: 0, foodId: null, estimate });
  assertEquals(out[1].foodId, 'a');
  assertEquals(out[2].foodId, 'b');
});

Deno.test('resolveChoices: null foodId without estimate falls back to the top candidate', () => {
  const out = resolveChoices([{ itemIndex: 0, foodId: null }], [[hit('a', 0.9), hit('b', 0.3)]]);
  assertEquals(out, [{ itemIndex: 0, foodId: 'a' }]);
});

Deno.test('resolveChoices drops an item with no estimate and no candidates, keeping the others', () => {
  const out = resolveChoices(
    [
      { itemIndex: 0, foodId: 'a' },
      { itemIndex: 1, foodId: null },
      { itemIndex: 2, foodId: 'made-up' },
    ],
    [[hit('a', 0.9)], [], [hit('c', 0.5)]],
  );
  assertEquals(out, [{ itemIndex: 0, foodId: 'a' }, { itemIndex: 2, foodId: 'c' }]);

  const second: ReportedItem = { ...reported, name: 'Arepa' };
  const third: ReportedItem = { ...reported, name: 'Fríjoles' };
  const items = applyChoice([reported, second, third], out, new Map(), [[hit('a', 0.9)], [], [hit('c', 0.5)]]);
  assertEquals(items.map((i) => i.name), ['Chicharrón', 'Fríjoles']);
  assertEquals(items.map((i) => i.food.id), ['a', 'c']);
});

Deno.test('resolveChoices: an out-of-range estimate (parsed as absent) falls back to the top candidate', () => {
  const raw = parseChooseFoods(
    { choices: [{ itemIndex: 0, foodId: null, estimate: { kcal: 2000, protein_g: 1, carbs_g: 1, fat_g: 1 } }] },
    1,
  );
  if ('error' in raw) throw new Error(raw.error);
  assertEquals(resolveChoices(raw, [[hit('a', 0.9)]]), [{ itemIndex: 0, foodId: 'a' }]);
  assertEquals(resolveChoices(raw, [[]]), []);
});

Deno.test('questionForChosen follows its item past dropped ones and is null for a dropped item', () => {
  const question = { itemIndex: 2, text: '¿Cuánto?', options: [{ label: 'a', gramsMultiplier: 1 }] };
  const choices = [{ itemIndex: 0, foodId: 'a' }, { itemIndex: 2, foodId: 'c' }];
  assertEquals(questionForChosen(question, choices)?.itemIndex, 1);
  assertEquals(questionForChosen({ ...question, itemIndex: 1 }, choices), null);
  assertEquals(questionForChosen(null, choices), null);
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
