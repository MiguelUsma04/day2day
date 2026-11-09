/**
 * Request/response shapes of the nutrition function and hand-written
 * validators for the request body and for the two Claude tool outputs.
 * No dependencies on purpose: this runs on every request and in plain tests.
 */

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export type FoodSource = 'tcac' | 'usda' | 'off' | 'user' | 'ai';
export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };
export type FoodRef = { id: string; source: FoodSource; name: string; per100: Macros; verified: boolean };

export type AnalyzeRequest = {
  image?: { base64: string; mediaType: MediaType };
  note?: string;
  slot: MealSlot;
  date: string;
  hints: { portions: { name: string; grams: number }[]; recentFoods: string[] };
};

export type AnalyzedItem = {
  name: string;
  nameEn: string;
  cooking: string | null;
  grams: number;
  gramsMin: number;
  gramsMax: number;
  confidence: number;
  isHiddenFat: boolean;
  food: FoodRef;
};

export type Question = {
  itemIndex: number;
  text: string;
  options: { label: string; gramsMultiplier: number }[];
};

export type AnalyzeResponse = {
  analysisId: string;
  items: AnalyzedItem[];
  question: Question | null;
  model: string;
};

/** One item as reported by the vision call: grams only, never energy. */
export type ReportedItem = Omit<AnalyzedItem, 'food'> & { searchTerms: string[] };
export type ReportedMeal = { items: ReportedItem[]; question: Question | null };

/** Per 100 g, only ever produced by the choice call when no row fits. */
export type Estimate = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
export type Choice = { itemIndex: number; foodId: string | null; estimate?: Estimate };

type Invalid = { error: string };

/** About 2.5 MB of binary once base64-decoded (4 chars per 3 bytes). */
export const MAX_BASE64_CHARS = 3_500_000;
const MAX_HINTS = 50;
const MAX_NOTE = 1000;
const MAX_ITEMS = 20;
const MIN_GRAMS = 1;
const MAX_GRAMS = 2000;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// ------------------------------------------------------------------ request

export function parseAnalyzeRequest(json: unknown): AnalyzeRequest | Invalid {
  if (!isObject(json)) return { error: 'Cuerpo inválido' };

  const slot = json.slot;
  if (typeof slot !== 'string' || !(MEAL_SLOTS as readonly string[]).includes(slot)) {
    return { error: 'slot inválido' };
  }
  const date = json.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'date inválida' };
  }

  let image: AnalyzeRequest['image'];
  if (json.image !== undefined && json.image !== null) {
    if (!isObject(json.image)) return { error: 'image inválida' };
    const { base64, mediaType } = json.image;
    if (typeof mediaType !== 'string' || !(MEDIA_TYPES as readonly string[]).includes(mediaType)) {
      return { error: 'Formato de imagen no soportado' };
    }
    if (typeof base64 !== 'string' || base64.length === 0) return { error: 'image inválida' };
    if (base64.length > MAX_BASE64_CHARS) return { error: 'La imagen supera 2,5 MB' };
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { error: 'image inválida' };
    image = { base64, mediaType: mediaType as MediaType };
  }

  let note: string | undefined;
  if (json.note !== undefined && json.note !== null) {
    if (typeof json.note !== 'string') return { error: 'note inválida' };
    const t = json.note.trim();
    if (t.length >= 3) note = t.slice(0, MAX_NOTE);
    else if (!image) return { error: 'La nota es muy corta' };
  }
  if (!image && !note) return { error: 'Hace falta una foto o una nota' };

  const hints: AnalyzeRequest['hints'] = { portions: [], recentFoods: [] };
  if (json.hints !== undefined && json.hints !== null) {
    if (!isObject(json.hints)) return { error: 'hints inválidos' };
    const { portions = [], recentFoods = [] } = json.hints;
    if (!Array.isArray(portions) || portions.length > MAX_HINTS) return { error: 'hints.portions inválido' };
    if (!Array.isArray(recentFoods) || recentFoods.length > MAX_HINTS) {
      return { error: 'hints.recentFoods inválido' };
    }
    for (const p of portions) {
      if (!isObject(p)) return { error: 'hints.portions inválido' };
      const name = str(p.name, 80);
      if (!name || !isNum(p.grams) || p.grams <= 0) return { error: 'hints.portions inválido' };
      hints.portions.push({ name, grams: clamp(Math.round(p.grams), MIN_GRAMS, MAX_GRAMS) });
    }
    for (const f of recentFoods) {
      const name = str(f, 80);
      if (!name) return { error: 'hints.recentFoods inválido' };
      hints.recentFoods.push(name);
    }
  }

  return { ...(image ? { image } : {}), ...(note ? { note } : {}), slot: slot as MealSlot, date, hints };
}

// ------------------------------------------------------------- tool outputs

