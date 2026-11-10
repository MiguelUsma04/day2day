import { describe, expect, it } from 'vitest';

import { coachAdvice, minutesToBurn } from './coach';

const target = { kcal: 1418, proteinG: 106 };
const base = { target, weightKg: 59, nowMinutes: 15 * 60, mealsLogged: 3 };

describe('coachAdvice', () => {
  it('is silent without a target or without meals', () => {
    const eaten = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    expect(coachAdvice({ ...base, eaten, target: null }).kind).toBe('none');
    expect(coachAdvice({ ...base, eaten, mealsLogged: 0 }).kind).toBe('none');
  });

  it('suggests protein that fits the remaining kcal', () => {
    const eaten = { kcal: 1221, proteinG: 64, carbsG: 165, fatG: 33 };
    const advice = coachAdvice({ ...base, eaten });
    expect(advice.kind).toBe('eat');
    if (advice.kind !== 'eat') return;
    expect(advice.remainingKcal).toBe(197);
    expect(advice.remainingProteinG).toBe(42);
    expect(advice.options.length).toBeGreaterThan(0);
    for (const o of advice.options) expect(o.kcal).toBeLessThanOrEqual(197 + 25);
    expect(advice.options.some((o) => o.label.includes('pollo'))).toBe(true);
    expect(advice.options[0].coversProtein).toBe(true);
    expect(advice.options[0].proteinG).toBeGreaterThanOrEqual(39);
    // Servings stay realistic: no 12-egg-white dinners.
    for (const o of advice.options) expect(o.label).not.toMatch(/^(1[0-9]|[5-9]) (huevos|claras)/);
  });

  it('switches to light foods once protein is covered', () => {
    const eaten = { kcal: 1100, proteinG: 104, carbsG: 100, fatG: 30 };
    const advice = coachAdvice({ ...base, eaten });
    expect(advice.kind).toBe('eat');
    if (advice.kind !== 'eat') return;
    expect(advice.options.every((o) => o.proteinG === 0)).toBe(true);
    expect(advice.note).toContain('Proteína cumplida');
  });

  it('calls the day done inside the tolerance', () => {
    const eaten = { kcal: 1380, proteinG: 100, carbsG: 100, fatG: 30 };
    expect(coachAdvice({ ...base, eaten }).kind).toBe('done');
  });

  it('turns an excess into minutes of movement', () => {
    const eaten = { kcal: 1700, proteinG: 90, carbsG: 100, fatG: 30 };
    const advice = coachAdvice({ ...base, eaten });
    expect(advice.kind).toBe('burn');
    if (advice.kind !== 'burn') return;
    expect(advice.excessKcal).toBe(282);
    expect(advice.options[0].label).toBe('saltar la cuerda');
    expect(advice.options[0].minutes).toBe(30);
  });
});

it('minutesToBurn rounds up to five', () => {
  // (11 - 1) * 59 / 60 = 9.83 kcal/min -> 200 kcal = 20.3 min -> 25
  expect(minutesToBurn(200, 11, 59)).toBe(25);
  expect(minutesToBurn(10, 4.3, 59)).toBe(5);
});
