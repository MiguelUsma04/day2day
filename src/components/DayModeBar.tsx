import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isWeekend } from '../storage/dayModes';
import { Ionicons, type IconName } from '../theme/Ionicons';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';
import type { DayMode, ResolvedDayMode } from '../types/task';
import * as Haptics from '../utils/haptics';

/**
 * Single-choice switch for how the selected day is spent.
 *
 * Weekends choose between city and farm, which swap the routine shown.
 * Weekdays choose between a normal day and a holiday, which empties the day
 * without hurting the streak. Picking the default clears the mark instead of
 * storing it, so only exceptions are kept.
 */

type Option = { value: DayMode | null; mode: ResolvedDayMode; label: string; icon: IconName };

const WEEKEND: Option[] = [
  { value: null, mode: 'city', label: 'Ciudad', icon: 'business-outline' },
  { value: 'farm', mode: 'farm', label: 'Finca', icon: 'leaf-outline' },
];

const WEEKDAY: Option[] = [
  { value: null, mode: 'normal', label: 'Normal', icon: 'calendar-outline' },
  { value: 'holiday', mode: 'holiday', label: 'Festivo', icon: 'flag-outline' },
];

export const DAY_MODE_LABEL: Record<ResolvedDayMode, string> = {
  normal: 'Día normal',
  city: 'Día de ciudad',
  farm: 'Día de finca',
  holiday: 'Día festivo',
};

type Props = {
  dayKey: string;
  mode: ResolvedDayMode;
  onChange: (mode: DayMode | null) => void;
};

export function DayModeBar({ dayKey, mode, onChange }: Props) {
  const { colors } = useTheme();
  const weekend = isWeekend(dayKey);
  // A weekend can also be a holiday in the data (e.g. synced from an older
  // mark); show it as its own choice so the state is never hidden.
  const options =
    weekend && mode === 'holiday' ? [...WEEKEND, WEEKDAY[1]] : weekend ? WEEKEND : WEEKDAY;

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        {weekend ? '¿Dónde pasas este día?' : '¿Es festivo?'}
      </Text>
      <View style={[styles.group, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        {options.map((opt) => {
          const active = opt.mode === mode;
          const tint =
            opt.mode === 'holiday'
              ? colors.destructive
              : opt.mode === 'farm'
                ? colors.accent
                : colors.primary;
          return (
            <Pressable
              key={opt.label}
              onPress={() => {
                if (active) return;
                void Haptics.selectionAsync();
                onChange(opt.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={DAY_MODE_LABEL[opt.mode]}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: active ? colors.surface : 'transparent',
                  borderColor: active ? tint : 'transparent',
                  opacity: pressed && !active ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name={opt.icon} size={14} color={active ? tint : colors.mutedForeground} />
              <Text
                style={[
                  styles.optionText,
                  {
                    color: active ? tint : colors.mutedForeground,
                    fontFamily: active ? fontFamily.semibold : fontFamily.medium,
                  },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, flexShrink: 1 },
  group: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  optionText: { fontSize: fontSize.caption },
});
