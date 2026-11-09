import { assert, assertEquals } from 'jsr:@std/assert@1';
import { parseAnalyzeRequest, parseChooseFoods, parseReportMeal } from './schema.ts';

const base = { slot: 'lunch', date: '2026-11-10', hints: { portions: [], recentFoods: [] } };

function isError(r: unknown): r is { error: string } {
  return typeof r === 'object' && r !== null && 'error' in r;
}

Deno.test('parseAnalyzeRequest rejects a request with neither image nor note', () => {
  assert(isError(parseAnalyzeRequest({ ...base })));
  assert(isError(parseAnalyzeRequest({ ...base, note: 'ok' })));
});

Deno.test('parseAnalyzeRequest rejects an invalid slot', () => {
  assert(isError(parseAnalyzeRequest({ ...base, slot: 'brunch', note: 'arroz con pollo' })));
});

Deno.test('parseAnalyzeRequest rejects an invalid date', () => {
  assert(isError(parseAnalyzeRequest({ ...base, date: '10/11/2026', note: 'arroz con pollo' })));
});

Deno.test('parseAnalyzeRequest accepts a note alone', () => {
  const r = parseAnalyzeRequest({ ...base, note: 'arroz con pollo frito' });
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.note, 'arroz con pollo frito');
  assertEquals(r.image, undefined);
  assertEquals(r.slot, 'lunch');
});

Deno.test('parseAnalyzeRequest accepts an image and defaults missing hints', () => {
  const r = parseAnalyzeRequest({
    slot: 'dinner',
    date: '2026-11-10',
    image: { base64: 'AAAA', mediaType: 'image/png' },
  });
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.image?.mediaType, 'image/png');
  assertEquals(r.hints, { portions: [], recentFoods: [] });
});

Deno.test('parseAnalyzeRequest rejects base64 over 2.5 MB', () => {
  const big = 'A'.repeat(3_500_001);
  assert(isError(parseAnalyzeRequest({ ...base, image: { base64: big, mediaType: 'image/jpeg' } })));
});

Deno.test('parseAnalyzeRequest rejects an unsupported media type', () => {
  assert(isError(parseAnalyzeRequest({ ...base, image: { base64: 'AAAA', mediaType: 'image/gif' } })));
});

Deno.test('parseAnalyzeRequest rejects too many hints', () => {
  const portions = Array.from({ length: 51 }, (_, i) => ({ name: `x${i}`, grams: 10 }));
  assert(isError(parseAnalyzeRequest({ ...base, note: 'arroz', hints: { portions, recentFoods: [] } })));
  const recentFoods = Array.from({ length: 51 }, (_, i) => `f${i}`);
  assert(isError(parseAnalyzeRequest({ ...base, note: 'arroz', hints: { portions: [], recentFoods } })));
});

const item = {
  name_es: 'Arroz blanco',
  name_en: 'White rice',
  cooking: 'cocido',
  grams: 150,
  grams_min: 120,
  grams_max: 180,
  confidence: 0.8,
  is_hidden_fat: false,
  search_terms: ['arroz blanco', 'arroz cocido'],
};

Deno.test('parseReportMeal clamps grams and confidence', () => {
  const r = parseReportMeal({
    items: [{ ...item, grams: 5000, grams_min: 0, grams_max: 9000, confidence: 3 }],
  });
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.items[0].grams, 2000);
  assertEquals(r.items[0].gramsMin, 1);
  assertEquals(r.items[0].gramsMax, 2000);
  assertEquals(r.items[0].confidence, 1);
  assertEquals(r.question, null);
});

Deno.test('parseReportMeal keeps min <= grams <= max', () => {
  const r = parseReportMeal({ items: [{ ...item, grams: 100, grams_min: 150, grams_max: 90 }] });
  if (isError(r)) throw new Error(r.error);
  assert(r.items[0].gramsMin <= r.items[0].grams && r.items[0].grams <= r.items[0].gramsMax);
});

Deno.test('parseReportMeal drops a question with an out-of-range item or bad options', () => {
  const q = {
    item_index: 4,
    text: '¿Cuánto arroz?',
    options: [{ label: 'a', grams_multiplier: 1 }, { label: 'b', grams_multiplier: 2 }],
  };
  const out = parseReportMeal({ items: [item], question: q });
  if (isError(out)) throw new Error(out.error);
  assertEquals(out.question, null);

  const bad = parseReportMeal({
    items: [item],
    question: { ...q, item_index: 0, options: [{ label: 'a', grams_multiplier: 9 }, { label: 'b', grams_multiplier: 1 }] },
  });
  if (isError(bad)) throw new Error(bad.error);
  assertEquals(bad.question, null);

  const ok = parseReportMeal({ items: [item], question: { ...q, item_index: 0 } });
  if (isError(ok)) throw new Error(ok.error);
  assertEquals(ok.question?.itemIndex, 0);
  assertEquals(ok.question?.options.length, 2);
  assertEquals(ok.question?.options[1].gramsMultiplier, 2);
});

