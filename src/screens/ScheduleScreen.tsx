import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/EmptyState';
import { ProgressRing } from '../components/ProgressRing';
import { TaskCard } from '../components/TaskCard';
import { TaskEditor } from '../components/TaskEditor';
import { WeekStrip } from '../components/WeekStrip';
import { useTasks } from '../storage/useTasks';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { TaskDraft, TaskInstance } from '../types/task';
import { friendlyDate, isToday, minutesSinceMidnight, toDayKey } from '../utils/date';

export function ScheduleScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    isLoading,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    getTasksForDay,
    markedDays,
  } = useTasks();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TaskInstance | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => minutesSinceMidnight(new Date()));

  // Keep the "Ahora" marker fresh without re-rendering every second.
  useEffect(() => {
    const id = setInterval(() => setNowMinutes(minutesSinceMidnight(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  const dayKey = toDayKey(selectedDate);
  const tasks = getTasksForDay(dayKey);
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

  const handleSave = useCallback(
    (draft: TaskDraft) => {
      if (editing) updateTask(editing.id, draft);
      else addTask(draft);
      setEditorOpen(false);
      setEditing(null);
    },
    [editing, addTask, updateTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const isRoutine = editing?.isRepeating ?? false;
      const confirmAndDelete = () => {
        deleteTask(id);
        setEditorOpen(false);
        setEditing(null);
      };

      // Deleting a routine removes it from every day, so it warrants a confirmation.
      if (Platform.OS === 'web') {
        confirmAndDelete();
        return;
      }

      Alert.alert(
        isRoutine ? 'Eliminar rutina' : 'Eliminar actividad',
        isRoutine
          ? 'Se quitará de todos los días en los que se repite. Esta acción no se puede deshacer.'
          : 'Esta acción no se puede deshacer.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: confirmAndDelete },
        ],
      );
    },
    [deleteTask, editing],
  );

  const goToToday = useCallback(() => {
    void Haptics.selectionAsync();
    setSelectedDate(new Date());
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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

      <WeekStrip selected={selectedDate} onSelect={setSelectedDate} markedDays={markedDays} />

      <FlatList
        data={tasks}
        keyExtractor={(item) => `${item.id}:${item.dayKey}`}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onToggle={toggleTask}
            onPress={openEdit}
            isCurrent={item.id === currentTaskId}
          />
        )}
        contentContainerStyle={[
          styles.list,
          // Leave room for the floating button so the last card is never covered.
          { paddingBottom: insets.bottom + 96 },
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
          {
            backgroundColor: colors.primary,
            bottom: insets.bottom + spacing.lg,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={26} color={colors.onPrimary} />
      </Pressable>

      <TaskEditor
        visible={editorOpen}
        dayKey={dayKey}
        task={editing}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 2 },
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    letterSpacing: 0.2,
  },
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
  progressCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // Keeps rows anchored under the week strip instead of centring in the track.
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
  },
});
