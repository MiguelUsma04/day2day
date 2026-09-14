import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { categoryMeta, categoryTint } from '../theme/categories';
import type { IconName } from '../theme/icons';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';
import type { TaskInstance } from '../types/task';
import { formatDuration, formatTime } from '../utils/date';
import { playComplete, playUndo } from '../utils/sound';

/** Horizontal travel before an action commits. */
const THRESHOLD = 78;
/** Movement needed before the swipe takes over from the vertical scroll. */
const ACTIVATION = 12;

type Props = {
  task: TaskInstance;
  onToggle: (id: string, dayKey: string) => void;
  onPress: (task: TaskInstance) => void;
  onDelete: (task: TaskInstance) => void;
  /** Highlights the block covering the current moment. */
  isCurrent?: boolean;
};

export function TaskCard({ task, onToggle, onPress, onDelete, isCurrent = false }: Props) {
  const { colors, isDark } = useTheme();
  const meta = categoryMeta[task.category];
  const icon = (task.icon as IconName | undefined) ?? meta.icon;

  const translateX = useRef(new Animated.Value(0)).current;
  const committed = useRef(false);
  /** Set while a swipe is in flight, to suppress the tap it also produces. */
  const swiping = useRef(false);
  const [pressed, setPressed] = useState(false);
  /** Where the current pointer went down, for measuring drag distance. */
  const downPoint = useRef<{ x: number; y: number } | null>(null);
  /** True from touch-down until the gesture settles, whatever it turns into. */
  const gestureActive = useRef(false);
  /** Set once the pointer travels far enough to count as a drag. */
  const moved = useRef(false);

  const springBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [translateX]);

  const complete = useCallback(() => {
    if (task.done) playUndo();
    else playComplete();
    void Haptics.notificationAsync(
      task.done ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    );
    onToggle(task.id, task.dayKey);
  }, [task, onToggle]);

  const remove = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete(task);
  }, [task, onDelete]);

  const pan = Gesture.Pan()
    .activeOffsetX([-ACTIVATION, ACTIVATION])
    // Keeps the vertical list scroll from being stolen by a near-vertical drag.
    .failOffsetY([-14, 14])
    .onBegin(() => {
      committed.current = false;
      gestureActive.current = true;
      moved.current = false;
    })
    .onUpdate((event) => {
      // Any real movement means this is a scroll or a swipe, not a tap.
      if (Math.abs(event.translationX) > 4 || Math.abs(event.translationY) > 4) {
        moved.current = true;
        setPressed(false);
      }
      if (Math.abs(event.translationX) > 4) swiping.current = true;
      translateX.setValue(event.translationX);
      // Fire the haptic once, as the threshold is crossed, not on every frame.
      if (!committed.current && Math.abs(event.translationX) >= THRESHOLD) {
        committed.current = true;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (committed.current && Math.abs(event.translationX) < THRESHOLD) {
        committed.current = false;
      }
    })
    .onEnd((event) => {
      const passed = Math.abs(event.translationX) >= THRESHOLD;
      if (passed && event.translationX > 0) complete();
      else if (passed) remove();
      springBack();
    })
    .onFinalize(() => {
      springBack();
      setPressed(false);
      gestureActive.current = false;
      moved.current = false;
      // Clear after the click event that follows pointer-up has been dispatched.
      setTimeout(() => {
        swiping.current = false;
      }, 120);
    })
    .runOnJS(true);

  const handlePress = useCallback(() => {
    setPressed(false);
    if (swiping.current) return;
    onPress(task);
  }, [task, onPress]);

  /**
   * Keeps the pressed look honest on web.
   *
   * RN-web's Pressable applies its pressed style after a short delay and only
   * clears it on its own release event. When the finger scrolls the list, that
   * release never arrives at the card, leaving it dimmed indefinitely. Watching
   * the document for movement and release fixes both halves of that.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onMove = (event: PointerEvent | TouchEvent) => {
      const point =
        'touches' in event ? event.touches[0] : (event as PointerEvent);
      if (!point) return;
      if (downPoint.current === null) return;
      const dx = point.clientX - downPoint.current.x;
      const dy = point.clientY - downPoint.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        moved.current = true;
        setPressed(false);
      }
    };

    const onDown = (event: PointerEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : (event as PointerEvent);
      if (!point) return;
      downPoint.current = { x: point.clientX, y: point.clientY };
      moved.current = false;
    };

    const onUp = () => {
      downPoint.current = null;
      setPressed(false);
    };

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('touchmove', onMove, true);
    document.addEventListener('touchend', onUp, true);
    document.addEventListener('touchcancel', onUp, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('touchmove', onMove, true);
      document.removeEventListener('touchend', onUp, true);
      document.removeEventListener('touchcancel', onUp, true);
    };
  }, []);

  // Action backgrounds reveal progressively, so the gesture explains itself.
  const completeOpacity = translateX.interpolate({
    inputRange: [0, THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const deleteOpacity = translateX.interpolate({
    inputRange: [-THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <View
        style={styles.actions}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View
          style={[styles.action, styles.actionLeft, { backgroundColor: colors.accent, opacity: completeOpacity }]}
        >
          <Ionicons
            name={task.done ? 'arrow-undo' : 'checkmark-circle'}
            size={22}
            color={colors.onPrimary}
          />
          <Text style={[styles.actionText, { color: colors.onPrimary }]}>
            {task.done ? 'Deshacer' : 'Hecho'}
          </Text>
        </Animated.View>

        <Animated.View
          style={[styles.action, styles.actionRight, { backgroundColor: colors.destructive, opacity: deleteOpacity }]}
        >
          <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Eliminar</Text>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={{ transform: [{ translateX }] }}>
          <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`${task.title}${task.done ? ', completada' : ''}`}
            accessibilityHint="Toca para editar. Desliza a la derecha para completar, a la izquierda para eliminar."
            onPressIn={() => {
              // Ignore the delayed press-in that arrives after a drag began.
              if (moved.current) return;
              setPressed(true);
            }}
            onPressOut={() => setPressed(false)}
            style={[
              styles.card,
              shadow('sm', isDark),
              {
                backgroundColor: colors.surface,
                borderColor: isCurrent ? colors.primary : colors.border,
                borderWidth: isCurrent ? 1.5 : 1,
                // Opacity only — a transform here would fight the swipe.
                opacity: pressed ? 0.85 : task.done ? 0.6 : 1,
              },
            ]}
          >
            <View style={[styles.rail, { backgroundColor: meta.color }]} />

            <View style={styles.body}>
              <View style={styles.headerRow}>
                <View style={[styles.iconBadge, { backgroundColor: categoryTint(task.category, isDark) }]}>
                  <Ionicons name={icon} size={14} color={meta.color} />
                </View>

                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {task.startMinutes === null
                    ? 'Sin hora'
                    : `${formatTime(task.startMinutes)} · ${formatDuration(task.durationMinutes)}`}
                </Text>

                {task.isRepeating ? (
                  <Ionicons
                    name="repeat"
                    size={13}
                    color={colors.mutedForeground}
                    accessibilityLabel="Se repite"
                  />
                ) : null}

                {task.reminderMinutes !== null ? (
                  <Ionicons
                    name="notifications-outline"
                    size={13}
                    color={colors.mutedForeground}
                    accessibilityLabel="Con recordatorio"
                  />
                ) : null}

                {isCurrent ? (
                  <View style={[styles.nowPill, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.nowText, { color: colors.onPrimary }]}>Ahora</Text>
                  </View>
                ) : null}
              </View>

              <Text
                numberOfLines={2}
                style={[
                  styles.title,
                  {
                    color: colors.foreground,
                    textDecorationLine: task.done ? 'line-through' : 'none',
                  },
                ]}
              >
                {task.title}
              </Text>

              {task.notes ? (
                <Text numberOfLines={2} style={[styles.notes, { color: colors.mutedForeground }]}>
                  {task.notes}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={complete}
              hitSlop={10}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: task.done }}
              accessibilityLabel={task.done ? 'Marcar como pendiente' : 'Marcar como completada'}
              style={({ pressed }) => [
                styles.checkbox,
                {
                  backgroundColor: task.done ? colors.accent : 'transparent',
                  borderColor: task.done ? colors.accent : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              {task.done ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
            </Pressable>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, overflow: 'hidden' },
  actions: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  actionLeft: { justifyContent: 'flex-start' },
  actionRight: { justifyContent: 'flex-end' },
  actionText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    minHeight: 74,
    paddingRight: spacing.md,
  },
  rail: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, flexShrink: 1 },
  nowPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  nowText: { fontFamily: fontFamily.semibold, fontSize: 10, letterSpacing: 0.3 },
  title: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, lineHeight: 22 },
  notes: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 18 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Visual box stays 28pt; hitSlop lifts the tap area past the 44pt minimum.
  },
});
