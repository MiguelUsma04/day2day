import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { categoryMeta, categoryTint } from '../theme/categories';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { duration, fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { TaskInstance } from '../types/task';
import { formatDuration, formatTime } from '../utils/date';

type Props = {
  task: TaskInstance;
  onToggle: (id: string, dayKey: string) => void;
  onPress: (task: TaskInstance) => void;
  /** Highlights the block covering the current moment. */
  isCurrent?: boolean;
};

export function TaskCard({ task, onToggle, onPress, isCurrent = false }: Props) {
  const { colors, isDark } = useTheme();
  const meta = categoryMeta[task.category];

  const handleToggle = () => {
    void Haptics.impactAsync(
      task.done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    onToggle(task.id, task.dayKey);
  };

  return (
    <Pressable
      onPress={() => onPress(task)}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}${task.done ? ', completada' : ''}`}
      accessibilityHint="Toca para editar"
      style={({ pressed }) => [
        styles.card,
        shadow('sm', isDark),
        {
          backgroundColor: colors.surface,
          borderColor: isCurrent ? colors.primary : colors.border,
          borderWidth: isCurrent ? 1.5 : 1,
          // Opacity only — a transform here would nudge neighbouring rows.
          opacity: pressed ? 0.85 : task.done ? 0.6 : 1,
        },
      ]}
    >
      {/* Category rail: colour plus the icon below, never colour alone. */}
      <View style={[styles.rail, { backgroundColor: meta.color }]} />

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={[styles.iconBadge, { backgroundColor: categoryTint(task.category, isDark) }]}>
            <Ionicons name={meta.icon} size={14} color={meta.color} />
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
        onPress={handleToggle}
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
  );
}

const styles = StyleSheet.create({
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
  nowPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
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
