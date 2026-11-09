// deno-lint-ignore-file no-explicit-any
/**
 * Meal analysis for day2day, as one Supabase Edge Function.
 *
 * Routes (under /functions/v1/nutrition):
 *   POST /analyze  photo and/or note of a meal → items with grams, each
 *                  anchored to a food row (energy always comes from the row)
 *
 * Flow: auth (user JWT) → validate → daily limit → vision call (report_meal,
 * grams only) → search_foods per search term → choice call (choose_foods) →
 * store AI-estimated foods in user_foods → log spend in ai_usage → respond.
 *
 * Secrets: ANTHROPIC_API_KEY (Dashboard → Edge Functions → Secrets).
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
 * by the platform. The Anthropic key is never logged or returned.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  type AnalyzeRequest,
  type AnalyzeResponse,
  type Choice,
  type FoodRef,
  parseAnalyzeRequest,
  parseChooseFoods,
  parseReportMeal,
} from './lib/schema.ts';
import { CHOICE_SYSTEM, chooseFoodsTool, reportMealTool, systemPrompt, userText } from './lib/prompt.ts';
import { applyChoice, dedupeCandidates, fallbackFoodRef, type FoodHit, resolveChoices } from './lib/match.ts';

// Model ids: the owner must confirm them against `GET /v1/models` before deploying.
const VISION_MODEL = 'claude-sonnet-5-5';
const TEXT_MODEL = 'claude-haiku-5-5';
const CHOICE_MODEL = 'claude-haiku-5-5';

/** USD per million tokens, by model family; anything unknown is priced as Sonnet. */
const PRICES = {
  sonnet: { input: 2, output: 10 },
  haiku: { input: 0.1, output: 0.5 },
};

const DAILY_ANALYSES = 40;
/** Each analysis logs one ai_usage row per Claude call: vision + choice. */
const CALLS_PER_ANALYSIS = 2;
const SEARCH_PER_TERM = 5;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_TIMEOUT_MS = 60_000;
const VISION_MAX_TOKENS = 2500;
const CHOICE_MAX_TOKENS = 1500;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------- anthropic

/** Anthropic answered non-2xx or without the forced tool call. */
class AnthropicError extends Error {}

type Usage = { model: string; input_tokens: number; output_tokens: number };

async function callTool(
  model: string,
  system: string,
  content: unknown[],
  tool: { name: string },
  usage: Usage[],
  maxTokens: number,
): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    throw new AnthropicError('missing key');
  }

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content }],
      }),
    });
  } catch (error: any) {
    // Timeout or network failure; the error name says which, never the request.
    console.error(`anthropic ${tool.name} request failed: ${error?.name ?? 'Error'}`);
    throw new AnthropicError('request failed');
  }
  if (!res.ok) {
    // Status only: the body may echo request details and is not needed here.
    console.error(`anthropic ${tool.name} failed with status ${res.status}`);
    await res.body?.cancel();
    throw new AnthropicError(`status ${res.status}`);
  }

  const data: any = await res.json();
  usage.push({
    model,
    input_tokens: Number(data?.usage?.input_tokens) || 0,
    output_tokens: Number(data?.usage?.output_tokens) || 0,
  });
  const block = Array.isArray(data?.content)
    ? data.content.find((b: any) => b?.type === 'tool_use' && b?.name === tool.name)
    : null;
  if (!block) {
    console.error(`anthropic ${tool.name} returned no tool call (stop_reason ${data?.stop_reason})`);
    throw new AnthropicError('no tool call');
  }
  return block.input;
}

function usd(u: Usage): number {
  const p = u.model.includes('haiku') ? PRICES.haiku : PRICES.sonnet;
  return (u.input_tokens * p.input + u.output_tokens * p.output) / 1_000_000;
}

// ------------------------------------------------------------------ storage

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Mirrors `created_at >= date_trunc('day', now())` (the database runs in UTC). */
async function analysesToday(userId: string): Promise<number> {
  const { count, error } = await db
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfUtcDay());
  if (error) throw error;
  // ceil: a lone billed vision call (choice never ran) still counts as an analysis.
  return Math.ceil((count ?? 0) / CALLS_PER_ANALYSIS);
}

async function searchFoods(term: string): Promise<FoodHit[]> {
  const { data, error } = await db.rpc('search_foods', { q: term, n: SEARCH_PER_TERM });
  if (error) throw error;
  return (data ?? []) as FoodHit[];
}

