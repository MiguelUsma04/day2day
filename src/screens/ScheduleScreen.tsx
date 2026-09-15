import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ProgressRing } from '../components/ProgressRing';
import { ScopeDialog } from '../components/ScopeDialog';
import { TaskCard } from '../components/TaskCard';
import { TaskEditor } from '../components/TaskEditor';
import { WeekStrip } from '../components/WeekStrip';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { EditScope, TaskDraft, TaskInstance } from '../types/task';
import { friendlyDate, isToday, minutesSinceMidnight, toDayKey } from '../utils/date';
import { playDelete } from '../utils/sound';

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDays: Set<string>;
  tasks: TaskInstance[];
  onToggle: (id: string, dayKey: string) => void;
  onAdd: (draft: TaskDraft) => void;
  onUpdate: (id: string, patch: Partial<TaskDraft>, scope: EditScope, dayKey: string) => void;
  onDelete: (id: string) => void;
  onSkip: (id: string, dayKey: string) => void;
};

/** A pending action waiting on the one-day / whole-series choice. */
type PendingScope =
  | { intent: 'edit'; task: TaskInstance; draft: TaskDraft }
  | { intent: 'delete'; task: TaskInstance };

export function ScheduleScreen({
  selectedDate,
  onSelectDate,
  markedDays,
  tasks,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
  onSkip,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TaskInstance | null>(null);
  const [pending, setPending] = useState<PendingScope | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskInstance | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => minutesSinceMidnight(new Date()));

  // Keep the "Ahora" marker fresh without re-rendering every second.
  useEffect(() => {
    const id = setInterval(() => setNowMinutes(minutesSinceMidnight(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  const dayKey = toDayKey(selectedDate);
  const doneCount = tasks.filter((t) => t.done).length;
  const viewingToday = isToday(dayKey);

  const currentTaskId = useMemo(() => {
    if (!viewingToday) return null;
    const active = tasks.find(
      (t) =>
        t.startMinutes !== null &&
        nowMinutes >= t.startMinutes &&
        nowMinutes < t.startMinutes + t.durationMinutes,
    );
    return active?.id ?? null;
  }, [tasks, nowMinutes, viewingToday]);

  const openCreate = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditing(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((task: TaskInstance) => {
    setEditing(task);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditing(null);
  }, []);

  const handleSave = useCallback(
    (draft: TaskDraft) => {
      if (!editing) {
        onAdd(draft);
        closeEditor();
        return;
      }
      // A repeating task must never be edited without saying which days it affects.
      if (editing.isRepeating) {
        setPending({ intent: 'edit', task: editing, draft });
        return;
      }
      onUpdate(editing.id, draft, 'all', dayKey);
      closeEditor();
    },
    [editing, onAdd, onUpdate, dayKey, closeEditor],
  );

  const handleDeleteRequest = useCallback((task: TaskInstance) => {
    // Repeating tasks need the scope question; single ones just need a yes/no.
    if (task.isRepeating) {
      setPending({ intent: 'delete', task });
      return;
    }
    setConfirmDelete(task);
  }, []);

  const confirmSingleDelete = useCallback(() => {
    if (!confirmDelete) return;
    onDelete(confirmDelete.id);
    playDelete();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (editing?.id === confirmDelete.id) closeEditor();
    setConfirmDelete(null);
  }, [confirmDelete, onDelete, editing, closeEditor]);

  const resolveScope = useCallback(
    (scope: EditScope) => {
      if (!pending) return;
      if (pending.intent === 'edit') {
        onUpdate(pending.task.id, pending.draft, scope, pending.task.dayKey);
      } else if (scope === 'all') {
        onDelete(pending.task.id);
        playDelete();
      } else {
        onSkip(pending.task.id, pending.task.dayKey);
        playDelete();
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPending(null);
      closeEditor();
    },
    [pending, onUpdate, onDelete, onSkip, closeEditor],
  );

  const goToToday = useCallback(() => {
    void Haptics.selectionAsync();
    onSelectDate(new Date());
  }, [onSelectDate]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>Mi cronograma</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {friendlyDate(selectedDate)}
            </Text>
          </View>

          {!viewingToday ? (
            <Pressable
              onPress={goToToday}
              accessibilityRole="button"
              accessibilityLabel="Ir a hoy"
              style={({ pressed }) => [
                styles.todayBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="today-outline" size={15} color={colors.primary} />
              <Text style={[styles.todayText, { color: colors.primary }]}>Hoy</Text>
            </Pressable>
          ) : null}
        </View>

        {tasks.length > 0 ? (
          <View
            style={[
              styles.progressCard,
              shadow('sm', isDark),
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <ProgressRing total={tasks.length} done={doneCount} />
          </View>
        ) : null}
      </View>

      <WeekStrip selected={selectedDate} onSelect={onSelectDate} markedDays={markedDays} />

      <FlatList
        style={styles.listBox}
        data={tasks}
        keyExtractor={(item) => `${item.id}:${item.dayKey}`}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onToggle={onToggle}
            onPress={openEdit}
            onDelete={handleDeleteRequest}
            isCurrent={item.id === currentTaskId}
          />
        )}
        contentContainerStyle={[
          styles.list,
          // Leave room for the floating button so the last card is never covered.
          { paddingBottom: 96 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <EmptyState
            title="Todavía no hay nada aquí"
            description="Añade tu primera actividad y arma la rutina de tu día, desde que te levantas hasta que te duermes."
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel="Añadir actividad"
        style={({ pressed }) => [
          styles.fab,
          shadow('lg', isDark),
          { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Ionicons name="add" size={26} color={colors.onPrimary} />
      </Pressable>

      <TaskEditor
        visible={editorOpen}
        dayKey={dayKey}
        task={editing}
        onClose={closeEditor}
        onSave={handleSave}
        onDelete={(id) => {
          const target = editing?.id === id ? editing : null;
          if (target) handleDeleteRequest(target);
        }}
      />

      <ConfirmDialog
        visible={confirmDelete !== null}
        title="¿Eliminar actividad?"
        message={
          confirmDelete
            ? `"${confirmDelete.title}" se quitará de tu cronograma. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmSingleDelete}
      />

      <ScopeDialog
        visible={pending !== null}
        intent={pending?.intent ?? 'edit'}
        dayLabel={friendlyDate(selectedDate)}
        onCancel={() => setPending(null)}
        onChoose={resolveScope}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 2 },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: fontSize.label, letterSpacing: 0.2 },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.headline, lineHeight: 36 },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  todayText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  progressCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  listBox: { flex: 1 },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
  },
});
