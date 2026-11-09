import { functionHeaders, functionsUrl, supabase } from '../supabase';
import { createId } from '../../utils/id';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  FoodHit,
  FoodRef,
  MealItem,
} from '../../types/nutrition';

type AnalyzeDeps = {
  fetchImpl?: typeof fetch;
  getToken?: () => Promise<string | null>;
};

async function defaultGetToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Sends a photo and/or note to the `nutrition` Edge Function for analysis. */
export async function analyzeMeal(
  req: AnalyzeRequest,
  deps: AnalyzeDeps = {},
): Promise<AnalyzeResponse> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token = await (deps.getToken ?? defaultGetToken)();
  if (!token) throw new Error('Inicia sesión para analizar comidas');

  let response: Response;
  try {
    response = await fetchImpl(`${functionsUrl}/nutrition/analyze`, {
      method: 'POST',
      headers: {
        ...functionHeaders,
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error('Sin conexión con el servidor');
  }

  if (response.status === 429) {
    throw new Error('Llegaste al límite diario de 40 análisis');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error del servidor (${response.status})`);
  }
  return (await response.json()) as AnalyzeResponse;
}

/** Fuzzy food search through the `search_foods` RPC. */
export async function searchFoods(q: string, n = 8): Promise<FoodHit[]> {
  if (!q.trim() || !supabase) return [];
  const { data, error } = await supabase.rpc('search_foods', { q, n });
  if (error) throw new Error(error.message);
  return (data ?? []) as FoodHit[];
}

export function toFoodRef(hit: FoodHit): FoodRef {
  return {
    id: hit.id,
    source: hit.source,
    name: hit.name_es,
    per100: { kcal: hit.kcal, proteinG: hit.protein_g, carbsG: hit.carbs_g, fatG: hit.fat_g },
    verified: hit.verified,
  };
}

export function toMealItems(res: AnalyzeResponse): MealItem[] {
  return res.items.map((item, index) => ({
    id: createId(),
    food: item.food,
    name: item.name,
    grams: item.grams,
    gramsMin: item.gramsMin,
    gramsMax: item.gramsMax,
    weighed: false,
    confidence: item.confidence,
    isHiddenFat: item.isHiddenFat,
    sortOrder: index,
  }));
}
