import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { slotLabel } from '../../lib/nutrition/format';
import { Ionicons } from '../../theme/Ionicons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../../theme/tokens';
import type { MealSlot } from '../../types/nutrition';
import { formatTime } from '../../utils/date';
import { SLOT_ICONS } from './MealRow';

type Props = {
  slot: MealSlot;
  minutes: number;
  onPress: (slot: MealSlot) => void;
  readOnly?: boolean;
};

/** Dimmed placeholder for a meal slot with nothing logged that day. */
export function EmptySlotRow({ slot, minutes, onPress, readOnly = false }: Props) {
  const { colors } = useTheme();
  const label = `${slotLabel(slot)} · sin registrar`;
  return (
    <Pressable
      onPress={() => onPress(slot)}
      disabled={readOnly}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={readOnly ? undefined : 'Toca para registrar'}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border, opacity: pressed && !readOnly ? 0.4 : 0.6 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.muted }]}>
        <Ionicons name={SLOT_ICONS[slot]} size={18} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatTime(minutes)}</Text>
      <Text numberOfLines={1} style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      {readOnly ? null : <Ionicons name="add" size={18} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  time: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, width: 64 },
  label: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
});
