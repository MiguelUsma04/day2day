import React from 'react';
import { Text } from 'react-native';

import { slotLabel } from '../../lib/nutrition/format';
import { useTheme } from '../../theme/ThemeProvider';
import type { Meal, MealSlot, UserPortion } from '../../types/nutrition';
import { PrimaryButton, Sheet } from './Sheet';

export type MealEditorMode = 'photo' | 'text' | 'edit';

export type MealEditorProps = {
  visible: boolean;
  mode: MealEditorMode;
  date: string;
  slot: MealSlot;
  meal?: Meal;
  portions: UserPortion[];
  recentFoods: string[];
  onSave(meal: Omit<Meal, 'id' | 'createdAt' | 'updatedAt'> | Meal): void;
  onClose(): void;
  onRememberPortion(foodKey: string, grams: number): void;
};

const TITLES: Record<MealEditorMode, string> = {
  photo: 'Comida por foto',
  text: 'Comida por texto',
  edit: 'Editar comida',
};

/** Placeholder until Task 14 brings the real editor; it only shows what it was opened for. */
export function MealEditor({ visible, mode, slot, meal, onClose }: MealEditorProps) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} title={TITLES[mode]} onClose={onClose} footer={<PrimaryButton label="Cerrar" onPress={onClose} />}>
      <Text style={{ color: colors.mutedForeground }}>
        {meal ? meal.title || slotLabel(meal.slot) : slotLabel(slot)} · el editor llega pronto.
      </Text>
    </Sheet>
  );
}
