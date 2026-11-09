import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { MeasurementForm, type MeasurementFields } from '../components/profile/MeasurementForm';
import { parseDecimal } from '../lib/nutrition/parse';
import { clampRate, dailyTarget, rebalanceMacros } from '../lib/nutrition/targets';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, PHONE_MAX_WIDTH, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import type { BodyMeasurement, Goal, Macros, Profile, Sex } from '../types/nutrition';
import { toDayKey } from '../utils/date';
import {
  defaultRateFor,
  formatRate,
  formatSleepGoal,
  profileDraftIsValid,
  stepRate,
} from './profileForm';

type ProfileFields = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;
type Activity = Profile['activityFactor'];

type Props = {
  visible: boolean;
  profile: Profile | null;
  measurements: BodyMeasurement[];
  currentWeightKg: number | null;
  onSave(patch: ProfileFields): void;
  onAddMeasurement(m: MeasurementFields): void;
  onUpdateMeasurement(id: string, patch: Partial<MeasurementFields>): void;
  onDeleteMeasurement(id: string): void;
  onClose(): void;
};

const GOALS: { value: Goal; label: string }[] = [
  { value: 'lose_fat', label: 'Bajar grasa' },
  { value: 'maintain', label: 'Mantener' },
  { value: 'gain_muscle', label: 'Ganar músculo' },
];
const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: 1.2, label: 'Sedentario' },
  { value: 1.375, label: 'Ligero' },
  { value: 1.55, label: 'Moderado' },
];
const PROTEIN_RULE: Record<Goal, number> = { lose_fat: 1.8, maintain: 1.6, gain_muscle: 2.0 };
const METHOD_TEXT = {
  katch: 'Katch-McArdle (con tu % de grasa)',
  mifflin: 'Mifflin-St Jeor',
} as const;

