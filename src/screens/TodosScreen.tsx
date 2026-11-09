import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '../theme/Ionicons';
import * as Haptics from '../utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ProgressRing } from '../components/ProgressRing';
import { TodoRow } from '../components/TodoRow';
import { WeekStrip } from '../components/WeekStrip';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { Todo } from '../types/task';
import { addDays, friendlyDate, toDayKey } from '../utils/date';
import { playDelete } from '../utils/sound';

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDays: Set<string>;
  todos: Todo[];
  onAdd: (title: string, date: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onMove: (id: string, deltaDays: number) => void;
  /** Drops a pending item at `index` among the day's pending items. */
  onReorder: (id: string, index: number) => void;
  /**
   * Someone else's list: rows cannot be ticked, renamed, moved or deleted.
   * The composer stays, so a todo can still be added for them.
   */
  readOnly?: boolean;
};

/** Space between rows; part of the distance a row travels when it makes room. */
const ROW_GAP = spacing.sm;
const FALLBACK_HEIGHT = 56;

export function TodosScreen({
  selectedDate,
  onSelectDate,
  markedDays,
  todos,
  onAdd,
  onToggle,
  onDelete,
  onRename,
  onMove,
  onReorder,
  readOnly = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Todo | null>(null);
  const [movedNote, setMovedNote] = useState<string | null>(null);

  const dayKey = toDayKey(selectedDate);
  const doneCount = todos.filter((t) => t.done).length;

  /*
   * Drag to reorder. `todos` arrives sorted with pending items first, so the
   * pending ones are simply the first N. Heights come from onLayout; the
   * slot of row i is the sum of the heights (plus gaps) above it, which
   * avoids depending on how the list positions its cells. The row under the
   * finger follows the finger; the others spring up or down by its height
   * as the target slot changes, and on release the store gets the index.
   */
  const heights = useRef(new Map<string, number>()).current;
  const offsets = useRef(new Map<string, Animated.Value>()).current;
  const dragRef = useRef<{ id: string; from: number; to: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const offsetFor = useCallback(
    (id: string) => {
      let v = offsets.get(id);
      if (!v) {
        v = new Animated.Value(0);
        offsets.set(id, v);
      }
      return v;
    },
    [offsets],
  );

  const pending = todos.filter((t) => !t.done);
  const heightOf = (id: string) => heights.get(id) ?? FALLBACK_HEIGHT;
  const slotTop = (index: number) => {
    let y = 0;
    for (let i = 0; i < index; i++) y += heightOf(pending[i].id) + ROW_GAP;
    return y;
  };

  const handleDragStart = useCallback(
    (id: string) => {
      const from = pending.findIndex((t) => t.id === id);
      if (from === -1) return;
      dragRef.current = { id, from, to: from };
      setDraggingId(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos],
  );

  const handleDragMove = useCallback(
    (id: string, dy: number) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== id) return;
      offsetFor(id).setValue(dy);

      const h = heightOf(id);
      const center = slotTop(drag.from) + dy + h / 2;
      let to = 0;
      for (let i = 0; i < pending.length; i++) {
        if (i === drag.from) continue;
        if (slotTop(i) + heightOf(pending[i].id) / 2 < center) to++;
      }
      if (to === drag.to) return;
      drag.to = to;
      void Haptics.selectionAsync();

      const travel = h + ROW_GAP;
      for (let i = 0; i < pending.length; i++) {
        if (i === drag.from) continue;
        const shift = i > drag.from && i <= to ? -travel : i < drag.from && i >= to ? travel : 0;
        Animated.spring(offsetFor(pending[i].id), {
          toValue: shift,
          useNativeDriver: true,
          speed: 24,
          bounciness: 2,
        }).start();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, offsetFor],
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== id) return;
      dragRef.current = null;
      setDraggingId(null);

      if (drag.to === drag.from) {
        // Nothing changed: ease everything back where it was.
        for (const v of offsets.values()) {
          Animated.spring(v, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 4 }).start();
        }
        return;
      }
      // The data is about to re-sort into the dragged positions, so every
      // offset must be zero by the time that render lands.
      for (const v of offsets.values()) {
        v.stopAnimation();
        v.setValue(0);
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onReorder(id, drag.to);
    },
    [offsets, onReorder],
  );

  const submit = useCallback(() => {
    const value = draft.trim();
    if (!value) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(value, dayKey);
    setDraft('');
  }, [draft, dayKey, onAdd]);

  const handleToggle = useCallback(
    (id: string) => {
      // Ticking an item sends it to the bottom; animate the move.
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          260,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      );
      onToggle(id);
    },
    [onToggle],
  );

  /**
   * Moving an item makes it leave the day on screen, so say where it went:
   * otherwise the row just disappears with no explanation.
   */
  const handleMove = useCallback(
    (id: string, deltaDays: number) => {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          240,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity,
        ),
      );
      onMove(id, deltaDays);
      setMovedNote(
        `Movido a ${friendlyDate(addDays(selectedDate, deltaDays)).toLowerCase()}`,
      );
    },
    [onMove, selectedDate],
  );

  // Clear the note on its own, and whenever the day changes.
  useEffect(() => {
    if (!movedNote) return;
    const id = setTimeout(() => setMovedNote(null), 2600);
    return () => clearTimeout(id);
  }, [movedNote]);

  useEffect(() => {
    setMovedNote(null);
  }, [dayKey]);

  const confirmRemoval = useCallback(() => {
    if (!confirmDelete) return;
    onDelete(confirmDelete.id);
    playDelete();
    setConfirmDelete(null);
  }, [confirmDelete, onDelete]);

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
        extraData={draggingId}
        scrollEnabled={draggingId === null}
        renderItem={({ item }) => (
          <View
            onLayout={(e) => heights.set(item.id, e.nativeEvent.layout.height)}
            style={draggingId === item.id ? styles.liftedCell : null}
          >
            <TodoRow
              todo={item}
              onToggle={handleToggle}
              onDelete={() => setConfirmDelete(item)}
              onRename={onRename}
              onMove={handleMove}
              translateY={offsetFor(item.id)}
              lifted={draggingId === item.id}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              readOnly={readOnly}
            />
          </View>
        )}
        contentContainerStyle={[styles.list, { paddingBottom: spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
        ListEmptyComponent={
          <EmptyState
            title="Sin pendientes"
            description="Anota cosas sueltas del día que no necesitan una hora fija: una llamada, una compra, un recado."
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {movedNote ? (
        <View
          style={[
            styles.movedNote,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Ionicons name="arrow-redo-outline" size={15} color={colors.primary} />
          <Text style={[styles.movedText, { color: colors.foreground }]}>{movedNote}</Text>
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmDelete !== null}
        title="¿Eliminar pendiente?"
        message={
          confirmDelete
            ? `"${confirmDelete.title}" se borrará de tu lista.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmRemoval}
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
  // The list's cells have no z-index of their own, so raising the item is
  // enough for the lifted row to paint over the cells that follow it.
  liftedCell: { zIndex: 10 },
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
  movedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  movedText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
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
