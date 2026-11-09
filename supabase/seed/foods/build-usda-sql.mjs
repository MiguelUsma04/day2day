// Trae alimentos genéricos de USDA FoodData Central (SR Legacy), los traduce al
// español con Claude Haiku y genera una migración SQL que carga public.foods.
// Sin dependencias (Node 22+: fetch, node:zlib).
// Uso: ANTHROPIC_API_KEY=... node supabase/seed/foods/build-usda-sql.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

// Verificada el 2026-11-09 en https://fdc.nal.usda.gov/download-datasets
export const SR_LEGACY_ZIP_URL =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';
export const MODEL = 'claude-haiku-5-5';
export const MAX_ROWS = 1200;

const COLUMNS = [
  'id',
  'name_es',
  'name_en',
  'source',
  'source_ref',
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'default_portion_g',
  'tags',
  'verified',
  'name_es_auto',
];

export const KEEP_CATEGORIES = new Set([
  'Dairy and Egg Products',
  'Spices and Herbs',
  'Fats and Oils',
  'Poultry Products',
  'Sausages and Luncheon Meats',
  'Breakfast Cereals',
  'Fruits and Fruit Juices',
  'Pork Products',
  'Vegetables and Vegetable Products',
  'Nut and Seed Products',
  'Beef Products',
  'Beverages',
  'Finfish and Shellfish Products',
  'Legumes and Legume Products',
  'Lamb, Veal, and Game Products',
  'Baked Products',
  'Sweets',
  'Cereal Grains and Pasta',
  'Snacks',
]);

const EXCLUDE_RE = /babyfood|infant|restaurant|usda commodity|school lunch/i;

// Los nombres de categoría de USDA llevan comas; se comparan sin ellas.
const normCat = (s) => String(s ?? '').replace(/,/g, '').trim();
const KEEP_NORMALIZED = new Set([...KEEP_CATEGORIES].map(normCat));

const NUTRIENT_IDS = { kcal: '1008', protein_g: '1003', carbs_g: '1005', fat_g: '1004', fiber_g: '1079' };

// ---------------------------------------------------------------- ZIP mínimo

/** Lee las entradas (stored/deflated) de un ZIP en memoria: { nombre: Buffer }. */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP inválido: no se encontró el directorio central');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP inválido: entrada corrupta');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) entries[name] = Buffer.from(raw);
    else if (method === 8) entries[name] = inflateRawSync(raw);
    else throw new Error(`ZIP: método de compresión ${method} no soportado (${name})`);
  }
  return entries;
}

// ---------------------------------------------------------------- CSV