const dec = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function shortDate(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
const fmt = (n: number) => n.toLocaleString('es-CO');

export function ProfileScreen({
  visible,
  profile,
  measurements,
  currentWeightKg,
  onSave,
  onAddMeasurement,
  onUpdateMeasurement,
  onDeleteMeasurement,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [sex, setSex] = useState<Sex | null>(profile?.sex ?? null);
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [height, setHeight] = useState(dec(profile?.heightCm ?? null));
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? 'maintain');
  const [rate, setRate] = useState(profile?.weeklyRateKg ?? 0);
  const [targetWeight, setTargetWeight] = useState(dec(profile?.targetWeightKg ?? null));
  const [targetFat, setTargetFat] = useState(dec(profile?.targetFatPct ?? null));
  const [activity, setActivity] = useState<Activity>(profile?.activityFactor ?? 1.375);
  const [protein, setProtein] = useState(dec(profile?.proteinGPerKg ?? null));
  const [sleepGoal, setSleepGoal] = useState(profile?.sleepGoalMin ?? 450);
  const [workouts, setWorkouts] = useState(profile?.workoutsPerWeek ?? 3);

  const [editing, setEditing] = useState<BodyMeasurement | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BodyMeasurement | null>(null);
  const [edited, setEdited] = useState<Macros | null>(null);

  // Re-seed the form each time the sheet opens (the profile may have synced meanwhile).
  useEffect(() => {
    if (!visible) return;
    setSex(profile?.sex ?? null);
    setBirthDate(profile?.birthDate ?? '');
    setHeight(dec(profile?.heightCm ?? null));
    setGoal(profile?.goal ?? 'maintain');
    setRate(profile?.weeklyRateKg ?? 0);
    setTargetWeight(dec(profile?.targetWeightKg ?? null));
    setTargetFat(dec(profile?.targetFatPct ?? null));
    setActivity(profile?.activityFactor ?? 1.375);
    setProtein(dec(profile?.proteinGPerKg ?? null));
    setSleepGoal(profile?.sleepGoalMin ?? 450);
    setWorkouts(profile?.workoutsPerWeek ?? 3);
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const heightCm = parseDecimal(height);
  const proteinPerKg = parseDecimal(protein);
  const valid = profileDraftIsValid({ sex, birthDate, heightCm });

  const sorted = useMemo(
    () => [...measurements].sort((a, b) => b.date.localeCompare(a.date)),
    [measurements],
  );
  const latest = sorted[0] ?? null;
  const weightKg = currentWeightKg ?? latest?.weightKg ?? null;

  const draft: Profile | null = valid
    ? {
        id: profile?.id ?? 'draft',
        createdAt: profile?.createdAt ?? 0,
        updatedAt: profile?.updatedAt ?? 0,
        sex: sex as Sex,
        birthDate,
        heightCm: heightCm as number,
        goal,
        weeklyRateKg: clampRate(goal, rate),
        targetWeightKg: parseDecimal(targetWeight),
        targetFatPct: parseDecimal(targetFat),
        activityFactor: activity,
        proteinGPerKg: proteinPerKg != null && proteinPerKg > 0 ? proteinPerKg : null,
        sleepGoalMin: sleepGoal,
        workoutsPerWeek: workouts,
      }
    : null;

  const target = useMemo(
    () =>
      draft && weightKg != null
        ? dailyTarget({ profile: draft, weightKg, latest, today: toDayKey(new Date()), workoutKcal: 0 })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valid, sex, birthDate, heightCm, goal, rate, activity, proteinPerKg, weightKg, latest],
  );
  useEffect(() => setEdited(null), [target?.kcal, target?.proteinG, target?.carbsG, target?.fatG]);
  const shown: Macros | null = edited ?? target;

  const pickGoal = (g: Goal) => {
    if (g === goal) return;
    setGoal(g);
    setRate(defaultRateFor(g));
  };

  const save = () => {
    if (!draft) return;
    const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = draft;
    onSave(fields);
    onClose();
  };

  const saveMeasurement = (fields: MeasurementFields) => {
    if (editing && editing !== 'new') onUpdateMeasurement(editing.id, fields);
    else onAddMeasurement(fields);
    setEditing(null);
  };

  const input = [
    styles.input,
    { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface },
  ];
  const text = (v: string, set: (s: string) => void, placeholder?: string) => (
    <TextInput
      value={v}
      onChangeText={set}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      inputMode="decimal"
      keyboardType="decimal-pad"
      style={input}
    />
  );
  const chip = (on: boolean, label: string, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[
        styles.chip,
        { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' },
      ]}
    >
      <Text style={[styles.chipText, { color: on ? colors.onPrimary : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
  const stepper = (label: string, onMinus: () => void, onPlus: () => void) => (
    <View style={styles.stepper}>
      <Pressable
        onPress={onMinus}
        accessibilityRole="button"
        accessibilityLabel="Menos"
        style={[styles.stepBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.stepGlyph, { color: colors.foreground }]}>−</Text>
      </Pressable>
      <Text style={[styles.stepValue, { color: colors.foreground }]}>{label}</Text>
      <Pressable
        onPress={onPlus}
        accessibilityRole="button"
        accessibilityLabel="Más"
        style={[styles.stepBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.stepGlyph, { color: colors.foreground }]}>+</Text>
      </Pressable>
    </View>
  );
  const label = (s: string) => <Text style={[styles.label, { color: colors.mutedForeground }]}>{s}</Text>;

  const macroStep = (key: 'proteinG' | 'carbsG' | 'fatG', name: string, step: number) =>
    shown ? (
      <View style={styles.macroRow} key={key}>
        <Text style={[styles.macroName, { color: colors.foreground }]}>{name}</Text>
        {stepper(
          `${shown[key]} g`,
          () => setEdited(rebalanceMacros(shown, { [key]: shown[key] - step } as { proteinG: number })),
          () => setEdited(rebalanceMacros(shown, { [key]: shown[key] + step } as { proteinG: number })),
        )}
      </View>
    ) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.frame, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Mi perfil y metas</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.close}>
              <Text style={[styles.stepGlyph, { color: colors.foreground }]}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {label('Sexo')}
            <View style={styles.row}>
              {chip(sex === 'female', 'Mujer', () => setSex('female'))}
              {chip(sex === 'male', 'Hombre', () => setSex('male'))}
            </View>

            {label('Fecha de nacimiento')}
            {React.createElement('input', {
              type: 'date',
              value: birthDate,
              max: toDayKey(new Date()),
              onChange: (e: { target: { value: string } }) => setBirthDate(e.target.value),
              style: {
                minHeight: TOUCH_TARGET,
                borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                padding: `0 ${spacing.md}px`,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.body,
                color: colors.foreground,
                backgroundColor: colors.surface,
                colorScheme: 'normal',
                boxSizing: 'border-box',
                width: '100%',
              },
            })}

            {label('Altura (cm)')}
            {text(height, setHeight)}

            {label('Objetivo')}
            <View style={styles.row}>{GOALS.map((g) => chip(goal === g.value, g.label, () => pickGoal(g.value)))}</View>

            {label('Ritmo semanal')}
            {stepper(
              formatRate(clampRate(goal, rate)),
              () => setRate(stepRate(goal, rate, -0.05)),
              () => setRate(stepRate(goal, rate, 0.05)),
            )}

            {label('Peso meta (opcional, kg)')}
            {text(targetWeight, setTargetWeight)}
            {label('% grasa meta (opcional)')}
            {text(targetFat, setTargetFat)}

            {label('Actividad base')}
            <View style={styles.row}>
              {ACTIVITIES.map((a) => chip(activity === a.value, a.label, () => setActivity(a.value)))}
            </View>

            {label('Proteína g/kg (opcional)')}
            {text(protein, setProtein, String(PROTEIN_RULE[goal]).replace('.', ','))}

            {label('Meta de sueño')}
            {stepper(
              formatSleepGoal(sleepGoal),
              () => setSleepGoal(Math.max(240, sleepGoal - 15)),
              () => setSleepGoal(Math.min(720, sleepGoal + 15)),
            )}

            {label('Entrenos por semana')}
            {stepper(
              String(workouts),
              () => setWorkouts(Math.max(0, workouts - 1)),
              () => setWorkouts(Math.min(14, workouts + 1)),
            )}

            <Pressable
              onPress={save}
              disabled={!valid}
              accessibilityRole="button"
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: valid ? 1 : 0.4 }]}
            >
              <Text style={[styles.saveText, { color: colors.onPrimary }]}>Guardar perfil</Text>
            </Pressable>

            {/* ---- Today's target ---- */}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Tu meta hoy</Text>
              {target && shown && draft ? (
                <>
                  <Text style={[styles.kcal, { color: colors.foreground }]}>{fmt(shown.kcal)} kcal</Text>
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                    Proteína {shown.proteinG} g · Carbos {shown.carbsG} g · Grasa {shown.fatG} g
                  </Text>
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                    {target.method === 'measured' && latest
                      ? `BMR medido del ${shortDate(latest.date)}`
                      : METHOD_TEXT[target.method === 'katch' ? 'katch' : 'mifflin']}
                  </Text>
                  {target.floorApplied ? (
                    <Text style={[styles.hint, { color: colors.destructive }]}>
                      La meta no baja de {fmt(target.kcal)} kcal; el ritmo real será menor.
                    </Text>
                  ) : null}
                  {macroStep('proteinG', 'Proteína', 5)}
                  {macroStep('carbsG', 'Carbos', 10)}
                  {macroStep('fatG', 'Grasa', 5)}
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                    Los macros que ajustes aquí son solo una vista; no se guardan.
                  </Text>
                </>
              ) : (
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  {valid
                    ? 'Registra tu peso en Comida para ver tu meta.'
                    : 'Completa sexo, fecha de nacimiento y altura para ver tu meta.'}
                </Text>
              )}
            </View>

            {/* ---- Measurements ---- */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Mediciones corporales</Text>
            {sorted.map((m) =>
              editing && editing !== 'new' && editing.id === m.id ? (
                <MeasurementForm
                  key={m.id}
                  initial={m}
                  onSave={saveMeasurement}
                  onCancel={() => setEditing(null)}
                  onDelete={() => setPendingDelete(m)}
                />
              ) : (
                <Pressable
                  key={m.id}
                  onPress={() => setEditing(m)}
                  accessibilityRole="button"
                  style={[styles.mRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.mDate, { color: colors.foreground }]}>{shortDate(m.date)}</Text>
                  <Text style={[styles.hint, { color: colors.mutedForeground, flex: 1 }]}>
                    {[
                      m.weightKg != null ? `${dec(m.weightKg)} kg` : null,
                      m.fatPct != null ? `${dec(m.fatPct)} % grasa` : null,
                      m.waistCm != null ? `cintura ${dec(m.waistCm)} cm` : null,
                      m.bmrMeasured != null ? `BMR ${fmt(m.bmrMeasured)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sin datos'}
                  </Text>
                </Pressable>
              ),
            )}
            {sorted.length === 0 && editing !== 'new' ? (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>Aún no hay mediciones.</Text>
            ) : null}
            {editing === 'new' ? (
              <MeasurementForm initial={null} onSave={saveMeasurement} onCancel={() => setEditing(null)} />
            ) : (
              <Pressable
                onPress={() => setEditing('new')}
                accessibilityRole="button"
                style={[styles.addBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.saveText, { color: colors.foreground }]}>＋ Agregar medición</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>

        <ConfirmDialog
          visible={pendingDelete !== null}
          title="¿Eliminar medición?"
          message="Se borrará esta medición corporal."
          confirmLabel="Sí, eliminar"
          destructive
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) onDeleteMeasurement(pendingDelete.id);
            setPendingDelete(null);
            setEditing(null);
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  frame: { flex: 1, width: '100%', maxWidth: PHONE_MAX_WIDTH, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.title },
  close: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, marginTop: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontFamily: fontFamily.semibold, fontSize: fontSize.callout },
  stepValue: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, minWidth: 96, textAlign: 'center' },
  saveBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  saveText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginTop: spacing.lg },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  kcal: { fontFamily: fontFamily.bold, fontSize: fontSize.headline },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18 },
  macroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  macroName: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.callout, marginTop: spacing.xl },
  mRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  mDate: { fontFamily: fontFamily.semibold, fontSize: fontSize.label, minWidth: 48 },
  addBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
