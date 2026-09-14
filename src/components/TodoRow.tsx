import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { Todo } from '../types/task';
import { playComplete, playDelete, playUndo } from '../utils/sound';

type Props = {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TodoRow({ todo, onToggle, onDelete }: Props) {
  const { colors, isDark } = useTheme();

  const toggle = useCallback(() => {
    if (todo.done) playUndo();
    else playComplete();
    void Haptics.impactAsync(
      todo.done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    onToggle(todo.id);
  }, [todo, onToggle]);

  const remove = useCallback(() => {
    playDelete();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDelete(todo.id);
  }, [todo.id, onDelete]);

  return (
    <View
      style={[
        styles.row,
        shadow('sm', isDark),
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: todo.done }}
        accessibilityLabel={todo.title}
        style={({ pressed }) => [
          styles.checkbox,
          {
            backgroundColor: todo.done ? colors.accent : 'transparent',
            borderColor: todo.done ? colors.accent : colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        {todo.done ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
      </Pressable>

      <Pressable onPress={toggle} style={styles.labelTap} accessibilityRole="button">
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

      <Pressable
        onPress={remove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Eliminar ${todo.title}`}
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}
      >
        <Ionicons name="close" size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote, lineHeight: 20 },
  deleteBtn: {
    width: 32,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
