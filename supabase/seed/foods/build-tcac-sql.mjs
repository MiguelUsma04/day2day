// Convierte tcac.csv (transcrito a mano de la TCAC 2018 del ICBF) en una
// migración SQL que carga public.foods. Sin dependencias.
// Uso: node supabase/seed/foods/build-tcac-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Parsea el CSV a objetos por encabezado; `tags` queda como arreglo. */
export function parseCsv(text) {
  const [header, ...rows] = splitRecords(text);
  return rows.map((fields, n) => {
    if (fields.length !== header.length) {
      throw new Error(`Fila ${n + 2}: ${fields.length} campos, se esperaban ${header.length}`);
    }
    const row = Object.fromEntries(header.map((h, i) => [h, fields[i].trim()]));
    row.tags = row.tags ? row.tags.split('|').map((t) => t.trim()).filter(Boolean) : [];
    return row;
  });
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

function tagsLiteral(tags) {
  for (const t of tags) {
    if (!/^[a-z0-9_-]+$/.test(t)) throw new Error(`Tag inválido: ${t}`);
  }
  return `'{${tags.join(',')}}'`;
}

/** Una tupla `values (...)` para una fila del CSV. */
export function rowToSql(row) {
  if (!row.code || !row.page) throw new Error(`Fila sin code/page: ${JSON.stringify(row)}`);
  const values = [
    text(`tcac:${row.code}`),
    text(row.name_es),
    text(row.name_en),
    "'tcac'",
    text(`p${row.page}#${row.code}`),
    num(row.kcal, { required: true }),
    num(row.protein_g, { required: true }),
    num(row.carbs_g, { required: true }),
    num(row.fat_g, { required: true }),
    num(row.fiber_g),
    num(row.default_portion_g),
    tagsLiteral(row.tags ?? []),
    'true',
    'false',
  ];
  return `(${values.join(', ')})`;
}

/** Un solo insert con upsert por id. */
export function buildSql(rows) {
  const ids = new Set();
  for (const r of rows) {
    if (ids.has(r.code)) throw new Error(`Código duplicado: ${r.code}`);
    ids.add(r.code);
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

const here = dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = resolve(here, '..', '..', '..');
  const csvPath = join(here, 'tcac.csv');
  const outPath = join(repo, 'supabase', 'migrations', '20261110000001_foods_tcac.sql');
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const csvRel = relative(repo, csvPath).split('\\').join('/');
  const header = [
    '-- GENERADO: no editar a mano.',
    `-- Fuente: ${csvRel} (TCAC 2018, ICBF; valores por 100 g de parte comestible).`,
    '-- Regenerar con: node supabase/seed/foods/build-tcac-sql.mjs',
    `-- ${rows.length} alimentos.`,
    '',
  ].join('\n');
  writeFileSync(outPath, header + buildSql(rows));
  console.log(`${rows.length} filas -> ${relative(repo, outPath)}`);
}
