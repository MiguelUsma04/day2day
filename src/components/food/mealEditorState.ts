import { mealTotals } from '../../lib/nutrition/mealMath';
import type { EatenPct, Macros, Meal, MealItem, Question } from '../../types/nutrition';

export type EditorState = {
  items: MealItem[];
  /** Grams each item had when it entered the editor (by item id); answers scale from these. */
  originalGrams: Record<string, number>;
  question: Question | null;
  eatenPct: EatenPct;
};

export type EditorAction =
  | { type: 'setItems'; items: MealItem[] }
  | { type: 'setGrams'; index: number; grams: number }
  | { type: 'removeItem'; index: number }
  | { type: 'addItem'; item: MealItem }
  | { type: 'answer'; optionIndex: number }
  | { type: 'setEatenPct'; pct: EatenPct }
  | { type: 'setQuestion'; question: Question | null };

const TITLE_MAX_NAMES = 3;

export function initialEditorState(items: MealItem[] = [], eatenPct: EatenPct = 100): EditorState {
  return { items: renumber(items), originalGrams: gramsById(items), question: null, eatenPct };
}

function renumber(items: MealItem[]): MealItem[] {
  return items.map((item, index) => (item.sortOrder === index ? item : { ...item, sortOrder: index }));
}

function gramsById(items: MealItem[]): Record<string, number> {
  return Object.fromEntries(items.map((i) => [i.id, i.grams]));
}

const round = (x: number) => Math.round(x);

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setItems':
      // New item list: old question indices no longer apply.
      return { ...state, items: renumber(action.items), originalGrams: gramsById(action.items), question: null };

    case 'setGrams': {
      if (!state.items[action.index]) return state;
      const items = state.items.map((item, i) =>
        i === action.index ? { ...item, grams: action.grams, weighed: true, gramsMin: null, gramsMax: null } : item,
      );
      // A typed weight wins over the analysis question about that item.
      const question = state.question?.itemIndex === action.index ? null : state.question;
      return { ...state, items, question };
    }

    case 'removeItem': {
      if (!state.items[action.index]) return state;
      const removed = state.items[action.index];
      const items = renumber(state.items.filter((_, i) => i !== action.index));
      const { [removed.id]: _drop, ...originalGrams } = state.originalGrams;
      let question = state.question;
      if (question) {
        if (question.itemIndex === action.index) question = null;
        else if (question.itemIndex > action.index) question = { ...question, itemIndex: question.itemIndex - 1 };
      }
      return { ...state, items, originalGrams, question };
    }

    case 'addItem': {
      const items = [...state.items, { ...action.item, sortOrder: state.items.length }];
      return { ...state, items, originalGrams: { ...state.originalGrams, [action.item.id]: action.item.grams } };
    }

    case 'answer': {
      const q = state.question;
      const option = q?.options[action.optionIndex];
      const target = q ? state.items[q.itemIndex] : undefined;
      if (!q || !option || !target) return state;
      const base = state.originalGrams[target.id] ?? target.grams;
      const grams = round(base * option.gramsMultiplier);
      // Keep the uncertainty range proportional to the new estimate.
      const ratio = target.grams > 0 ? grams / target.grams : 1;
      const items = state.items.map((item, i) =>
        i === q.itemIndex
          ? {
              ...item,
              grams,
              weighed: false, // still an estimate: never learned as a portion
              gramsMin: item.gramsMin === null ? null : round(item.gramsMin * ratio),
              gramsMax: item.gramsMax === null ? null : round(item.gramsMax * ratio),
            }
          : item,
      );
      return { ...state, items, question: null };
    }

    case 'setEatenPct':
      return { ...state, eatenPct: action.pct };

    case 'setQuestion': {
      const q = action.question;
      // Ignore questions that point at no item.
      return { ...state, question: q && state.items[q.itemIndex] ? q : null };
    }
  }
}

export function totals(state: EditorState): Macros {
  return mealTotals({ items: state.items, eatenPct: state.eatenPct } as Meal);
}

/** First names of the visible (non hidden-fat) items, e.g. "Arroz, Pollo, Ensalada…". */
export function title(state: EditorState): string {
  const names = state.items.filter((i) => !i.isHiddenFat).map((i) => i.name.trim()).filter(Boolean);
  const head = names.slice(0, TITLE_MAX_NAMES).join(', ');
  return names.length > TITLE_MAX_NAMES ? `${head}…` : head;
}
