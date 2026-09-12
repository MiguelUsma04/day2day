import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';

const ITEM_HEIGHT = 44;
/** Rows visible above and below the selection, which sets the wheel height. */
const PADDING_ROWS = 1;
const WHEEL_HEIGHT = ITEM_HEIGHT * (PADDING_ROWS * 2 + 1);

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ['AM', 'PM'] as const;

type Period = (typeof PERIODS)[number];

type Props = {
  value: number | null;
  onChange: (minutes: number | null) => void;
};

/** Minutes since midnight -> the three wheel positions. */
function toParts(minutes: number): { hour: number; minute: number; period: Period } {
  const h24 = Math.floor(minutes / 60) % 24;
  return {
    hour: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: minutes % 60,
    period: h24 >= 12 ? 'PM' : 'AM',
  };
}

function toMinutes(hour: number, minute: number, period: Period): number {
  const base = hour % 12;
  const h24 = period === 'PM' ? base + 12 : base;
  return h24 * 60 + minute;
}

type WheelProps<T> = {
  items: T[];
  selected: T;
  onSelect: (item: T) => void;
  format: (item: T) => string;
  label: string;
  width: number;
};

/**
 * Snap-scrolling wheel. Selection follows the row resting in the centre band,
 * which is how the native iOS picker behaves and needs no extra dependency.
 */
function Wheel<T extends string | number>({
  items,
  selected,
  onSelect,
  format,
  label,
  width,
}: WheelProps<T>) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  const lastReported = useRef(selected);

  const index = Math.max(0, items.indexOf(selected));

  // Follow external changes (e.g. opening the editor on an existing task).
  useEffect(() => {
    if (lastReported.current === selected) return;
    lastReported.current = selected;
    ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  }, [selected, index]);

  // Position the wheel on mount without animating.
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false }), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = event.nativeEvent.contentOffset.y / ITEM_HEIGHT;
      const next = items[Math.min(items.length - 1, Math.max(0, Math.round(raw)))];
      if (next === undefined || next === lastReported.current) return;
      lastReported.current = next;
      void Haptics.selectionAsync();
      onSelect(next);
    },
    [items, onSelect],
  );

  return (
    <View style={{ width }} accessibilityLabel={label}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        // Momentum fires on native; the plain scroll end covers web.
        onMomentumScrollEnd={commit}
        onScrollEndDrag={commit}
        scrollEventThrottle={16}
        style={{ height: WHEEL_HEIGHT }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * PADDING_ROWS }}
      >
        {items.map((item) => {
          const active = item === selected;
          return (
            <Pressable
              key={String(item)}
              onPress={() => {
                if (item === selected) return;
                lastReported.current = item;
                void Haptics.selectionAsync();
                onSelect(item);
                ref.current?.scrollTo({ y: items.indexOf(item) * ITEM_HEIGHT, animated: true });
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={format(item)}
              style={styles.item}
            >
              <Text
                style={[
                  styles.itemText,
                  {
                    color: active ? colors.foreground : colors.mutedForeground,
                    fontFamily: active ? fontFamily.bold : fontFamily.regular,
                  },
                ]}
              >
                {format(item)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function TimePicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const parts = toParts(value ?? 8 * 60);
  const [draft, setDraft] = useState(parts);

  // Keep the wheels in step when the value changes from outside.
  useEffect(() => {
    if (value === null) return;
    setDraft(toParts(value));
  }, [value]);

  const update = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(toMinutes(next.hour, next.minute, next.period));
  };

  const enabled = value !== null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(enabled ? null : toMinutes(draft.hour, draft.minute, draft.period));
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: !enabled }}
        accessibilityLabel="Sin hora definida"
        style={({ pressed }) => [
          styles.toggle,
          {
            backgroundColor: enabled ? 'transparent' : colors.muted,
            borderColor: enabled ? colors.border : colors.primary,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.toggleText,
            { color: enabled ? colors.mutedForeground : colors.foreground },
          ]}
        >
          Sin hora definida
        </Text>
      </Pressable>

      {enabled ? (
        <View
          style={[
            styles.wheels,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <View style={styles.wheelGroup}>
            {/* Centre band marks the active row without relying on text weight alone. */}
            <View
              pointerEvents="none"
              style={[
                styles.selectionBand,
                { backgroundColor: colors.surface, borderColor: colors.primary },
              ]}
            />

            <Wheel
              items={HOURS}
              selected={draft.hour}
              onSelect={(hour) => update({ hour })}
              format={(h) => String(h)}
              label="Hora"
              width={58}
            />
            <Text style={[styles.separator, { color: colors.foreground }]}>:</Text>
            <Wheel
              items={MINUTES}
              selected={draft.minute}
              onSelect={(minute) => update({ minute })}
              format={(m) => String(m).padStart(2, '0')}
              label="Minutos"
              width={58}
            />
          </View>
          <View style={styles.periods}>
            {PERIODS.map((p) => {
              const active = p === draft.period;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    if (active) return;
                    void Haptics.selectionAsync();
                    update({ period: p });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={p}
                  style={({ pressed }) => [
                    styles.period,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: pressed && !active ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.periodText,
                      { color: active ? colors.onPrimary : colors.mutedForeground },
                    ]}
                  >
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
  },
  wheelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // Anchors the selection band to the wheels alone.
    position: 'relative',
  },
  selectionBand: {
    position: 'absolute',
    left: -spacing.xs,
    right: -spacing.xs,
    top: ITEM_HEIGHT * PADDING_ROWS,
    height: ITEM_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  item: {
    height: ITEM_HEIGHT,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: fontSize.callout,
    // Tabular figures keep the columns from shifting as digits change.
    ...Platform.select({ web: { fontVariant: ['tabular-nums'] }, default: {} }),
  },
  separator: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.callout,
    marginTop: -2,
  },
  periods: { gap: spacing.xs, marginLeft: spacing.lg },
  period: {
    width: 54,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
});