async function saveAiFood(userId: string, ref: FoodRef, nameEn: string): Promise<void> {
  const now = Date.now();
  const { error } = await db.from('user_foods').insert({
    id: ref.id,
    user_id: userId,
    name_es: ref.name,
    name_en: nameEn,
    source: 'ai',
    verified: false,
    kcal: ref.per100.kcal,
    protein_g: ref.per100.proteinG,
    carbs_g: ref.per100.carbsG,
    fat_g: ref.per100.fatG,
    created_at: now,
    updated_at: now,
  });
  // The ref travels inside the meal anyway, so a failed insert only costs reuse.
  if (error) console.error(`user_foods insert failed: ${error.code}`);
}

async function logUsage(userId: string, usage: Usage[]): Promise<void> {
  if (!usage.length) return;
  const { error } = await db.from('ai_usage').insert(
    usage.map((u) => ({
      user_id: userId,
      model: u.model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      usd: usd(u),
    })),
  );
  if (error) console.error(`ai_usage insert failed: ${error.code}`);
}

// ----------------------------------------------------------------- handlers

async function analyze(req: Request, userId: string): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = parseAnalyzeRequest(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);
  const request: AnalyzeRequest = parsed;

  // Checked before any paid call.
  if ((await analysesToday(userId)) >= DAILY_ANALYSES) {
    return json({ error: 'Límite diario de 40 análisis' }, 429);
  }

  const usage: Usage[] = [];
  try {
    const model = request.image ? VISION_MODEL : TEXT_MODEL;
    const content: unknown[] = [];
    if (request.image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: request.image.mediaType, data: request.image.base64 },
      });
    }
    content.push({ type: 'text', text: userText(request) });

    const report = parseReportMeal(
      await callTool(model, systemPrompt(request.hints), content, reportMealTool, usage, VISION_MAX_TOKENS),
    );
    if ('error' in report) {
      console.error(`report_meal invalid: ${report.error}`);
      return json({ error: 'No se pudo analizar la comida' }, 502);
    }
    const { items, question } = report;

    const candidates = await Promise.all(
      items.map(async (item) => dedupeCandidates(await Promise.all(item.searchTerms.map(searchFoods)))),
    );

    const choiceInput = items.map((item, index) => ({
      index,
      name_es: item.name,
      cooking: item.cooking,
      candidates: candidates[index].map((h) => ({ id: h.id, name_es: h.name_es, kcal: Number(h.kcal) })),
    }));
    const raw = parseChooseFoods(
      await callTool(
        CHOICE_MODEL,
        CHOICE_SYSTEM,
        [{ type: 'text', text: JSON.stringify(choiceInput) }],
        chooseFoodsTool,
        usage,
        CHOICE_MAX_TOKENS,
      ),
      items.length,
    );
    const choices: Choice[] | { error: string } = 'error' in raw ? raw : resolveChoices(raw, candidates);
    if ('error' in choices) {
      console.error(`choose_foods invalid: ${choices.error}`);
      return json({ error: 'No se pudo analizar la comida' }, 502);
    }

    const created = new Map<number, FoodRef>();
    for (const choice of choices) {
      if (choice.foodId !== null || !choice.estimate) continue;
      const item = items[choice.itemIndex];
      const ref = fallbackFoodRef(choice.estimate, item.name);
      await saveAiFood(userId, ref, item.nameEn);
      created.set(choice.itemIndex, ref);
    }

    const response: AnalyzeResponse = {
      analysisId: crypto.randomUUID(),
      items: applyChoice(items, choices, created, candidates),
      question,
      model,
    };
    return json(response);
  } catch (error) {
    if (error instanceof AnthropicError) return json({ error: 'No se pudo analizar la comida' }, 502);
    throw error;
  } finally {
    // Every call that was billed is logged, even when the analysis failed later.
    await logUsage(userId, usage);
  }
}

// ------------------------------------------------------------------- router

async function userIdFrom(req: Request): Promise<string | null> {
  const authorization = req.headers.get('authorization');
  if (!authorization || !/^Bearer\s+\S+/i.test(authorization)) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/nutrition/, '').replace(/\/+$/, '') || '/';

  try {
    if (route === '/analyze' && req.method === 'POST') {
      const userId = await userIdFrom(req);
      if (!userId) return json({ error: 'No autorizado' }, 401);
      return await analyze(req, userId);
    }
    return json({ error: 'Ruta no encontrada' }, 404);
  } catch (error: any) {
    console.error(`nutrition internal error: ${String(error?.message ?? error).slice(0, 200)}`);
    return json({ error: 'Fallo interno' }, 500);
  }
});