Deno.test('parseReportMeal keeps the question on its item when an earlier item is dropped', () => {
  const options = [{ label: 'a', grams_multiplier: 0.5 }, { label: 'b', grams_multiplier: 1.5 }];
  const items = [item, { name_es: 'sin gramos' }, { ...item, name_es: 'Fríjoles' }, { ...item, name_es: 'Arepa' }];
  const r = parseReportMeal({ items, question: { item_index: 2, text: '¿Cuántos fríjoles?', options } });
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.items.length, 3);
  assertEquals(r.question?.itemIndex, 1);
  assertEquals(r.items[r.question!.itemIndex].name, 'Fríjoles');
});

Deno.test('parseReportMeal drops the question when its item was dropped or past the cap', () => {
  const options = [{ label: 'a', grams_multiplier: 0.5 }, { label: 'b', grams_multiplier: 1.5 }];
  const items = [item, 'basura', { ...item, name_es: 'Arepa' }];
  const r = parseReportMeal({ items, question: { item_index: 1, text: '¿Cuánto?', options } });
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.items.length, 2);
  assertEquals(r.question, null);

  const many = Array.from({ length: 22 }, (_, i) => ({ ...item, name_es: `x${i}` }));
  const capped = parseReportMeal({ items: many, question: { item_index: 21, text: '¿Cuánto?', options } });
  if (isError(capped)) throw new Error(capped.error);
  assertEquals(capped.items.length, 20);
  assertEquals(capped.question, null);
});

Deno.test('parseReportMeal rejects a payload without items', () => {
  assert(isError(parseReportMeal({ items: [] })));
  assert(isError(parseReportMeal(null)));
});

Deno.test('parseReportMeal accepts the strict-mode nulls (cooking and question)', () => {
  const r = parseReportMeal({ items: [{ ...item, cooking: null }], question: null });
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.items[0].cooking, null);
  assertEquals(r.question, null);
});

Deno.test('parseChooseFoods keeps a null foodId without estimate (resolveChoices decides)', () => {
  const r = parseChooseFoods({ choices: [{ itemIndex: 0, foodId: null, estimate: null }] }, 1);
  if (isError(r)) throw new Error(r.error);
  assertEquals(r, [{ itemIndex: 0, foodId: null }]);
  const missing = parseChooseFoods({ choices: [{ itemIndex: 0, foodId: null }] }, 1);
  if (isError(missing)) throw new Error(missing.error);
  assertEquals(missing[0].estimate, undefined);
});

Deno.test('parseChooseFoods treats an out-of-range estimate as absent', () => {
  const r = parseChooseFoods({
    choices: [
      { itemIndex: 0, foodId: null, estimate: { kcal: 950, protein_g: 5, carbs_g: 30, fat_g: 12 } },
      { itemIndex: 1, foodId: null, estimate: { kcal: 300, protein_g: 120, carbs_g: 0, fat_g: 0 } },
      { itemIndex: 2, foodId: null, estimate: { kcal: 300, protein_g: 50, carbs_g: 40, fat_g: 20 } },
    ],
  }, 3);
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.map((c) => c.estimate), [undefined, undefined, undefined]);
});

Deno.test('parseChooseFoods drops estimate: null next to a chosen id', () => {
  const r = parseChooseFoods({ choices: [{ itemIndex: 0, foodId: 'tcac:1', estimate: null }] }, 1);
  if (isError(r)) throw new Error(r.error);
  assertEquals(r, [{ itemIndex: 0, foodId: 'tcac:1' }]);
});

Deno.test('parseChooseFoods accepts ids and estimates and rejects out-of-range indexes', () => {
  const r = parseChooseFoods({
    choices: [
      { itemIndex: 0, foodId: 'tcac:1' },
      { itemIndex: 1, foodId: null, estimate: { kcal: 250, protein_g: 5, carbs_g: 30, fat_g: 12 } },
    ],
  }, 2);
  if (isError(r)) throw new Error(r.error);
  assertEquals(r.length, 2);
  assertEquals(r[1].estimate?.kcal, 250);
  assert(isError(parseChooseFoods({ choices: [{ itemIndex: 3, foodId: 'x' }] }, 2)));
});

Deno.test('parseChooseFoods requires a choice for every item', () => {
  assert(isError(parseChooseFoods({ choices: [{ itemIndex: 0, foodId: 'a' }] }, 2)));
});
