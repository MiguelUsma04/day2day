import React, { useMemo, useRef, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';
import { formatTime } from '../utils/date';

const STEP = 15;
const SLOT_WIDTH = 88;

type Props = {
  value: number | null;
  onChange: (minutes: number | null) => void;
};

/**
 * Horizontal time rail in 15-minute steps. A wheel picker would be more precise,
 * but routine times land on quarter hours and a rail keeps the sheet one screen tall.
 */
export function TimePicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const slots = useMemo(() => {
    const result: number[] = [];
    for (let m = 0; m < 24 * 60; m += STEP) result.push(m);
    return result;
  }, []);

  useEffect(() => {
    if (value === null) return;
    const index = Math.round(value / STEP);
    scrollRef.current?.scrollTo({ x: Math.max(0, index * SLOT_WIDTH - SLOT_WIDTH), animated: false });
  }, [value]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(value === null ? 8 * 60 : null);
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: value !== null }}
        style={[
          styles.toggle,
          {
            backgroundColor: value === null ? colors.muted : 'transparent',
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.toggleText,
            { color: value === null ? colors.foreground : colors.mutedForeground },
          ]}
        >
          Sin hora definida
        </Text>
      </Pressable>

      {value !== null ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {slots.map((m) => {
            const active = m === value;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChange(m);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={formatTime(m)}
                style={[
                  styles.slot,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.slotText,
                    { color: active ? colors.onPrimary : colors.foreground },
                  ]}
                >
                  {formatTime(m)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  toggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  toggleText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  rail: { gap: spacing.sm, paddingVertical: spacing.xs },
  slot: {
    width: SLOT_WIDTH,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
});
