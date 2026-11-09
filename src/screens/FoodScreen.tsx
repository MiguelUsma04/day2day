import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { CheckInCard } from '../components/food/CheckInCard';
import { EmptySlotRow } from '../components/food/EmptySlotRow';
import { MealEditor, type MealEditorMode } from '../components/food/MealEditor';
import { clearMealDraft, readMealDraft, type MealDraft } from '../components/food/mealDraft';
import { MealRow } from '../components/food/MealRow';
import { TotalsCards } from '../components/food/TotalsCards';
import { WeekStrip } from '../components/WeekStrip';
import { defaultSlotMinutes, medianSlotMinutes, slotLabel } from '../lib/nutrition/format';
import { dayTotals, slotForMinutes } from '../lib/nutrition/mealMath';
import type { NutritionStore } from '../storage/useNutrition';
import { Ionicons } from '../theme/Ionicons';
import type { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import { MEAL_SLOTS, type Meal, type MealSlot } from '../types/nutrition';
import { friendlyDate, fromDayKey, minutesSinceMidnight, toDayKey } from '../utils/date';
import * as Haptics from '../utils/haptics';
import { playDelete } from '../utils/sound';

/** Weight assumed for workout kcal until the user logs one. */
const FALLBACK_WEIGHT_KG = 65;
const RECENT_FOODS_LIMIT = 20;

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDays: Set<string>;
  nutrition: NutritionStore;
  /** Viewing someone else's day: no capture, no edits. */
  readOnly?: boolean;
  onOpenProfile: () => void;
};

type EditorState = { mode: MealEditorMode; slot: MealSlot; meal?: Meal; note?: string };

type TimelineEntry =
  | { kind: 'meal'; minutes: number; meal: Meal }
  | { kind: 'empty'; minutes: number; slot: MealSlot };

