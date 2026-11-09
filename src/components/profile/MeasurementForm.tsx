import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseDecimal } from '../../lib/nutrition/parse';
import { isValidDateKey } from '../../screens/profileForm';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import type { BodyMeasurement } from '../../types/nutrition';
import { toDayKey } from '../../utils/date';

export type MeasurementFields = Omit<BodyMeasurement, 'id' | 'createdAt' | 'updatedAt'>;

const SOURCES: { value: MeasurementFields['source']; label: string }[] = [
  { value: 'scale', label: 'Báscula' },
  { value: 'bioimpedance', label: 'Bioimpedancia' },
  { value: 'tape', label: 'Cinta' },
];

type NumKey = Exclude<keyof MeasurementFields, 'date' | 'source'>;
const NUMERIC: { key: NumKey; label: string }[] = [
  { key: 'weightKg', label: 'Peso (kg)' },
  { key: 'fatPct', label: '% grasa' },
  { key: 'fatMassKg', label: 'Masa grasa (kg)' },
  { key: 'leanMassKg', label: 'Masa libre de grasa (kg)' },
  { key: 'skeletalMuscleKg', label: 'Músculo esquelético (kg)' },
  { key: 'visceralFatLevel', label: 'Grasa visceral' },
  { key: 'bmrMeasured', label: 'BMR medido (kcal)' },
  { key: 'waistCm', label: 'Cintura (cm)' },
];

type Props = {
  initial: BodyMeasurement | null;
  onSave: (fields: MeasurementFields) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

/** Inline form to add or edit one body measurement. */
export function MeasurementForm({ initial, onSave, onCancel, onDelete }: Props) {
  const { colors } = useTheme();
  const [date, setDate] = useState(initial?.date ?? toDayKey(new Date()));
  const [source, setSource] = useState<MeasurementFields['source']>(initial?.source ?? 'scale');
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      NUMERIC.map(({ key }) => [key, initial?.[key] != null ? String(initial[key]).replace('.', ',') : '']),
    ),
  );

  const canSave = isValidDateKey(date);

  const save = () => {
    if (!canSave) return;
    const num = (k: NumKey) => parseDecimal(text[k] ?? '');
    onSave({
      date,
      source,
      weightKg: num('weightKg'),
      fatPct: num('fatPct'),
      fatMassKg: num('fatMassKg'),
      leanMassKg: num('leanMassKg'),
      skeletalMuscleKg: num('skeletalMuscleKg'),
      visceralFatLevel: num('visceralFatLevel'),
      bmrMeasured: num('bmrMeasured'),
      waistCm: num('waistCm'),
    });
  };

  const input = [
    styles.input,
    { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
  ];

  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Fecha (AAAA-MM-DD)</Text>
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder="AAAA-MM-DD"
        placeholderTextColor={colors.mutedForeground}
        style={input}
      />
      {NUMERIC.map(({ key, label }) => (
        <View key={key} style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
          <TextInput
            value={text[key]}
            onChangeText={(v) => setText((t) => ({ ...t, [key]: v }))}
            inputMode="decimal"
            keyboardType="decimal-pad"
            style={input}
          />
        </View>
      ))}
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Fuente</Text>
      <View style={styles.row}>
        {SOURCES.map((s) => {
          const on = source === s.value;
          return (
            <Pressable
              key={s.value}
              onPress={() => setSource(s.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.chip,
                {
                  borderColor: on ? colors.primary : colors.border,
                  backgroundColor: on ? colors.primary : 'transparent',
                },
              ]}
            >
              <Text style={[styles.chipText, { color: on ? colors.onPrimary : colors.foreground }]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          style={[styles.btn, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.4 }]}
        >
          <Text style={[styles.btnText, { color: colors.onPrimary }]}>Guardar</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}
        >
          <Text style={[styles.btnText, { color: colors.foreground }]}>Cancelar</Text>
        </Pressable>
        {onDelete ? (
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            style={[styles.btn, { borderWidth: 1, borderColor: colors.destructive }]}
          >
            <Text style={[styles.btnText, { color: colors.destructive }]}>Eliminar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  field: { gap: 4 },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  btn: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
});
