import { describe, expect, it } from 'vitest';
import {
  buildSql,
  filterFood,
  pickNutrients,
  rankAndCap,
  rowToSql,
  selectFoods,
  translateBatch,
} from './build-usda-sql.mjs';

const okResponse = (arr) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: 'text', text: typeof arr === 'string' ? arr : JSON.stringify(arr) }] }),
  text: async () => '',
});

describe('filterFood', () => {
  it('acepta pollo de una categoría permitida', () => {
    const f = { description: 'Chicken, broilers or fryers, breast, meat only, roasted' };
    expect(filterFood(f, 'Poultry Products')).toBe(true);
    expect(filterFood({ description: 'Lamb, leg, roasted' }, 'Lamb, Veal, and Game Products')).toBe(true);
  });

  it('rechaza descripciones de comida para bebé o restaurante', () => {
    expect(filterFood({ description: 'Babyfood, cereal, oatmeal' }, 'Breakfast Cereals')).toBe(false);
    expect(filterFood({ description: 'Restaurant, Chinese, rice' }, 'Cereal Grains and Pasta')).toBe(false);
    expect(filterFood({ description: 'Milk, USDA Commodity' }, 'Dairy and Egg Products')).toBe(false);
  });

  it('rechaza categorías fuera de la lista', () => {
    expect(filterFood({ description: 'Burger' }, 'Fast Foods')).toBe(false);
    expect(filterFood({ description: 'Soup' }, 'Soups, Sauces, and Gravies')).toBe(false);
  });
});

describe('pickNutrients', () => {
  it('mapea los 5 nutrientes', () => {
    expect(pickNutrients({ 1008: '165', 1003: '31', 1005: '0', 1004: '3.6', 1079: '1.2' })).toEqual({
      kcal: 165,
      protein_g: 31,
      carbs_g: 0,
      fat_g: 3.6,
      fiber_g: 1.2,
    });
  });

  it('devuelve null para lo que falta', () => {
    const n = pickNutrients({ 1008: '100', 1003: '1', 1005: '2', 1004: '3' });
    expect(n.fiber_g).toBeNull();
    expect(pickNutrients({}).kcal).toBeNull();
  });
});

describe('selectFoods', () => {
  it('cruza tablas y omite alimentos sin kcal', () => {
    const foods = selectFoods({
      categoryCsv: 'id,code,description\n5,0500,Poultry Products\n9,0900,Fast Foods\n',
      foodCsv:
        'fdc_id,data_type,description,food_category_id,publication_date\n1,sr_legacy_food,Chicken breast,5,2019\n2,sr_legacy_food,Burger,9,2019\n3,sr_legacy_food,Chicken no kcal,5,2019\n',
      nutrientCsv:
        'id,fdc_id,nutrient_id,amount\n1,1,1008,165\n2,1,1003,31\n3,2,1008,300\n4,3,1003,10\n',
    });
    expect(foods).toEqual([
      { fdc_id: '1', description: 'Chicken breast', kcal: 165, protein_g: 31, carbs_g: null, fat_g: null, fiber_g: null },
    ]);
  });
});

describe('rankAndCap', () => {
  const mk = (id, description) => ({ fdc_id: String(id), description });
  it('deja los nombres más cortos y respeta el tope', () => {
    const out = rankAndCap([mk(3, 'Beef, long name here'), mk(2, 'Lard'), mk(1, 'Miso'), mk(4, 'Milk, whole')], 3);
    expect(out.map((f) => f.description)).toEqual(['Miso', 'Lard', 'Milk, whole']);
  });
});

describe('rowToSql', () => {
  it('escapa comillas y fija id, verified y name_es_auto', () => {
    const sql = rowToSql({
      fdc_id: '99',
      name_es: "Leche d'vaca",
      name_en: "Milk, cow's",
      kcal: 61,
      protein_g: 3.2,
      carbs_g: 4.8,
      fat_g: 3.3,
      fiber_g: null,
    });
    expect(sql).toContain(`'usda:99'`);
    expect(sql).toContain(`'Leche d''vaca'`);
    expect(sql).toContain(`'Milk, cow''s'`);
    expect(sql).toContain(`'usda', '99', 61, 3.2, 4.8, 3.3, null, null, '{}', false, true)`);
  });

  it('buildSql rechaza ids duplicados', () => {
    const r = { fdc_id: '1', name_es: 'a', name_en: 'a', kcal: 1 };
    expect(() => buildSql([r, r])).toThrow(/duplicado/);
  });
});

describe('translateBatch', () => {
  it('devuelve las traducciones cuando el arreglo es válido', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return okResponse(['Pechuga de pollo', 'Manteca']);
    };
    const out = await translateBatch(['Chicken breast', 'Lard'], 'k', fetchImpl);
    expect(out).toEqual(['Pechuga de pollo', 'Manteca']);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].init.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(calls[0].init.body).model).toBe('claude-haiku-5-5');
  });

  it('reintenta una vez y falla si el largo sigue mal', async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      return okResponse(['solo uno']);
    };
    await expect(translateBatch(['a', 'b'], 'k', fetchImpl)).rejects.toThrow(/inválida/);
    expect(n).toBe(2);
  });

  it('se recupera si el reintento sí es válido', async () => {
    let n = 0;
    const fetchImpl = async () => okResponse(n++ === 0 ? 'no es json' : ['uno']);
    expect(await translateBatch(['a'], 'k', fetchImpl)).toEqual(['uno']);
  });
});
