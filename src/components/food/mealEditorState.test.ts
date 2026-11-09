import { expect, test } from 'vitest';
import type { MealItem, Question } from '../../types/nutrition';
import { editorReducer, initialEditorState, title, totals, type EditorState } from './mealEditorState';

const rice = { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 };
const item = (id: string, o: Partial<MealItem> = {}): MealItem => ({
  id,
  food: { id: `f-${id}`, source: 'tcac', name: id, per100: rice, verified: true },
  name: id,
  grams: 100,
  gramsMin: 80,
  gramsMax: 150,
  weighed: false,
  confidence: 0.8,
  isHiddenFat: false,
  sortOrder: 0,
  ...o,
});
const question = (itemIndex: number): Question => ({
  itemIndex,
  text: '¿Cuánto arroz?',
  options: [
    { label: 'Poco', gramsMultiplier: 0.5 },
    { label: 'Normal', gramsMultiplier: 1 },
    { label: 'Mucho', gramsMultiplier: 1.5 },
  ],
});
const withItems = (items: MealItem[], q: Question | null = null): EditorState => {
  const s = editorReducer(initialEditorState(), { type: 'setItems', items });
  return editorReducer(s, { type: 'setQuestion', question: q });
};

test('setGrams marks the item weighed and clears its range', () => {
  const s = editorReducer(withItems([item('a'), item('b')]), { type: 'setGrams', index: 1, grams: 180 });
  expect(s.items[1]).toMatchObject({ grams: 180, weighed: true, gramsMin: null, gramsMax: null });
  expect(s.items[0]).toMatchObject({ grams: 100, weighed: false, gramsMin: 80 });
});

test('answer multiplies the original grams, clears the question, and does not compound', () => {
  let s = withItems([item('a'), item('b')], question(1));
  s = editorReducer(s, { type: 'answer', optionIndex: 2 });
  expect(s.items[1].grams).toBe(150);
  expect(s.items[1]).toMatchObject({ gramsMin: 120, gramsMax: 225 });
  expect(s.question).toBeNull();
  s = editorReducer(s, { type: 'setQuestion', question: question(1) });
  s = editorReducer(s, { type: 'answer', optionIndex: 0 });
  expect(s.items[1].grams).toBe(50); // 100 × 0.5, not 150 × 0.5
  expect(s.items[1]).toMatchObject({ gramsMin: 40, gramsMax: 75 });
  expect(s.items[0].grams).toBe(100);
});

test('typing the weight of the questioned item closes the question', () => {
  let s = editorReducer(withItems([item('a'), item('b')], question(1)), { type: 'setGrams', index: 1, grams: 210 });
  expect(s.question).toBeNull();
  s = editorReducer(s, { type: 'answer', optionIndex: 2 });
  expect(s.items[1]).toMatchObject({ grams: 210, weighed: true });
});

test('typing the weight of another item keeps the question', () => {
  const s = editorReducer(withItems([item('a'), item('b')], question(1)), { type: 'setGrams', index: 0, grams: 90 });
  expect(s.question?.itemIndex).toBe(1);
});

test('answer leaves the item not weighed', () => {
  let s = withItems([item('a', { weighed: true })], question(0));
  s = editorReducer(s, { type: 'answer', optionIndex: 2 });
  expect(s.items[0].weighed).toBe(false);
});

test('answer without a question is a no-op', () => {
  const s = withItems([item('a')]);
  expect(editorReducer(s, { type: 'answer', optionIndex: 0 })).toBe(s);
});

test('removeItem of the questioned item clears the question', () => {
  const s = editorReducer(withItems([item('a'), item('b')], question(1)), { type: 'removeItem', index: 1 });
  expect(s.items.map((i) => i.id)).toEqual(['a']);
  expect(s.question).toBeNull();
});

test('removeItem before the questioned item shifts its index', () => {
  let s = editorReducer(withItems([item('a'), item('b'), item('c')], question(2)), { type: 'removeItem', index: 0 });
  expect(s.question?.itemIndex).toBe(1);
  s = editorReducer(s, { type: 'answer', optionIndex: 2 });
  expect(s.items.map((i) => i.grams)).toEqual([100, 150]);
  expect(s.items.map((i) => i.sortOrder)).toEqual([0, 1]);
});

test('addItem appends with the next sortOrder', () => {
  const s = editorReducer(withItems([item('a')]), { type: 'addItem', item: item('z', { sortOrder: 9 }) });
  expect(s.items.map((i) => [i.id, i.sortOrder])).toEqual([
    ['a', 0],
    ['z', 1],
  ]);
});

test('title cuts at 3 names and skips hidden fat', () => {
  const s = withItems([item('Arroz'), item('Aceite', { isHiddenFat: true }), item('Pollo'), item('Ensalada')]);
  expect(title(s)).toBe('Arroz, Pollo, Ensalada');
  const more = editorReducer(s, { type: 'addItem', item: item('Jugo') });
  expect(title(more)).toBe('Arroz, Pollo, Ensalada…');
});

test('totals respects eatenPct', () => {
  let s = withItems([item('a', { grams: 200 }), item('b')]);
  expect(totals(s).kcal).toBe(390);
  s = editorReducer(s, { type: 'setEatenPct', pct: 50 });
  expect(totals(s).kcal).toBe(195);
});
