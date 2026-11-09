import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { formatNumber, slotLabel } from '../../lib/nutrition/format';
import { mealKcalRange, mealTotals } from '../../lib/nutrition/mealMath';
import { Ionicons } from '../../theme/Ionicons';
import type { IconName } from '../../theme/icons';
import { shadow } from '../../theme/shadows';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../../theme/tokens';
import type { Meal, MealSlot } from '../../types/nutrition';
import { formatTime } from '../../utils/date';
import * as Haptics from '../../utils/haptics';

/** Same feel as TaskCard: travel before the delete commits, and the slop before the swipe wins over scroll. */
const THRESHOLD = 78;
const ACTIVATION = 12;

export const SLOT_ICONS: Record<MealSlot, IconName> = {
  breakfast: 'cafe-outline',
  lunch: 'restaurant-outline',
  snack: 'nutrition-outline',
  dinner: 'moon-outline',
};

type Props = {
  meal: Meal;
  onPress: (meal: Meal) => void;
  /** Asks for confirmation; the row only reports the swipe. */
  onDelete: (meal: Meal) => void;
  readOnly?: boolean;
};

export function MealRow({ meal, onPress, onDelete, readOnly = false }: Props) {
  const { colors, isDark } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const committed = useRef(false);
  const swiping = useRef(false);

  const totals = mealTotals(meal);
  const estimated = meal.items.some((i) => !i.weighed);
  const range = estimated ? mealKcalRange(meal) : null;
  const spread = range ? Math.round((range.max - range.min) / 2) : 0;

  const springBack = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [translateX]);

  // Left swipe deletes; right swipe is reserved for "favorite" in a later phase, so it is clamped.
  const pan = Gesture.Pan()
    .enabled(!readOnly)
    .activeOffsetX([-ACTIVATION, ACTIVATION])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      committed.current = false;
    })
    .onUpdate((event) => {
      const x = Math.min(0, event.translationX);
      // Raw translation, not the clamped one: a rightward drag must also swallow the tap that follows.
      if (Math.abs(event.translationX) > 4) swiping.current = true;
      translateX.setValue(x);
      if (!committed.current && -x >= THRESHOLD) {
        committed.current = true;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (committed.current && -x < THRESHOLD) {
        committed.current = false;
      }
    })
    .onEnd((event) => {
      if (event.translationX <= -THRESHOLD) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDelete(meal);
      }
      springBack();
    })
    .onFinalize(() => {
      springBack();
      // Clear after the click that follows pointer-up has been dispatched.
      setTimeout(() => {
        swiping.current = false;
      }, 120);
    })
    .runOnJS(true);

  const deleteOpacity = translateX.interpolate({
    inputRange: [-THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const title = meal.title.trim() || slotLabel(meal.slot);

  return (
    <View style={styles.container}>
      <Animated.View
        pointerEvents="none"
        style={[styles.action, { backgroundColor: colors.destructive, opacity: deleteOpacity }]}
      >
        <Text style={styles.actionText}>Eliminar</Text>
        <Ionicons name="trash" size={20} color="#FFFFFF" />
      </Animated.View>

      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View style={{ transform: [{ translateX }] }}>
          <Pressable
            onPress={() => {
              if (readOnly || swiping.current) return;
              onPress(meal);
            }}
            disabled={readOnly}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${totals.kcal} kcal`}
            accessibilityHint={readOnly ? undefined : 'Toca para editar. Desliza a la izquierda para eliminar.'}
            style={({ pressed }) => [
              styles.card,
              shadow('sm', isDark),
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed && !readOnly ? 0.85 : 1,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: colors.muted }]}>
              <Ionicons name={SLOT_ICONS[meal.slot]} size={18} color={colors.primary} />
            </View>
            <View style={styles.body}>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatTime(meal.timeMinutes)}</Text>
              <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
                {title}
              </Text>
              <Text style={[styles.macros, { color: colors.mutedForeground }]}>
                P {Math.round(totals.proteinG)} · C {Math.round(totals.carbsG)} · G {Math.round(totals.fatG)}
                {spread > 0 ? ` · ~±${formatNumber(spread)} kcal` : ''}
              </Text>
            </View>
            <Text style={[styles.kcal, { color: colors.foreground }]}>
              {formatNumber(totals.kcal)}
              <Text style={[styles.kcalUnit, { color: colors.mutedForeground }]}> kcal</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, overflow: 'hidden' },
  action: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  actionText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label, color: '#FFFFFF' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    minHeight: 68,
  },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  time: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  title: { fontFamily: fontFamily.semibold, fontSize: fontSize.body },
  macros: { fontFamily: fontFamily.regular, fontSize: fontSize.caption },
  kcal: { fontFamily: fontFamily.bold, fontSize: fontSize.body },
  kcalUnit: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
});