/** Divide el texto CSV en registros de campos, respetando comillas. */
function splitRecords(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Parsea el CSV a objetos por encabezado. */
export function parseCsv(text) {
  const [header, ...rows] = splitRecords(text.replace(/^﻿/, ''));
  return rows.map((fields, n) => {
    if (fields.length !== header.length) {
      throw new Error(`Fila ${n + 2}: ${fields.length} campos, se esperaban ${header.length}`);
    }
    return Object.fromEntries(header.map((h, i) => [h, fields[i].trim()]));
  });
}

// ---------------------------------------------------------------- pasos puros

/** Conserva alimentos genéricos de las categorías útiles. */
export function filterFood(food, categoryName) {
  if (!KEEP_NORMALIZED.has(normCat(categoryName))) return false;
  return !EXCLUDE_RE.test(food.description ?? '');
}

/** Mapea nutrient_id -> amount a las columnas; null si falta (kcal obligatorio). */
export function pickNutrients(byNutrientId) {
  const out = {};
  for (const [col, id] of Object.entries(NUTRIENT_IDS)) {
    const v = byNutrientId[id] ?? byNutrientId[Number(id)];
    const n = v === undefined || v === null || v === '' ? NaN : Number(v);
    out[col] = Number.isFinite(n) ? n : null;
  }
  return out;
}

/** Nombres más cortos primero (los más genéricos), desempata por fdc_id. */
export function rankAndCap(foods, cap = MAX_ROWS) {
  return [...foods]
    .sort((a, b) => a.description.length - b.description.length || Number(a.fdc_id) - Number(b.fdc_id))
    .slice(0, cap);
}

const text = (v) => (v === undefined || v === null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

function num(v, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new Error('Valor numérico obligatorio vacío');
    return 'null';
  }
  if (!/^-?\d+(\.\d+)?$/.test(String(v))) throw new Error(`Número inválido: ${v}`);
  return String(v);
}

const round = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

/** Una tupla `values (...)` para una fila ya traducida. */
export function rowToSql(row) {
  if (!row.fdc_id) throw new Error(`Fila sin fdc_id: ${JSON.stringify(row)}`);
  const values = [
    text(`usda:${row.fdc_id}`),
    text(row.name_es),
    text(row.name_en),
    "'usda'",
    text(String(row.fdc_id)),
    num(round(row.kcal), { required: true }),
    num(round(row.protein_g), { required: true }),
    num(round(row.carbs_g), { required: true }),
    num(round(row.fat_g), { required: true }),
    num(round(row.fiber_g)),
    'null',
    "'{}'",
    'false',
    'true',
  ];
  return `(${values.join(', ')})`;
}

/** Un solo insert con upsert por id. */
export function buildSql(rows) {
  const ids = new Set();
  for (const r of rows) {
    if (ids.has(r.fdc_id)) throw new Error(`fdc_id duplicado: ${r.fdc_id}`);
    ids.add(r.fdc_id);
  }
  const updates = COLUMNS.filter((c) => c !== 'id').map((c) => `  ${c} = excluded.${c}`);
  return [
    `insert into public.foods (${COLUMNS.join(', ')})`,
    'values',
    rows.map((r) => `  ${rowToSql(r)}`).join(',\n'),
    'on conflict (id) do update set',
    `${updates.join(',\n')};`,
    '',
  ].join('\n');
}

/**
 * Cruza las tablas CSV de SR Legacy y devuelve los alimentos filtrados con sus
 * nutrientes ({ fdc_id, description, kcal, protein_g, ... }), sin ranking.
 */
export function selectFoods({ foodCsv, categoryCsv, nutrientCsv }) {
  const categories = new Map(parseCsv(categoryCsv).map((c) => [c.id, c.description]));
  const kept = new Map();
  for (const f of parseCsv(foodCsv)) {
    if (filterFood(f, categories.get(f.food_category_id))) kept.set(f.fdc_id, f);
  }
  const wanted = new Set(Object.values(NUTRIENT_IDS));
  const amounts = new Map();
  for (const n of parseCsv(nutrientCsv)) {
    if (!wanted.has(n.nutrient_id) || !kept.has(n.fdc_id)) continue;
    if (!amounts.has(n.fdc_id)) amounts.set(n.fdc_id, {});
    amounts.get(n.fdc_id)[n.nutrient_id] = n.amount;
  }
  const foods = [];
  let dropped = 0;
  for (const [fdcId, f] of kept) {
    const picked = pickNutrients(amounts.get(fdcId) ?? {});
    if ([picked.kcal, picked.protein_g, picked.carbs_g, picked.fat_g].some((v) => v === null)) {
      dropped++;
      continue;
    }
    foods.push({ fdc_id: fdcId, description: f.description, ...picked });
  }
  if (dropped > 0) console.error(`${dropped} alimentos descartados por faltar kcal, proteína, carbohidratos o grasa`);
  return foods;
}

// ---------------------------------------------------------------- traducción

function translationPrompt(names) {
  return [
    'Traduce estos nombres de alimentos (USDA, en inglés) a nombres cortos y naturales en español colombiano,',
    'como los diría alguien en Colombia. Conserva el corte, la preparación y el estado (crudo, cocido, asado, etc.).',
    `Responde SOLO con un arreglo JSON de ${names.length} strings, en el mismo orden, sin texto adicional ni bloques de código.`,
    '',
    JSON.stringify(names),
  ].join('\n');
}

function parseTranslation(raw, expected) {
  const cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('La respuesta no contiene un arreglo JSON');
  const arr = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(arr) || arr.length !== expected || arr.some((s) => typeof s !== 'string' || !s.trim())) {
    throw new Error(`La traducción debe ser un arreglo de ${expected} strings no vacíos`);
  }
  return arr.map((s) => s.trim());
}