function parseQuestion(v: unknown, itemCount: number): Question | null {
  if (!isObject(v)) return null;
  const itemIndex = v.item_index;
  const text = str(v.text, 200);
  if (!Number.isInteger(itemIndex) || (itemIndex as number) < 0 || (itemIndex as number) >= itemCount) return null;
  if (!text || !Array.isArray(v.options) || v.options.length < 2 || v.options.length > 4) return null;
  const options: Question['options'] = [];
  for (const o of v.options) {
    if (!isObject(o)) return null;
    const label = str(o.label, 60);
    const m = o.grams_multiplier;
    if (!label || !isNum(m) || m <= 0 || m > 5) return null;
    options.push({ label, gramsMultiplier: m });
  }
  return { itemIndex: itemIndex as number, text, options };
}

/** Validates `report_meal`. Grams are clamped, a bad question is dropped rather than failing the meal. */
export function parseReportMeal(toolInput: unknown): ReportedMeal | Invalid {
  if (!isObject(toolInput) || !Array.isArray(toolInput.items)) return { error: 'report_meal sin items' };
  const items: ReportedItem[] = [];
  /** Raw index → index in `items`, so the question follows its item when others are dropped. */
  const kept = new Map<number, number>();
  for (const [rawIndex, raw] of toolInput.items.slice(0, MAX_ITEMS).entries()) {
    if (!isObject(raw)) continue;
    const name = str(raw.name_es, 120);
    if (!name || !isNum(raw.grams)) continue;
    const grams = clamp(Math.round(raw.grams), MIN_GRAMS, MAX_GRAMS);
    const lo = isNum(raw.grams_min) ? clamp(Math.round(raw.grams_min), MIN_GRAMS, MAX_GRAMS) : grams;
    const hi = isNum(raw.grams_max) ? clamp(Math.round(raw.grams_max), MIN_GRAMS, MAX_GRAMS) : grams;
    const terms = Array.isArray(raw.search_terms)
      ? raw.search_terms.map((t) => str(t, 80)).filter((t): t is string => Boolean(t)).slice(0, 3)
      : [];
    kept.set(rawIndex, items.length);
    items.push({
      name,
      nameEn: str(raw.name_en, 120) ?? name,
      cooking: str(raw.cooking, 60),
      grams,
      gramsMin: Math.min(lo, grams),
      gramsMax: Math.max(hi, grams),
      confidence: isNum(raw.confidence) ? clamp(raw.confidence, 0, 1) : 0.5,
      isHiddenFat: raw.is_hidden_fat === true,
      searchTerms: terms.length ? terms : [name],
    });
  }
  if (!items.length) return { error: 'report_meal sin items' };
  // The tool allows a single question object, so there is never more than one.
  return { items, question: remapQuestion(toolInput.question, kept) };
}

/** A question about a dropped (or past-the-cap) item is discarded, never moved to a neighbour. */
function remapQuestion(v: unknown, kept: Map<number, number>): Question | null {
  if (!isObject(v) || !Number.isInteger(v.item_index)) return null;
  const itemIndex = kept.get(v.item_index as number);
  if (itemIndex === undefined) return null;
  return parseQuestion({ ...v, item_index: itemIndex }, kept.size);
}

function parseEstimate(v: unknown): Estimate | null {
  if (!isObject(v)) return null;
  const { kcal, protein_g, carbs_g, fat_g } = v;
  if (!isNum(kcal) || !isNum(protein_g) || !isNum(carbs_g) || !isNum(fat_g)) return null;
  if (kcal < 0 || kcal > 900 || protein_g < 0 || carbs_g < 0 || fat_g < 0) return null;
  if (protein_g + carbs_g + fat_g > 100) return null;
  return { kcal, protein_g, carbs_g, fat_g };
}

/** Validates `choose_foods`: exactly one choice per item; a null id must carry an estimate. */
export function parseChooseFoods(toolInput: unknown, itemCount: number): Choice[] | Invalid {
  if (!isObject(toolInput) || !Array.isArray(toolInput.choices)) return { error: 'choose_foods sin choices' };
  const byIndex = new Map<number, Choice>();
  for (const raw of toolInput.choices) {
    if (!isObject(raw)) return { error: 'choice inválida' };
    const itemIndex = raw.itemIndex;
    if (!Number.isInteger(itemIndex) || (itemIndex as number) < 0 || (itemIndex as number) >= itemCount) {
      return { error: 'itemIndex fuera de rango' };
    }
    const foodId = typeof raw.foodId === 'string' && raw.foodId ? raw.foodId : null;
    const estimate = parseEstimate(raw.estimate);
    if (foodId === null && !estimate) return { error: 'foodId null sin estimate' };
    byIndex.set(itemIndex as number, { itemIndex: itemIndex as number, foodId, ...(estimate ? { estimate } : {}) });
  }
  if (byIndex.size !== itemCount) return { error: 'Faltan elecciones' };
  return [...byIndex.values()].sort((a, b) => a.itemIndex - b.itemIndex);
}
