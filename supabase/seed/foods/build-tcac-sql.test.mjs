import { describe, expect, it } from 'vitest';
import { buildSql, parseCsv, rowToSql } from './build-tcac-sql.mjs';

const HEADER = 'code,page,name_es,name_en,kcal,protein_g,carbs_g,fat_g,fiber_g,default_portion_g,tags';

describe('parseCsv', () => {
  it('respeta comas dentro de comillas y separa los tags por |', () => {
    const rows = parseCsv(
      `${HEADER}\nA004,43,"Arepa de maíz, con sal","Corn arepa, salted",163,3.3,35.0,0.9,,80,cereal|arepa\n`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name_es).toBe('Arepa de maíz, con sal');
    expect(rows[0].name_en).toBe('Corn arepa, salted');
    expect(rows[0].fiber_g).toBe('');
    expect(rows[0].tags).toEqual(['cereal', 'arepa']);
    expect(rowToSql(rows[0])).toContain(`'{cereal,arepa}'`);
  });

  it('acepta comillas dobles escapadas y CRLF', () => {
    const rows = parseCsv(`${HEADER}\r\nX001,1,"Pan ""rico""",Bread,1,0,0,0,,,\r\n`);
    expect(rows[0].name_es).toBe('Pan "rico"');
    expect(rows[0].tags).toEqual([]);
  });
});

describe('rowToSql', () => {
  const row = {
    code: 'A999',
    page: '43',
    name_es: "Arepa d'onde",
    name_en: "Grandma's arepa",
    kcal: '163',
    protein_g: '3.3',
    carbs_g: '35.0',
    fat_g: '0.9',
    fiber_g: '',
    default_portion_g: '80',
    tags: ['cereal'],
  };

  it('escapa comillas simples duplicándolas', () => {
    const sql = rowToSql(row);
    expect(sql).toContain("'Arepa d''onde'");
    expect(sql).toContain("'Grandma''s arepa'");
  });

  it('usa id tcac:, source_ref p<page>#<code>, null para vacíos y verified true', () => {
    expect(rowToSql(row)).toBe(
      "('tcac:A999', 'Arepa d''onde', 'Grandma''s arepa', 'tcac', 'p43#A999', 163, 3.3, 35.0, 0.9, null, 80, '{cereal}', true, false)",
    );
  });
});

describe('buildSql', () => {
  it('genera un solo insert que termina con on conflict do update', () => {
    const rows = parseCsv(`${HEADER}\nA009,43,Arroz blanco cocido,"White rice, cooked",161,2.3,32.5,2.1,1.6,160,cereal|arroz\n`);
    const sql = buildSql(rows);
    expect(sql.startsWith('insert into public.foods (')).toBe(true);
    expect(sql).toContain("('tcac:A009', 'Arroz blanco cocido'");
    expect(sql.trimEnd()).toMatch(/on conflict \(id\) do update set[\s\S]*name_es_auto = excluded\.name_es_auto;$/);
    expect(sql).not.toContain('id = excluded.id');
  });
});