/** Traduce un lote; reintenta una vez si la respuesta no es válida. */
export async function translateBatch(names, apiKey, fetchImpl = fetch) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        // Haiku 5.5 piensa por defecto; el pensamiento cuenta en max_tokens.
        max_tokens: 8000,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: translationPrompt(names) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic respondió ${res.status}: ${await res.text()}`);
    const data = await res.json();
    try {
      // La respuesta trae un bloque `thinking` antes del texto: buscar el de texto.
      const text = (data?.content ?? []).find((b) => b?.type === 'text')?.text ?? '';
      return parseTranslation(text, names.length);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Traducción inválida tras reintentar: ${lastError.message}`);
}

export async function translateAll(names, apiKey, batchSize = 100, fetchImpl = fetch) {
  const out = [];
  for (let i = 0; i < names.length; i += batchSize) {
    out.push(...(await translateBatch(names.slice(i, i + batchSize), apiKey, fetchImpl)));
    console.error(`Traducidos ${Math.min(i + batchSize, names.length)}/${names.length}`);
  }
  return out;
}

// ---------------------------------------------------------------- ejecución

async function loadZip(cacheDir) {
  const zipPath = join(cacheDir, 'sr_legacy.zip');
  if (!existsSync(zipPath)) {
    mkdirSync(cacheDir, { recursive: true });
    console.error(`Descargando ${SR_LEGACY_ZIP_URL}`);
    const res = await fetch(SR_LEGACY_ZIP_URL);
    if (!res.ok) throw new Error(`Descarga fallida: ${res.status}`);
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  } else {
    console.error(`Usando caché ${zipPath}`);
  }
  return readZip(readFileSync(zipPath));
}

export async function loadFilteredFoods(cacheDir) {
  const entries = await loadZip(cacheDir);
  const get = (file) => {
    const key = Object.keys(entries).find((k) => k.split('/').pop() === file);
    if (!key) throw new Error(`El ZIP no trae ${file}`);
    return entries[key].toString('utf8');
  };
  const foods = selectFoods({
    foodCsv: get('food.csv'),
    categoryCsv: get('food_category.csv'),
    nutrientCsv: get('food_nutrient.csv'),
  });
  console.error(`${foods.length} alimentos pasan el filtro`);
  return foods;
}

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Falta ANTHROPIC_API_KEY (se usa solo para traducir los nombres a español).');
    process.exit(1);
  }
  const repo = resolve(here, '..', '..', '..');
  const outPath = join(repo, 'supabase', 'migrations', '20261110000002_foods_usda.sql');
  const foods = rankAndCap(await loadFilteredFoods(join(here, 'source')), MAX_ROWS);
  const translated = await translateAll(
    foods.map((f) => f.description),
    apiKey,
  );
  const rows = foods.map((f, i) => ({ ...f, name_en: f.description, name_es: translated[i] }));
  const header = [
    '-- GENERADO: no editar a mano.',
    `-- Fuente: USDA FoodData Central, SR Legacy (${SR_LEGACY_ZIP_URL}); valores por 100 g.`,
    `-- Nombres en español traducidos con ${MODEL} (name_es_auto = true).`,
    '-- Regenerar con: node supabase/seed/foods/build-usda-sql.mjs',
    `-- Generado: ${new Date().toISOString().slice(0, 10)}. ${rows.length} alimentos.`,
    '',
  ].join('\n');
  writeFileSync(outPath, header + buildSql(rows));
  console.error(`${rows.length} filas -> ${relative(repo, outPath)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
