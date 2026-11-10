import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatKg } from '../../lib/nutrition/format';
import { WORKOUT_LABELS } from '../../lib/nutrition/met';
import { parseDecimal } from '../../lib/nutrition/parse';
import { formatHours } from '../../lib/nutrition/sleep';
import { formatLiters } from '../../lib/nutrition/water';
import type { SleepFields, WorkoutDraft } from '../../storage/nutritionReducers';
import { Ionicons } from '../../theme/Ionicons';
import type { IconName } from '../../theme/icons';
import { shadow } from '../../theme/shadows';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import type { SleepLog, WaterLog, WeightEntry, Workout } from '../../types/nutrition';
import * as Haptics from '../../utils/haptics';
import { SleepSheet } from './SleepSheet';
import { WaterSheet } from './WaterSheet';
import { WorkoutSheet } from './WorkoutSheet';

type Props = {
  date: string;
  weight: WeightEntry | null;
  sleep: SleepLog | null;
  water: WaterLog | null;
  workouts: Workout[];
  /** Body weight for workout kcal estimates. */
  weightKg: number;
  onSetWeight: (kg: number) => void;
  onSetSleep: (log: SleepFields) => void;
  onAddWater: (deltaMl: number) => void;
  onSetWater: (ml: number) => void;
  onAddWorkout: (w: WorkoutDraft) => void;
  onDeleteWorkout: (id: string) => void;
  readOnly?: boolean;
};

function workoutSummary(workouts: Workout[]): string {
  return workouts.length === 0
    ? 'sin entreno'
    : workouts.map((w) => `${WORKOUT_LABELS[w.kind]} ${w.minutes}'`).join(' · ');
}

/** Daily check-in: weight, sleep, water and workouts for the day. */
export function CheckInCard({
  date,
  weight,
  sleep,
  water,
  workouts,
  weightKg,
  onSetWeight,
  onSetSleep,
  onAddWater,
  onSetWater,
  onAddWorkout,
  onDeleteWorkout,
  readOnly = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightText, setWeightText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [sheet, setSheet] = useState<'sleep' | 'water' | 'workout' | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const weightInput = useRef<TextInput>(null);

  // Each day starts collapsed (when complete) and with no edit in progress.
  useEffect(() => {
    setExpanded(false);
    setEditingWeight(false);
    setInvalid(false);
    setSheet(null);
  }, [date]);

  const complete = weight !== null && sleep !== null;
  const cardStyle = [
    styles.card,
    shadow('sm', isDark),
    { backgroundColor: colors.surface, borderColor: colors.border },
  ];

  if (complete && !expanded && !editingWeight && sheet === null) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel="Ver check-in del día"
        style={({ pressed }) => [cardStyle, styles.collapsed, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
        <Text numberOfLines={1} style={[styles.collapsedText, { color: colors.foreground }]}>
          {formatKg(weight.weightKg)} · {formatHours(sleep.durationMin)} · {formatLiters(water?.ml ?? 0)} ·{' '}
          {workoutSummary(workouts)}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  const startWeight = () => {
    if (readOnly) return;
    setWeightText(weight ? weight.weightKg.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : '');
    setInvalid(false);
    setEditingWeight(true);
  };

  const commitWeight = () => {
    const kg = parseDecimal(weightText);
    if (weightText.trim() === '') {
      setEditingWeight(false);
      return;
    }
    if (kg === null || kg < 20 || kg > 400) {
      setInvalid(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Animated.sequence(
        [8, -8, 6, -6, 0].map((toValue) =>
          Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true }),
        ),
      ).start();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSetWeight(Math.round(kg * 10) / 10);
    setInvalid(false);
    setEditingWeight(false);
  };

  return (
    <View style={cardStyle}>
      <View style={styles.cells}>
        {editingWeight ? (
          <Animated.View
            style={[
              styles.cell,
              {
                borderColor: invalid ? colors.destructive : colors.primary,
                backgroundColor: colors.muted,
                transform: [{ translateX: shake }],
              },
            ]}
          >
            <Ionicons name="scale-outline" size={18} color={colors.primary} />
            <View style={styles.inputRow}>
              <TextInput
                ref={weightInput}
                autoFocus
                value={weightText}
                onChangeText={(t) => {
                  setWeightText(t);
                  setInvalid(false);
                }}
                onBlur={commitWeight}
                onSubmitEditing={() => weightInput.current?.blur()}
                inputMode="decimal"
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="65,4"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Peso en kilos"
                style={[styles.input, { color: colors.foreground }]}
              />
              <Text style={[styles.unit, { color: colors.mutedForeground }]}>kg</Text>
            </View>
          </Animated.View>
        ) : (
          <Cell
            icon="scale-outline"
            label="Peso"
            value={weight ? formatKg(weight.weightKg) : null}
            onPress={startWeight}
            disabled={readOnly}
          />
        )}
        <Cell
          icon="bed-outline"
          label="Sueño"
          value={sleep ? formatHours(sleep.durationMin) : null}
          onPress={() => setSheet('sleep')}
          disabled={readOnly}
        />
        <Cell
          icon="water-outline"
          label="Agua"
          value={water ? formatLiters(water.ml) : null}
          onPress={() => setSheet('water')}
          disabled={readOnly && water === null}
        />
        <Cell
          icon="barbell-outline"
          label="Entreno"
          value={workouts.length > 0 ? workoutSummary(workouts) : null}
          onPress={() => setSheet('workout')}
          // Read-only viewers can still open the list, they just cannot change it.
          disabled={readOnly && workouts.length === 0}
        />
      </View>

      {complete ? (
        <Pressable
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          accessibilityLabel="Contraer check-in"
          hitSlop={8}
          style={styles.collapse}
        >
          <Ionicons name="chevron-up" size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : null}

      <SleepSheet visible={sheet === 'sleep'} sleep={sleep} onSave={onSetSleep} onClose={() => setSheet(null)} />
      <WaterSheet
        visible={sheet === 'water'}
        water={water}
        weightKg={weightKg}
        readOnly={readOnly}
        onAdd={onAddWater}
        onSet={onSetWater}
        onClose={() => setSheet(null)}
      />
      <WorkoutSheet
        visible={sheet === 'workout'}
        date={date}
        workouts={workouts}
        weightKg={weightKg}
        readOnly={readOnly}
        onAdd={onAddWorkout}
        onDelete={onDeleteWorkout}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function Cell({
  icon,
  label,
  value,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? 'sin registrar'}`}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.cell,
        { borderColor: colors.border, backgroundColor: colors.muted, opacity: pressed && !disabled ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={18} color={value ? colors.primary : colors.mutedForeground} />
      <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.cellValue, { color: value ? colors.foreground : colors.mutedForeground }]}>
        {value ?? (disabled ? '—' : 'Registrar')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  collapsed: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH_TARGET },
  collapsedText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.footnote },
  cells: { flexDirection: 'row', gap: spacing.xs },
  cell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: 2,
    minHeight: 76,
  },
  cellLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  cellValue: { fontFamily: fontFamily.semibold, fontSize: fontSize.label },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.body,
    paddingVertical: 4,
  },
  unit: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  collapse: { alignSelf: 'center', paddingHorizontal: spacing.md },
});
