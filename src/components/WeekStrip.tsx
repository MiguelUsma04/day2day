import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import { addDays, dayShort, isSameDay, toDayKey } from '../utils/date';

const DAY_WIDTH = 52;
const DAY_HEIGHT = 72;
const GAP = spacing.sm;
/** Two weeks back, six forward — enough to plan ahead without an endless rail. */
const RANGE_BACK = 14;
const RANGE_FORWARD = 45;

type Props = {
  selected: Date;
  onSelect: (date: Date) => void;
  /** Day keys that have at least one task, for the dot indicator. */
  markedDays: Set<string>;
};

export function WeekStrip({ selected, onSelect, markedDays }: Props) {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const days = useMemo(() => {
    const today = new Date();
    const result: Date[] = [];
    for (let i = -RANGE_BACK; i <= RANGE_FORWARD; i += 1) {
      result.push(addDays(today, i));
    }
    return result;
  }, []);

  const selectedIndex = days.findIndex((d) => isSameDay(d, selected));

  // Keep the active day centred when it changes from outside (e.g. the "Hoy" button).
  useEffect(() => {
    if (selectedIndex < 0) return;
    const offset = selectedIndex * (DAY_WIDTH + GAP) - DAY_WIDTH * 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: true });
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
    >
      {days.map((day) => {
        const key = toDayKey(day);
        const active = isSameDay(day, selected);
        const today = isSameDay(day, new Date());
        const marked = markedDays.has(key);

        return (
          <Pressable
            key={key}
            onPress={() => {
              void Haptics.selectionAsync();
              onSelect(day);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${dayShort(day)} ${day.getDate()}`}
            style={({ pressed }) => [
              styles.day,
              {
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
                opacity: pressed && !active ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.dayName,
                { color: active ? colors.onPrimary : colors.mutedForeground },
              ]}
            >
              {dayShort(day)}
            </Text>
            <Text
              style={[
                styles.dayNumber,
                { color: active ? colors.onPrimary : colors.foreground },
              ]}
            >
              {day.getDate()}
            </Text>

            {/* Dot doubles as the "today" marker, so state never rests on colour alone. */}
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: marked
                    ? active
                      ? colors.onPrimary
                      : colors.primary
                    : 'transparent',
                  borderWidth: today && !marked ? 1.5 : 0,
                  borderColor: active ? colors.onPrimary : colors.primary,
                },
              ]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Fixed height stops the strip from claiming the list's vertical space.
  strip: { flexGrow: 0, flexShrink: 0, height: DAY_HEIGHT + spacing.sm * 2 },
  content: {
    paddingHorizontal: spacing.lg,
    gap: GAP,
    paddingVertical: spacing.sm,
    // Without this the web ScrollView stretches each day to the full track height.
    alignItems: 'flex-start',
  },
  day: {
    width: DAY_WIDTH,
    height: DAY_HEIGHT,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: 2,
  },
  dayName: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
  },
  dayNumber: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.callout,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginTop: 2,
  },
});
