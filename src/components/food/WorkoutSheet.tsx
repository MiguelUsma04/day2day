import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { workoutKcal, WORKOUT_LABELS } from '../../lib/nutrition/met';
import { parseDecimal } from '../../lib/nutrition/parse';
import type { WorkoutDraft } from '../../storage/nutritionReducers';
import { Ionicons } from '../../theme/Ionicons';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import { WORKOUT_KINDS, type Workout, type WorkoutIntensity, type WorkoutKind } from '../../types/nutrition';
import * as Haptics from '../../utils/haptics';
import { playDelete } from '../../utils/sound';
import { ConfirmDialog } from '../ConfirmDialog';
import { Chip, PrimaryButton, Sheet, sheetStyles } from './Sheet';

const INTENSITIES: { id: WorkoutIntensity; label: string }[] = [
  { id: 'light', label: 'Suave' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Fuerte' },
];
const STEP = 5;
const DEFAULT_MINUTES = 45;

type Props = {
  visible: boolean;
  date: string;
  workouts: Workout[];
  /** Body weight used for the kcal estimate. */
  weightKg: number;
  readOnly?: boolean;
  onAdd: (w: WorkoutDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function WorkoutSheet({ visible, date, workouts, weightKg, readOnly = false, onAdd, onDelete, onClose }: Props) {
  const { colors } = useTheme();
  const [kind, setKind] = useState<WorkoutKind>('gym_strength');
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [intensity, setIntensity] = useState<WorkoutIntensity>('normal');
  const [confirm, setConfirm] = useState<Workout | null>(null);
  const [kcalText, setKcalText] = useState('');

  // A fresh form every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setKind('gym_strength');
    setMinutes(DEFAULT_MINUTES);
    setIntensity('normal');
    setKcalText('');
  }, [visible]);

  const estimate = workoutKcal(kind, intensity, minutes, weightKg);
  const reported = parseDecimal(kcalText);
  const useReported = kcalText.trim() !== '' && reported !== null && reported > 0 && reported <= 5000;
  const kcal = useReported ? Math.round(reported) : estimate;

  const step = (delta: number) => {
    void Haptics.selectionAsync();
    setMinutes((m) => Math.min(600, Math.max(STEP, m + delta)));
  };

  const add = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd({ date, kind, minutes, intensity, kcalNet: useReported ? Math.round(reported) : null });
  };

  return (
    <>
      <Sheet
        visible={visible}
        title="Entreno"
        onClose={onClose}
        footer={
          readOnly ? null : <PrimaryButton label={`Agregar · ${useReported ? '' : '≈ '}${kcal} kcal`} onPress={add} />
        }
      >
        {workouts.length > 0 ? (
          <View style={sheetStyles.field}>
            <Text style={[sheetStyles.label, { color: colors.foreground }]}>Hoy</Text>
            {workouts.map((w) => (
              <View key={w.id} style={[styles.logged, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <Text style={[styles.loggedText, { color: colors.foreground }]}>
                  {WORKOUT_LABELS[w.kind]} {w.minutes}' · {w.kcalNet} kcal
                </Text>
                {readOnly ? null : (
                  <Pressable
                    onPress={() => setConfirm(w)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar ${WORKOUT_LABELS[w.kind]}`}
                    style={({ pressed }) => [styles.remove, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name="close" size={18} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {readOnly ? null : (
          <>
            <View style={sheetStyles.field}>
              <Text style={[sheetStyles.label, { color: colors.foreground }]}>Tipo</Text>
              <View style={sheetStyles.chips}>
                {WORKOUT_KINDS.map((k) => (
                  <Chip key={k} label={WORKOUT_LABELS[k]} active={k === kind} onPress={() => setKind(k)} />
                ))}
              </View>
            </View>

            <View style={sheetStyles.field}>
              <Text style={[sheetStyles.label, { color: colors.foreground }]}>Minutos</Text>
              <View style={[styles.stepper, { borderColor: colors.border }]}>
                <Pressable
                  onPress={() => step(-STEP)}
                  accessibilityRole="button"
                  accessibilityLabel="Menos 5 minutos"
                  style={({ pressed }) => [styles.stepBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="remove" size={22} color={colors.foreground} />
                </Pressable>
                <Text style={[styles.stepValue, { color: colors.foreground }]}>{minutes} min</Text>
                <Pressable
                  onPress={() => step(STEP)}
                  accessibilityRole="button"
                  accessibilityLabel="Más 5 minutos"
                  style={({ pressed }) => [styles.stepBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="add" size={22} color={colors.foreground} />
                </Pressable>
              </View>
            </View>

            <View style={sheetStyles.field}>
              <Text style={[sheetStyles.label, { color: colors.foreground }]}>Intensidad</Text>
              <View style={sheetStyles.chips}>
                {INTENSITIES.map((i) => (
                  <Chip key={i.id} label={i.label} active={i.id === intensity} onPress={() => setIntensity(i.id)} />
                ))}
              </View>
              <Text style={[styles.estimate, { color: colors.mutedForeground }]}>≈ {estimate} kcal estimadas</Text>
            </View>

            <View style={sheetStyles.field}>
              <Text style={[sheetStyles.label, { color: colors.foreground }]}>Calorías quemadas (opcional)</Text>
              <View style={[styles.kcalRow, { borderColor: colors.border }]}>
                <TextInput
                  value={kcalText}
                  onChangeText={setKcalText}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  placeholder={String(estimate)}
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="Calorías quemadas según el reloj o la máquina"
                  style={[styles.kcalInput, { color: colors.foreground }]}
                />
                <Text style={[styles.estimate, { color: colors.mutedForeground }]}>kcal</Text>
              </View>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Si el reloj o la caminadora te dan el dato, escríbelo aquí y reemplaza la estimación.
              </Text>
            </View>
          </>
        )}
      </Sheet>

      <ConfirmDialog
        visible={confirm !== null}
        title="¿Eliminar entreno?"
        message={confirm ? `${WORKOUT_LABELS[confirm.kind]} de ${confirm.minutes} min se borrará.` : ''}
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            onDelete(confirm.id);
            playDelete();
          }
          setConfirm(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  logged: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  loggedText: { fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
  remove: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
  },
  stepBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: fontFamily.bold, fontSize: fontSize.body },
  estimate: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  kcalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  kcalInput: { flex: 1, fontFamily: fontFamily.semibold, fontSize: fontSize.body, paddingVertical: spacing.sm },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 16 },
});