export function FoodScreen({ selectedDate, onSelectDate, markedDays, nutrition, readOnly = false, onOpenProfile }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Meal | null>(null);
  const [draft, setDraft] = useState<MealDraft | null>(null);

  // A meal analysis interrupted by closing the app leaves a draft behind.
  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    void readMealDraft().then((d) => {
      if (!cancelled) setDraft(d);
    });
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

  const resumeDraft = useCallback(() => {
    if (!draft) return;
    onSelectDate(fromDayKey(draft.date));
    // The photo is not kept; the note and slot are.
    setEditor({ mode: 'text', slot: draft.slot, note: draft.note });
    setDraft(null);
  }, [draft, onSelectDate]);

  const discardDraft = useCallback(() => {
    void clearMealDraft();
    setDraft(null);
  }, []);

  const dayKey = toDayKey(selectedDate);
  const meals = useMemo(() => nutrition.getMealsForDay(dayKey), [nutrition.getMealsForDay, dayKey]);
  const totals = dayTotals(meals);
  const target = nutrition.targetFor(dayKey);
  const weightKg = nutrition.currentWeightKg() ?? FALLBACK_WEIGHT_KG;

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = meals.map((meal) => ({ kind: 'meal', minutes: meal.timeMinutes, meal }));
    for (const slot of MEAL_SLOTS) {
      if (meals.some((m) => m.slot === slot)) continue;
      const minutes = medianSlotMinutes(nutrition.meals, slot) ?? defaultSlotMinutes(slot);
      entries.push({ kind: 'empty', minutes, slot });
    }
    // Stable sort keeps meals (pushed first) ahead of a placeholder at the same minute.
    return entries.sort((a, b) => a.minutes - b.minutes);
  }, [meals, nutrition.meals]);

  // Most recent first, unique by name: suggestions for the editor.
  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const sorted = [...nutrition.meals].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const meal of sorted) {
      for (const item of meal.items) {
        const key = item.name.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item.name.trim());
        if (out.length >= RECENT_FOODS_LIMIT) return out;
      }
    }
    return out;
  }, [nutrition.meals]);

  const openCapture = useCallback((mode: 'photo' | 'text') => {
    void Haptics.selectionAsync();
    setEditor({ mode, slot: slotForMinutes(minutesSinceMidnight(new Date())) });
  }, []);

  const saveMeal = useCallback(
    (m: Omit<Meal, 'id' | 'createdAt' | 'updatedAt'> | Meal) => {
      if ('id' in m) {
        const { id, createdAt: _c, updatedAt: _u, ...fields } = m;
        nutrition.updateMeal(id, fields);
      } else {
        nutrition.addMeal(m);
      }
      setEditor(null);
    },
    [nutrition],
  );

  const confirmRemoval = useCallback(() => {
    if (!confirmDelete) return;
    nutrition.deleteMeal(confirmDelete.id);
    playDelete();
    setConfirmDelete(null);
  }, [confirmDelete, nutrition]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>Comida</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{friendlyDate(selectedDate)}</Text>
      </View>

      <WeekStrip selected={selectedDate} onSelect={onSelectDate} markedDays={markedDays} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {draft && !readOnly ? (
          <View style={[styles.draft, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.draftText, { color: colors.foreground }]}>Tienes una comida sin terminar</Text>
            <View style={styles.draftActions}>
              <Pressable onPress={discardDraft} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.draftLink, { color: colors.mutedForeground }]}>Descartar</Text>
              </Pressable>
              <Pressable onPress={resumeDraft} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.draftLink, { color: colors.primary }]}>Continuar</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <CheckInCard
          date={dayKey}
          weight={nutrition.getWeightFor(dayKey)}
          sleep={nutrition.getSleepFor(dayKey)}
          workouts={nutrition.getWorkoutsFor(dayKey)}
          weightKg={weightKg}
          onSetWeight={(kg) => nutrition.setWeight(dayKey, kg)}
          onSetSleep={(log) => nutrition.setSleep(dayKey, log)}
          onAddWorkout={(w) => nutrition.addWorkout(w, weightKg)}
          onDeleteWorkout={nutrition.deleteWorkout}
          readOnly={readOnly}
        />

        <TotalsCards totals={totals} target={target} onOpenProfile={onOpenProfile} />

        <View style={styles.timeline}>
          {timeline.map((entry) =>
            entry.kind === 'meal' ? (
              <MealRow
                key={entry.meal.id}
                meal={entry.meal}
                readOnly={readOnly}
                onPress={(meal) => setEditor({ mode: 'edit', slot: meal.slot, meal })}
                onDelete={setConfirmDelete}
              />
            ) : (
              <EmptySlotRow
                key={`empty-${entry.slot}`}
                slot={entry.slot}
                minutes={entry.minutes}
                readOnly={readOnly}
                onPress={(slot) => setEditor({ mode: 'text', slot })}
              />
            ),
          )}
        </View>
      </ScrollView>

      {readOnly ? null : (
        <View
          style={[
            styles.actions,
            { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: spacing.sm },
          ]}
        >
          <CaptureButton icon="camera-outline" label="Foto" onPress={() => openCapture('photo')} primary />
          <CaptureButton icon="create-outline" label="Texto" onPress={() => openCapture('text')} />
        </View>
      )}

      <ConfirmDialog
        visible={confirmDelete !== null}
        title="¿Eliminar comida?"
        message={
          confirmDelete ? `"${confirmDelete.title.trim() || slotLabel(confirmDelete.slot)}" se borrará del día.` : ''
        }
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmRemoval}
      />

      {editor ? (
        <MealEditor
          visible
          mode={editor.mode}
          date={dayKey}
          slot={editor.slot}
          meal={editor.meal}
          portions={nutrition.portions}
          recentFoods={recentFoods}
          onSave={saveMeal}
          onClose={() => setEditor(null)}
          onRememberPortion={nutrition.rememberPortion}
          initialNote={editor.note}
        />
      ) : null}
    </View>
  );
}

function CaptureButton({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  const fg = primary ? colors.onPrimary : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Registrar comida por ${label.toLowerCase()}`}
      style={({ pressed }) => [
        styles.captureBtn,
        {
          backgroundColor: primary ? colors.primary : colors.muted,
          borderColor: primary ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={[styles.captureText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xs },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: fontSize.label, letterSpacing: 0.2 },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.headline, lineHeight: 36 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.lg },
  timeline: { gap: spacing.sm },
  draft: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  draftText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  draftActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg },
  draftLink: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  captureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET + 4,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  captureText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
});
