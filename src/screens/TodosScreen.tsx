import React, { useCallback, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/EmptyState';
import { ProgressRing } from '../components/ProgressRing';
import { TodoRow } from '../components/TodoRow';
import { WeekStrip } from '../components/WeekStrip';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { Todo } from '../types/task';
import { friendlyDate, toDayKey } from '../utils/date';

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDays: Set<string>;
  todos: Todo[];
  onAdd: (title: string, date: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TodosScreen({
  selectedDate,
  onSelectDate,
  markedDays,
  todos,
  onAdd,
  onToggle,
  onDelete,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  const dayKey = toDayKey(selectedDate);
  const doneCount = todos.filter((t) => t.done).length;

  const submit = useCallback(() => {
    const value = draft.trim();
    if (!value) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(value, dayKey);
    setDraft('');
  }, [draft, dayKey, onAdd]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>Pendientes</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {friendlyDate(selectedDate)}
        </Text>

        {todos.length > 0 ? (
          <View
            style={[
              styles.progressCard,
              shadow('sm', isDark),
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <ProgressRing total={todos.length} done={doneCount} />
          </View>
        ) : null}
      </View>

      <WeekStrip selected={selectedDate} onSelect={onSelectDate} markedDays={markedDays} />

      <FlatList
        style={styles.listBox}
        data={todos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TodoRow todo={item} onToggle={onToggle} onDelete={onDelete} />
        )}
        contentContainerStyle={[styles.list, { paddingBottom: spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            title="Sin pendientes"
            description="Anota cosas sueltas del día que no necesitan una hora fija: una llamada, una compra, un recado."
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            placeholder="Añadir pendiente…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            accessibilityLabel="Nuevo pendiente"
            style={[
              styles.input,
              { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel="Añadir"
            accessibilityState={{ disabled: draft.trim().length === 0 }}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: colors.primary,
                opacity: draft.trim().length === 0 ? 0.45 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="add" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xs },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: fontSize.label, letterSpacing: 0.2 },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.headline, lineHeight: 36 },
  progressCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  listBox: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
  },
  addBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
