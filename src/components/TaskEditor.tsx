import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoryMeta, categoryTint } from '../theme/categories';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import {
  CATEGORIES,
  NO_REPEAT,
  type Category,
  type Repeat,
  type RepeatKind,
  type TaskDraft,
  type TaskInstance,
  type Weekday,
} from '../types/task';
import { TimePicker } from './TimePicker';

const DURATIONS = [15, 30, 45, 60, 90, 120];

const WEEKDAY_LABELS: { day: Weekday; label: string }[] = [
  { day: 1, label: 'L' },
  { day: 2, label: 'M' },
  { day: 3, label: 'X' },
  { day: 4, label: 'J' },
  { day: 5, label: 'V' },
  { day: 6, label: 'S' },
  { day: 0, label: 'D' },
];

const REPEAT_OPTIONS: { kind: RepeatKind; label: string }[] = [
  { kind: 'none', label: 'Una vez' },
  { kind: 'daily', label: 'Cada día' },
  { kind: 'weekdays', label: 'Lun a Vie' },
  { kind: 'custom', label: 'Días...' },
];

type Props = {
  visible: boolean;
  dayKey: string;
  /** Present when editing; absent when creating. */
  task: TaskInstance | null;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete: (id: string) => void;
};

export function TaskEditor({ visible, dayKey, task, onClose, onSave, onDelete }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [startMinutes, setStartMinutes] = useState<number | null>(8 * 60);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [category, setCategory] = useState<Category>('personal');
  const [repeat, setRepeat] = useState<Repeat>(NO_REPEAT);
  const [touched, setTouched] = useState(false);

  // Reset the form each time the sheet opens, so a stale draft never leaks in.
  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? '');
    setNotes(task?.notes ?? '');
    setStartMinutes(task ? task.startMinutes : 8 * 60);
    setDurationMinutes(task?.durationMinutes ?? 30);
    setCategory(task?.category ?? 'personal');
    setRepeat(task?.repeat ?? NO_REPEAT);
    setTouched(false);
  }, [visible, task]);

  const trimmed = title.trim();
  const titleError = touched && trimmed.length === 0 ? 'Escribe un nombre para la actividad' : null;
  const canSave = trimmed.length > 0;

  const handleSave = () => {
    setTouched(true);
    if (!canSave) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      title: trimmed,
      notes: notes.trim() || undefined,
      date: task?.date ?? dayKey,
      startMinutes,
      durationMinutes,
      category,
      repeat,
    });
  };

  const toggleWeekday = (day: Weekday) => {
    void Haptics.selectionAsync();
    setRepeat((prev) => {
      const has = prev.days.includes(day);
      return {
        kind: 'custom',
        days: has ? prev.days.filter((d) => d !== day) : [...prev.days, day],
      };
    });
  };

  const selectRepeat = (kind: RepeatKind) => {
    void Haptics.selectionAsync();
    setRepeat((prev) => ({
      kind,
      // Seed custom mode with today's weekday so it is never an empty selection.
      days:
        kind === 'custom'
          ? prev.days.length
            ? prev.days
            : [new Date().getDay() as Weekday]
          : [],
    }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Cerrar" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />

            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.foreground }]}>
                {task ? 'Editar actividad' : 'Nueva actividad'}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.form}
            >
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>Actividad</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  onBlur={() => setTouched(true)}
                  placeholder="Ej. Tomar un vaso de agua"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                  accessibilityLabel="Nombre de la actividad"
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.muted,
                      color: colors.foreground,
                      borderColor: titleError ? colors.destructive : colors.border,
                    },
                  ]}
                />
                {titleError ? (
                  <Text
                    accessibilityRole="alert"
                    style={[styles.errorText, { color: colors.destructive }]}
                  >
                    {titleError}
                  </Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>Hora de inicio</Text>
                <TimePicker value={startMinutes} onChange={setStartMinutes} />
              </View>

              {startMinutes !== null ? (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Duración</Text>
                  <View style={styles.chipRow}>
                    {DURATIONS.map((d) => {
                      const active = d === durationMinutes;
                      return (
                        <Pressable
                          key={d}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setDurationMinutes(d);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: active ? colors.primary : colors.muted,
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: active ? colors.onPrimary : colors.foreground },
                            ]}
                          >
                            {d < 60 ? `${d} min` : `${d / 60} h`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>Categoría</Text>
                <View style={styles.chipRow}>
                  {CATEGORIES.map((c) => {
                    const meta = categoryMeta[c];
                    const active = c === category;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setCategory(c);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.categoryChip,
                          {
                            backgroundColor: active ? categoryTint(c, isDark) : colors.muted,
                            borderColor: active ? meta.color : colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={15}
                          color={active ? meta.color : colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.chipText,
                            { color: active ? meta.color : colors.foreground },
                          ]}
                        >
                          {meta.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>Repetir</Text>
                <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                  Las actividades que se repiten aparecen solas cada día que corresponda.
                </Text>
                <View style={styles.chipRow}>
                  {REPEAT_OPTIONS.map((opt) => {
                    const active = opt.kind === repeat.kind;
                    return (
                      <Pressable
                        key={opt.kind}
                        onPress={() => selectRepeat(opt.kind)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? colors.primary : colors.muted,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: active ? colors.onPrimary : colors.foreground },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {repeat.kind === 'custom' ? (
                  <View style={styles.weekdayRow}>
                    {WEEKDAY_LABELS.map(({ day, label }) => {
                      const active = repeat.days.includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() => toggleWeekday(day)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={label}
                          style={[
                            styles.weekday,
                            {
                              backgroundColor: active ? colors.primary : colors.muted,
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.weekdayText,
                              { color: active ? colors.onPrimary : colors.foreground },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>Nota (opcional)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Detalles, lugar, recordatorio..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  accessibilityLabel="Nota"
                  style={[
                    styles.input,
                    styles.textarea,
                    {
                      backgroundColor: colors.muted,
                      color: colors.foreground,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </View>

              {task ? (
                <Pressable
                  onPress={() => {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    onDelete(task.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar actividad"
                  style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.destructive} />
                  <Text style={[styles.deleteText, { color: colors.destructive }]}>
                    Eliminar {task.isRepeating ? 'rutina completa' : 'actividad'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>

            <Pressable
              onPress={handleSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              accessibilityLabel="Guardar"
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: !canSave ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.saveText, { color: colors.onPrimary }]}>
                {task ? 'Guardar cambios' : 'Añadir al cronograma'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  sheetWrap: { maxHeight: '92%' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: fontFamily.bold, fontSize: fontSize.title },
  closeBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  form: { gap: spacing.xl, paddingBottom: spacing.lg },
  field: { gap: spacing.sm },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: 17,
    marginTop: -2,
  },
  input: {
    minHeight: TOUCH_TARGET + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
  },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  errorText: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  weekdayRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  weekday: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  deleteText: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
  saveBtn: {
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: fontFamily.bold, fontSize: fontSize.body },
});
