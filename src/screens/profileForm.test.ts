import { describe, expect, it } from 'vitest';

import { defaultRateFor, formatRate, profileDraftIsValid } from './profileForm';

describe('profileForm', () => {
  it('defaults the rate per goal', () => {
    expect(defaultRateFor('lose_fat')).toBe(-0.5);
    expect(defaultRateFor('maintain')).toBe(0);
    expect(defaultRateFor('gain_muscle')).toBe(0.15);
  });
  it('requires sex, a valid birth date and a positive height', () => {
    expect(profileDraftIsValid({ sex: 'male', birthDate: '2003-05-01', heightCm: 168 })).toBe(true);
    expect(profileDraftIsValid({ sex: null, birthDate: '2003-05-01', heightCm: 168 })).toBe(false);
    expect(profileDraftIsValid({ sex: 'male', birthDate: '2003-02-30', heightCm: 168 })).toBe(false);
    expect(profileDraftIsValid({ sex: 'male', birthDate: '2003-05-01', heightCm: 0 })).toBe(false);
  });
  it('formats the weekly rate with comma and sign', () => {
    expect(formatRate(-0.5)).toBe('−0,50 kg/semana');
    expect(formatRate(0.15)).toBe('+0,15 kg/semana');
    expect(formatRate(0)).toBe('0,00 kg/semana');
  });
});
