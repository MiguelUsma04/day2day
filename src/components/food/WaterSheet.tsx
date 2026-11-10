import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseDecimal } from '../../lib/nutrition/parse';
import { formatLiters, waterGoalMl } from '../../lib/nutrition/water';
import { Ionicons } from '../../theme/Ionicons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import type { WaterLog } from '../../types/nutrition';
import * as Haptics from '../../utils/haptics';
import { PrimaryButton, Sheet, sheetStyles } from './Sheet';

const QUICK_ML = [250, 500, 1000] as const;

type Props = {
  visible: boolean;
  water: WaterLog | null;
  /** Body weight for the daily goal (35 ml/kg). */
  weightKg: number;
  readOnly?: boolean;
  onAdd: (deltaMl: number) => void;
  onSet: (ml: number) => void;
  onClose: () => void;
};

/** Water drunk in the day: quick +250/+500/+1 L buttons or the total typed in liters. */
export function WaterSheet({ visible, water, weightKg, readOnly = false, onAdd, onSet, onClose }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const ml = water?.ml ?? 0;
  const goal = waterGoalMl(weightKg);
  const progress = Math.min(1, ml / goal);

  useEffect(() => {
    if (!visible) return;
    setText('');
  }, [visible]);

  const add = (delta: number) => {
    void Haptics.selectionAsync();
    onAdd(delta);
  };

  const commitTyped = () => {
    const liters = parseDecimal(text);
    if (liters === null || liters < 0 || liters > 15) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSet(Math.round(liters * 1000));
    onClose();
  };

  const typed = parseDecimal(text);
  const canCommit = typed !== null && typed >= 0 && typed <= 15;

  return (
    <Sheet
      visible={visible}
      title="Agua"
      onClose={onClose}
      footer={readOnly ? null : <PrimaryButton label="Listo" onPress={onClose} />}
    >
      <View style={styles.total}>
        <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatLiters(ml)}</Text>
        <Text style={[styles.totalGoal, { color: colors.mutedForeground }]}>
          de {formatLiters(goal)} · {Math.round(progress * 100)} %
        </Text>
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Meta: 35 ml por kilo de peso. Un vaso son unos 250 ml, una botella 500 ml.
        </Text>
      </View>

      {readOnly ? null : (
        <>
          <View style={sheetStyles.field}>
            <Text style={[sheetStyles.label, { color: colors.foreground }]}>Agregar</Text>
            <View style={styles.quick}>
              {QUICK_ML.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => add(q)}
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar ${formatLiters(q)}`}
                  style={({ pressed }) => [
                    styles.quickBtn,
                    { borderColor: colors.border, backgroundColor: colors.muted, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Ionicons name="water-outline" size={18} color={colors.primary} />
                  <Text style={[styles.quickText, { color: colors.foreground }]}>+{formatLiters(q)}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => add(-250)}
                disabled={ml === 0}
                accessibilityRole="button"
                accessibilityLabel="Quitar 250 ml"
                style={({ pressed }) => [
                  styles.quickBtn,
                  { borderColor: colors.border, backgroundColor: colors.muted, opacity: ml === 0 ? 0.4 : pressed ? 0.7 : 1 },
                ]}
              >
                <Ionicons name="remove" size={18} color={colors.mutedForeground} />
                <Text style={[styles.quickText, { color: colors.mutedForeground }]}>250 ml</Text>
              </Pressable>
            </View>
          </View>

          <View style={sheetStyles.field}>
            <Text style={[sheetStyles.label, { color: colors.foreground }]}>O escribe el total del día</Text>
            <View style={[styles.inputRow, { borderColor: colors.border }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={commitTyped}
                inputMode="decimal"
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="2,5"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Litros tomados hoy"
                style={[styles.input, { color: colors.foreground }]}
              />
              <Text style={[styles.unit, { color: colors.mutedForeground }]}>L</Text>
              <Pressable
                onPress={commitTyped}
                disabled={!canCommit}
                accessibilityRole="button"
                accessibilityLabel="Guardar total"
                style={({ pressed }) => [styles.setBtn, { opacity: !canCommit ? 0.4 : pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.setText, { color: colors.primary }]}>Fijar</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  total: { alignItems: 'center', gap: spacing.xs },
  totalValue: { fontFamily: fontFamily.bold, fontSize: 36, lineHeight: 42 },
  totalGoal: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  track: { alignSelf: 'stretch', height: 8, borderRadius: radius.pill, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: 8, borderRadius: radius.pill },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, textAlign: 'center', marginTop: spacing.xs },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  quickText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  input: { flex: 1, fontFamily: fontFamily.semibold, fontSize: fontSize.body, paddingVertical: spacing.sm },
  unit: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  setBtn: { paddingHorizontal: spacing.sm, minHeight: TOUCH_TARGET, justifyContent: 'center' },
  setText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
});
