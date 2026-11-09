import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { parseDecimal } from '../../lib/nutrition/parse';
import { formatHours, sleepDuration } from '../../lib/nutrition/sleep';
import type { SleepFields } from '../../storage/nutritionReducers';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import type { SleepLog } from '../../types/nutrition';
import { TimePicker } from '../TimePicker';
import { Chip, PrimaryButton, Sheet, sheetStyles } from './Sheet';

const DEFAULT_BED = 23 * 60;
const DEFAULT_WAKE = 6 * 60 + 30;

type Props = {
  visible: boolean;
  sleep: SleepLog | null;
  onSave: (log: SleepFields) => void;
  onClose: () => void;
};

/** Bed and wake times, or just the hours slept when the times are unknown. */
export function SleepSheet({ visible, sleep, onSave, onClose }: Props) {
  const { colors } = useTheme();
  const [hoursOnly, setHoursOnly] = useState(false);
  const [bed, setBed] = useState<number | null>(DEFAULT_BED);
  const [wake, setWake] = useState<number | null>(DEFAULT_WAKE);
  const [hoursText, setHoursText] = useState('');

  useEffect(() => {
    if (!visible) return;
    const timed = sleep !== null && sleep.bedAtMinutes !== null && sleep.wakeAtMinutes !== null;
    setHoursOnly(sleep !== null && !timed);
    setBed(sleep?.bedAtMinutes ?? DEFAULT_BED);
    setWake(sleep?.wakeAtMinutes ?? DEFAULT_WAKE);
    setHoursText(
      sleep ? (sleep.durationMin / 60).toLocaleString('es-CO', { maximumFractionDigits: 2 }) : '',
    );
  }, [visible, sleep]);

  const hours = parseDecimal(hoursText);
  const hoursValid = hours !== null && hours > 0 && hours <= 24;
  const duration = hoursOnly
    ? hoursValid
      ? Math.round(hours * 60)
      : null
    : bed !== null && wake !== null
      ? sleepDuration(bed, wake)
      : null;

  const save = () => {
    if (duration === null) return;
    onSave(
      hoursOnly
        ? { bedAtMinutes: null, wakeAtMinutes: null, durationMin: duration }
        : { bedAtMinutes: bed, wakeAtMinutes: wake, durationMin: duration },
    );
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title="Sueño"
      onClose={onClose}
      footer={
        <PrimaryButton
          label={duration === null ? 'Guardar' : `Guardar · ${formatHours(duration)}`}
          onPress={save}
          disabled={duration === null}
        />
      }
    >
      <View style={sheetStyles.chips}>
        <Chip label="Horas de acostarse y levantarse" active={!hoursOnly} onPress={() => setHoursOnly(false)} />
        <Chip label="Solo horas" active={hoursOnly} onPress={() => setHoursOnly(true)} />
      </View>

      {hoursOnly ? (
        <View style={sheetStyles.field}>
          <Text style={[sheetStyles.label, { color: colors.foreground }]}>Horas dormidas</Text>
          <TextInput
            value={hoursText}
            onChangeText={setHoursText}
            onSubmitEditing={save}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder="7,5"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Horas dormidas"
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderColor: hoursText.trim() !== '' && !hoursValid ? colors.destructive : colors.border,
              },
            ]}
          />
        </View>
      ) : (
        <>
          <View style={sheetStyles.field}>
            <Text style={[sheetStyles.label, { color: colors.foreground }]}>Me acosté</Text>
            <TimePicker value={bed} onChange={setBed} />
          </View>
          <View style={sheetStyles.field}>
            <Text style={[sheetStyles.label, { color: colors.foreground }]}>Me levanté</Text>
            <TimePicker value={wake} onChange={setWake} />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
  },
});
