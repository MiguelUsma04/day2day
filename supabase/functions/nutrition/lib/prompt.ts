/**
 * Prompts and tool schemas for the two Claude calls. The model is asked for
 * grams only; energy and macros come from the food tables (see match.ts).
 * The prompt text is Spanish because the model must answer in Colombian
 * Spanish and the food names are matched against Spanish rows.
 */

import type { AnalyzeRequest } from './schema.ts';

export function systemPrompt(hints: AnalyzeRequest['hints']): string {
  const lines = [
    'Eres un nutricionista colombiano que estima porciones de comida a partir de una foto y/o una nota.',
    'Responde ÚNICAMENTE llamando a la herramienta report_meal, nunca con texto.',
    '',
    'Reglas:',
    '- Estima en gramos la porción VISIBLE de cada alimento (o la descrita en la nota), con un rango grams_min–grams_max honesto.',
    '- NUNCA estimes calorías ni macronutrientes: solo nombres y gramos. Las calorías se calculan después con una tabla de alimentos.',
    '- No uses porciones estándar ni "una porción típica": estima lo que realmente se ve.',
    '- Usa objetos de referencia para la escala (plato, cubiertos, vaso, mano, empaque) cuando aparezcan.',
    '- Separa cada alimento en su propio ítem (arroz, fríjoles, carne, ensalada, bebida…).',
    '- La grasa de cocción (aceite de fritura, mantequilla, hogao con aceite) va como ítem aparte con is_hidden_fat: true y sus propios gramos estimados; no la sumes al alimento.',
    '- Contexto colombiano: arroz, arepa, patacón, fríjoles, sudado, sopas, bandeja paisa, jugos naturales que casi siempre llevan azúcar (si es jugo, agrega el azúcar como ítem aparte salvo que la nota diga lo contrario).',
    '- Nombres en español colombiano (name_es) y su traducción simple al inglés (name_en). En cooking indica la preparación (frito, cocido, asado, guisado, crudo…) o null.',
    '- search_terms: 2 o 3 términos en español simple para buscar el alimento en una tabla (ej. "arroz blanco cocido", "arroz blanco"). Sin marcas ni adjetivos innecesarios.',
    '- Entre 1 y 20 ítems; gramos entre 1 y 2000.',
    '- confidence entre 0 y 1 según qué tan seguro estás de los gramos.',
    '- question: como máximo UNA pregunta, y solo si la duda es sobre un ítem que pesa más del 15 % del total estimado (gramos × densidad típica) y la respuesta cambia mucho la estimación. Si no, usa question: null.',
    '- La pregunta tiene de 2 a 4 opciones; cada una con grams_multiplier relativo a los gramos que ya reportaste para ese ítem (ej. 0.5, 1, 1.5). item_index es la posición del ítem en items.',
  ];

  if (hints.portions.length) {
    lines.push('', 'Porciones habituales de esta persona (úsalas si el alimento coincide y la foto no lo contradice):');
    for (const p of hints.portions) lines.push(`- ${p.name}: ${p.grams} g`);
  }
  if (hints.recentFoods.length) {
    lines.push('', 'Alimentos que registra seguido (prefiere estos nombres si coinciden):');
    lines.push(hints.recentFoods.map((f) => `- ${f}`).join('\n'));
  }
  return lines.join('\n');
}

export function userText(req: AnalyzeRequest): string {
  const slotEs = { breakfast: 'desayuno', lunch: 'almuerzo', snack: 'algo / merienda', dinner: 'cena' }[req.slot];
  const parts = [`Comida: ${slotEs} del ${req.date}.`];
  if (req.image) parts.push('Analiza la foto.');
  if (req.note) parts.push(`Nota de la persona: """${req.note}"""`);
  return parts.join('\n');
}

export const CHOICE_SYSTEM = [
  'Eliges, para cada alimento reportado, la fila de la tabla de alimentos que mejor le corresponde.',
  'Responde ÚNICAMENTE llamando a la herramienta choose_foods, nunca con texto, con exactamente una elección por ítem (itemIndex = index).',
  '- foodId debe ser uno de los id de los candidatos de ESE ítem. Respeta la preparación (cocido vs crudo, frito vs asado).',
  '- Si ningún candidato corresponde razonablemente, usa foodId: null y da estimate con kcal, protein_g, carbs_g y fat_g POR 100 g del alimento tal como se comió (kcal entre 0 y 900; la suma de macros no pasa de 100 g).',
  '- Cuando eliges un foodId, usa estimate: null.',
].join('\n');

/**
 * Both tools are `strict: true`, so their schemas stick to the strict subset:
 * `additionalProperties: false` and a full `required` list on every object,
 * optional fields as nullable types, and no numeric or array-size keywords.
 * Those bounds live in the descriptions and are enforced again in schema.ts.
 */
export const reportMealTool = {
  name: 'report_meal',
  description: 'Reporta los alimentos de la comida con sus gramos estimados (nunca calorías).',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        description: 'Entre 1 y 20 ítems.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name_es: { type: 'string', description: 'Nombre en español colombiano.' },
            name_en: { type: 'string', description: 'Nombre simple en inglés.' },
            cooking: { type: ['string', 'null'], description: 'Preparación: frito, cocido, asado… o null.' },
            grams: { type: 'number', description: 'Gramos estimados de la porción visible (1 a 2000).' },
            grams_min: { type: 'number' },
            grams_max: { type: 'number' },
            confidence: { type: 'number', description: 'Entre 0 y 1.' },
            is_hidden_fat: { type: 'boolean', description: 'true solo para grasa de cocción separada.' },
            search_terms: {
              type: 'array',
              items: { type: 'string' },
              description: '2 o 3 términos en español simple para buscar en la tabla.',
            },
          },
          required: [
            'name_es', 'name_en', 'cooking', 'grams', 'grams_min', 'grams_max',
            'confidence', 'is_hidden_fat', 'search_terms',
          ],
        },
      },
      question: {
        type: ['object', 'null'],
        description: 'null salvo que haga falta. Una sola pregunta, solo si el ítem dudoso pesa más del 15 % del total estimado.',
        additionalProperties: false,
        properties: {
          item_index: { type: 'integer', description: 'Posición del ítem en items (desde 0).' },
          text: { type: 'string' },
          options: {
            type: 'array',
            description: 'De 2 a 4 opciones.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                grams_multiplier: { type: 'number', description: 'Mayor que 0 y hasta 5.' },
              },
              required: ['label', 'grams_multiplier'],
            },
          },
        },
        required: ['item_index', 'text', 'options'],
      },
    },
    required: ['items', 'question'],
  },
} as const;

export const chooseFoodsTool = {
  name: 'choose_foods',
  description: 'Elige la fila de la tabla para cada ítem, o estima por 100 g si ninguna corresponde.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      choices: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            itemIndex: { type: 'integer', description: 'index del ítem (desde 0).' },
            foodId: { type: ['string', 'null'], description: 'id de un candidato del ítem, o null.' },
            estimate: {
              type: ['object', 'null'],
              description: 'Obligatorio si foodId es null; null si eliges un foodId. Valores por 100 g.',
              additionalProperties: false,
              properties: {
                kcal: { type: 'number' },
                protein_g: { type: 'number' },
                carbs_g: { type: 'number' },
                fat_g: { type: 'number' },
              },
              required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
            },
          },
          required: ['itemIndex', 'foodId', 'estimate'],
        },
      },
    },
    required: ['choices'],
  },
} as const;
