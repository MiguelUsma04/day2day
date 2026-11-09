import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatKcal } from '../../lib/nutrition/format';
import { itemMacros } from '../../lib/nutrition/mealMath';
import { parseDecimal } from '../../lib/nutrition/parse';
import { Ionicons } from '../../theme/Ionicons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import type { EatenPct, MealItem, MealSlot } from '../../types/nutrition';
import { ChipQuestion } from './ChipQuestion';
import { amberText, sourceLine } from './FoodSearch';
import { SlotChips } from './MealCaptureStep';
import type { EditorAction, EditorState } from './mealEditorState';
import { totals } from './mealEditorState';
import { Chip, sheetStyles } from './Sheet';

const EATEN: EatenPct[] = [100, 75, 50, 25];

type Props = {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  slot: MealSlot;
  onSlot: (s: MealSlot) => void;
  onAddItem: () => void;
};

/** Step 2: correct what the analysis found before saving. */
export function MealReviewStep({ state, dispatch, slot, onSlot, onAddItem }: Props) {
  const { colors } = useTheme();
  const t = totals(state);

  return (
    <>
      {state.question ? (
        <ChipQuestion question={state.question} onAnswer={(optionIndex) => dispatch({ type: 'answer', optionIndex })} />
      ) : null}

      <View style={sheetStyles.field}>
        {state.items.length === 0 ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>Sin ítems. Agrega al menos uno.</Text>
        ) : null}
        {state.items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            onGrams={(grams) => dispatch({ type: 'setGrams', index, grams })}
            onRemove={() => dispatch({ type: 'removeItem', index })}
          />
        ))}
        <Pressable onPress={onAddItem} accessibilityRole="button" style={styles.addBtn} hitSlop={8}>
          <Text style={[styles.link, { color: colors.primary }]}>＋ agregar ítem</Text>
        </Pressable>
      </View>

      <View style={sheetStyles.field}>
        <Text style={[sheetStyles.label, { color: colors.foreground }]}>Me comí</Text>
        <View style={sheetStyles.chips}>
          {EATEN.map((pct) => (
            <Chip
              key={pct}
              label={`${pct} %`}
              active={state.eatenPct === pct}
              onPress={() => dispatch({ type: 'setEatenPct', pct })}
            />
          ))}
        </View>
      </View>

      <View style={sheetStyles.field}>
        <Text style={[sheetStyles.label, { color: colors.foreground }]}>Momento</Text>
        <SlotChips slot={slot} onChange={onSlot} />
      </View>

      <View style={[styles.totals, { backgroundColor: colors.muted }]}>
        <Text style={[styles.totalKcal, { color: colors.foreground }]}>{formatKcal(t.kcal)}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          P {Math.round(t.proteinG)} g · C {Math.round(t.carbsG)} g · G {Math.round(t.fatG)} g
        </Text>
      </View>
    </>
  );
}

function ItemRow({ item, onGrams, onRemove }: { item: MealItem; onGrams: (g: number) => void; onRemove: () => void }) {
  const { colors, isDark } = useTheme();
  const amber = amberText(isDark);
  const [text, setText] = useState(String(item.grams));

  // Follow outside changes (e.g. a chip answer) without clobbering what is being typed.
  useEffect(() => {
    if (parseDecimal(text) !== item.grams) setText(String(item.grams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.grams]);

  const change = (value: string) => {
    setText(value);
    const grams = parseDecimal(value);
    if (grams !== null && grams > 0 && grams <= 5000) onGrams(grams);
  };

  const kcal = item.food ? itemMacros(item).kcal : null;
  const range = item.gramsMin !== null && item.gramsMax !== null ? `${item.gramsMin}–${item.gramsMax} g` : null;

  return (
    <View style={[styles.item, { borderColor: colors.border }]}>
      <View style={styles.itemMain}>
        <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
          {item.name}
        </Text>
        {item.food === null ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>Sin datos nutricionales</Text>
        ) : item.food.source === 'ai' ? (
          <Text style={[styles.meta, { color: amber }]}>valores estimados por IA</Text>
        ) : (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {sourceLine(item.food.source, item.food.per100.kcal)}
          </Text>
        )}
        {item.isHiddenFat ? <Text style={[styles.meta, { color: amber }]}>estimado, no se ve</Text> : null}
        {kcal !== null || range ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {[kcal !== null ? formatKcal(kcal) : null, range].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <View style={styles.gramsBox}>
        <TextInput
          value={text}
          onChangeText={change}
          inputMode="decimal"
          selectTextOnFocus
          accessibilityLabel={`Gramos de ${item.name}`}
          style={[styles.grams, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>g</Text>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Quitar ${item.name}`}
        style={({ pressed }) => [styles.remove, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Ionicons name="close" size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemMain: { flex: 1, gap: 2 },
  itemName: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.caption },
  gramsBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grams: {
    width: 64,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
  },
  remove: { width: TOUCH_TARGET - 8, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  addBtn: { alignSelf: 'flex-start', minHeight: TOUCH_TARGET, justifyContent: 'center' },
  link: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  totals: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  totalKcal: { fontFamily: fontFamily.bold, fontSize: fontSize.title },
});
