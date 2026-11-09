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
    'Reporta el resultado SIEMPRE con la herramienta report_meal.',
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
    '- confidence entre 0 y 1 según qué tan seguro estás de los gramos.',
    '- question: como máximo UNA pregunta, y solo si la duda es sobre un ítem que pesa más del 15 % del total estimado (gramos × densidad típica) y la respuesta cambia mucho la estimación. Si no, omítela.',
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
  'Responde SIEMPRE con la herramienta choose_foods, con exactamente una elección por ítem (itemIndex = index).',
  '- foodId debe ser uno de los id de los candidatos de ESE ítem. Respeta la preparación (cocido vs crudo, frito vs asado).',
  '- Si ningún candidato corresponde razonablemente, usa foodId: null y da estimate con kcal, protein_g, carbs_g y fat_g POR 100 g del alimento tal como se comió.',
  '- No des estimate cuando eliges un foodId.',
].join('\n');

export const reportMealTool = {
  name: 'report_meal',
  description: 'Reporta los alimentos de la comida con sus gramos estimados (nunca calorías).',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            name_es: { type: 'string', description: 'Nombre en español colombiano.' },
            name_en: { type: 'string', description: 'Nombre simple en inglés.' },
            cooking: { type: ['string', 'null'], description: 'Preparación: frito, cocido, asado… o null.' },
            grams: { type: 'number', description: 'Gramos estimados de la porción visible.' },
            grams_min: { type: 'number' },
            grams_max: { type: 'number' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            is_hidden_fat: { type: 'boolean', description: 'true solo para grasa de cocción separada.' },
            search_terms: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
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
        type: 'object',
        description: 'Opcional. Una sola pregunta, solo si el ítem dudoso pesa más del 15 % del total estimado.',
        properties: {
          item_index: { type: 'integer', minimum: 0 },
          text: { type: 'string' },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                grams_multiplier: { type: 'number', exclusiveMinimum: 0, maximum: 5 },
              },
              required: ['label', 'grams_multiplier'],
            },
          },
        },
        required: ['item_index', 'text', 'options'],
      },
    },
    required: ['items'],
  },
} as const;

export const chooseFoodsTool = {
  name: 'choose_foods',
  description: 'Elige la fila de la tabla para cada ítem, o estima por 100 g si ninguna corresponde.',
  input_schema: {
    type: 'object',
    properties: {
      choices: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            itemIndex: { type: 'integer', minimum: 0 },
            foodId: { type: ['string', 'null'], description: 'id de un candidato del ítem, o null.' },
            estimate: {
              type: 'object',
              description: 'Obligatorio si foodId es null. Valores por 100 g.',
              properties: {
                kcal: { type: 'number' },
                protein_g: { type: 'number' },
                carbs_g: { type: 'number' },
                fat_g: { type: 'number' },
              },
              required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
            },
          },
          required: ['itemIndex', 'foodId'],
        },
      },
    },
    required: ['choices'],
  },
} as const;
