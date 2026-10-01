import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { Todo } from '../types/task';
import { playComplete, playUndo } from '../utils/sound';

/** Horizontal travel before the day shift commits. */
const THRESHOLD = 72;
/** Movement needed before the swipe takes over from the vertical scroll. */
const ACTIVATION = 12;

type Props = {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Shifts the item by whole days: +1 tomorrow, -1 yesterday. */
  onMove: (id: string, deltaDays: number) => void;
};

export function TodoRow({ todo, onToggle, onDelete, onRename, onMove }: Props) {
  const { colors, isDark } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [pressed, setPressed] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const translateX = useRef(new Animated.Value(0)).current;
  const committed = useRef(false);
  const moved = useRef(false);
  const downPoint = useRef<{ x: number; y: number } | null>(null);

  // Follow external changes while not mid-edit, so a sync cannot clobber typing.
  useEffect(() => {
    if (!editing) setDraft(todo.title);
  }, [todo.title, editing]);

  /**
   * Keeps the pressed look honest on web: react-native-web applies it on a
   * delay and clears it only on its own release, which never arrives when the
   * finger scrolls away. Same fix as the schedule cards.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onDown = (event: PointerEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : (event as PointerEvent);
      if (!point) return;
      downPoint.current = { x: point.clientX, y: point.clientY };
      moved.current = false;
    };
    const onMoveEvent = (event: PointerEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : (event as PointerEvent);
      if (!point || downPoint.current === null) return;
      const dx = point.clientX - downPoint.current.x;
      const dy = point.clientY - downPoint.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        moved.current = true;
        setPressed(false);
      }
    };
    const onUp = () => {
      downPoint.current = null;
      setPressed(false);
      // Clear after the click that follows release, so the next tap is honoured.
      setTimeout(() => {
        moved.current = false;
      }, 120);
    };

    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMoveEvent, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('touchmove', onMoveEvent, true);
    document.addEventListener('touchend', onUp, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMoveEvent, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('touchmove', onMoveEvent, true);
      document.removeEventListener('touchend', onUp, true);
    };
  }, []);

  const startEdit = useCallback(() => {
    // A swipe also produces a tap on web; ignore the one that follows a drag.
    if (moved.current) return;
    void Haptics.selectionAsync();
    setDraft(todo.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [todo.title]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    // An empty title would leave an unreadable row; keep the previous one.
    if (!trimmed || trimmed === todo.title) {
      setDraft(todo.title);
      return;
    }
    onRename(todo.id, trimmed);
  }, [draft, todo.id, todo.title, onRename]);

  const toggle = useCallback(() => {
    if (todo.done) playUndo();
    else playComplete();
    void Haptics.impactAsync(
      todo.done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    onToggle(todo.id);
  }, [todo, onToggle]);

  const requestRemove = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDelete(todo.id);
  }, [todo.id, onDelete]);

  const springBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [translateX]);

  const pan = Gesture.Pan()
    .activeOffsetX([-ACTIVATION, ACTIVATION])
    // Keeps the vertical list scroll from being stolen by a near-vertical drag.
    .failOffsetY([-14, 14])
    .onBegin(() => {
      committed.current = false;
    })
    .onUpdate((event) => {
      if (editing) return;
      translateX.setValue(event.translationX);
      // Fire the haptic once, as the threshold is crossed, not on every frame.
      const past = Math.abs(event.translationX) >= THRESHOLD;
      if (past !== committed.current) {
        committed.current = past;
        if (past) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onEnd((event) => {
      if (editing) return;
      if (Math.abs(event.translationX) >= THRESHOLD) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onMove(todo.id, event.translationX > 0 ? 1 : -1);
      }
      springBack();
    })
    .onFinalize(() => {
      springBack();
      setPressed(false);
    })
    .runOnJS(true);

  // Backgrounds reveal progressively, so the gesture explains itself.
  const nextOpacity = translateX.interpolate({
    inputRange: [0, THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const prevOpacity = translateX.interpolate({
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
          style={[
            styles.action,
            styles.actionLeft,
            { backgroundColor: colors.muted, opacity: prevOpacity },
          ]}
        >
          <Ionicons name="arrow-back" size={18} color={colors.foreground} />
          <Text style={[styles.actionText, { color: colors.foreground }]}>Ayer</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.action,
            styles.actionRight,
            { backgroundColor: colors.primary, opacity: nextOpacity },
          ]}
        >
          <Text style={[styles.actionText, { color: colors.onPrimary }]}>Mañana</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
        </Animated.View>
      </View>

      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View style={{ transform: [{ translateX }] }}>
          <View
            style={[
              styles.row,
              shadow('sm', isDark),
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Pressable
              onPress={toggle}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: todo.done }}
              accessibilityLabel={todo.title}
              style={({ pressed: p }) => [
                styles.checkbox,
                {
                  backgroundColor: todo.done ? colors.accent : 'transparent',
                  borderColor: todo.done ? colors.accent : colors.border,
                  opacity: p ? 0.7 : 1,
                },
              ]}
            >
              {todo.done ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
            </Pressable>

            {editing ? (
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                onBlur={commit}
                onSubmitEditing={commit}
                returnKeyType="done"
                selectTextOnFocus
                accessibilityLabel="Editar pendiente"
                style={[styles.input, { color: colors.foreground, borderColor: colors.primary }]}
              />
            ) : (
              <Pressable
                onPress={startEdit}
                onPressIn={() => {
                  if (moved.current) return;
                  setPressed(true);
                }}
                onPressOut={() => setPressed(false)}
                style={styles.labelTap}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${todo.title}`}
                accessibilityHint="Toca para cambiar el texto. Desliza a los lados para moverlo de día."
              >
                <Text
                  numberOfLines={2}
                  style={[
                    styles.label,
                    {
                      color: todo.done ? colors.mutedForeground : colors.foreground,
                      textDecorationLine: todo.done ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {todo.title}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={requestRemove}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Eliminar ${todo.title}`}
              style={({ pressed: p }) => [styles.deleteBtn, { opacity: p ? 0.5 : 1 }]}
            >
              <Ionicons name="close" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelTap: { flex: 1, justifyContent: 'center', minHeight: TOUCH_TARGET },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderBottomWidth: 2,
    paddingVertical: spacing.xs,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.footnote,
  },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote, lineHeight: 20 },
  deleteBtn: {
    width: 32,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
