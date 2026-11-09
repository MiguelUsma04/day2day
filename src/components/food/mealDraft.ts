import AsyncStorage from '@react-native-async-storage/async-storage';

import { MEAL_SLOTS, type MealSlot } from '../../types/nutrition';

/** A meal whose analysis was started but never saved (e.g. the app closed mid-analysis). */
export type MealDraft = { date: string; slot: MealSlot; note: string; mode: 'photo' | 'text' };

export const MEAL_DRAFT_KEY = 'day2day:mealDraft:v1';

export async function saveMealDraft(draft: MealDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(MEAL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Best effort: losing a draft is not worth interrupting the analysis.
  }
}

export async function readMealDraft(): Promise<MealDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(MEAL_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<MealDraft>;
    if (typeof d.date !== 'string' || !MEAL_SLOTS.includes(d.slot as MealSlot)) return null;
    return {
      date: d.date,
      slot: d.slot as MealSlot,
      note: typeof d.note === 'string' ? d.note : '',
      mode: d.mode === 'photo' ? 'photo' : 'text',
    };
  } catch {
    return null;
  }
}

export async function clearMealDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MEAL_DRAFT_KEY);
  } catch {
    // ignore
  }
}
