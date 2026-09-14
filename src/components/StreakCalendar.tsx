import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';
import type { DayScore } from '../storage/stats';
import { fromDayKey } from '../utils/date';

const COLUMNS = 7;
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

type Props = {
  days: DayScore[];
};

/**
 * Calendar heat-map of the trailing window. Completion is shown by fill opacity
 * plus a ring on full days, so the reading never rests on colour alone.
 */
export function StreakCalendar({ days }: Props) {
  const { colors } = useTheme();

  // Pad the front so the first cell lands under its weekday column (Monday-first).
  const first = days[0];
  const lead = first ? (fromDayKey(first.dayKey).getDay() + 6) % 7 : 0;
  const cells: (DayScore | null)[] = [...Array(lead).fill(null), ...days];

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        {DAY_LABELS.map((label, i) => (
          <Text
            key={`${label}-${i}`}
            style={[styles.dayLabel, { color: colors.mutedForeground }]}
          >
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) {
            return <View key={`pad-${index}`} style={[styles.cell, styles.cellEmpty]} />;
          }

          const complete = day.scheduled > 0 && day.done === day.scheduled;
          const hasWork = day.scheduled > 0;
          const rate = day.rate ?? 0;

          return (
            <View
              key={day.dayKey}
              accessibilityLabel={
                hasWork
                  ? `${day.dayKey}: ${day.done} de ${day.scheduled} completadas`
                  : `${day.dayKey}: sin actividades`
              }
              style={[
                styles.cell,
                {
                  backgroundColor: hasWork ? colors.primary : colors.muted,
                  // Partial days fade in proportion to what was finished, so a
                  // full day is simply the strongest cell in the grid.
                  opacity: hasWork ? 0.22 + rate * 0.78 : 1,
                  borderColor: complete ? colors.foreground : 'transparent',
                  borderWidth: complete ? 2 : 0,
                },
              ]}
            >
              <Text
                style={[
                  styles.cellText,
                  {
                    color: hasWork ? colors.onPrimary : colors.mutedForeground,
                  },
                ]}
              >
                {fromDayKey(day.dayKey).getDate()}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: colors.muted }]} />
        <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Sin nada</Text>
        <View style={[styles.legendDot, { backgroundColor: colors.primary, opacity: 0.5 }]} />
        <Text style={[styles.legendText, { color: colors.mutedForeground }]}>A medias</Text>
        <View
          style={[
            styles.legendDot,
            { backgroundColor: colors.primary, borderColor: colors.foreground, borderWidth: 2 },
          ]}
        />
        <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Completo</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  labelRow: { flexDirection: 'row' },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / COLUMNS}%`,
    aspectRatio: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    // Inset via transform-free margin so the percentage width stays exact.
    marginVertical: 2,
  },
  cellEmpty: { backgroundColor: 'transparent' },
  cellText: { fontFamily: fontFamily.semibold, fontSize: 10 },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  legendDot: { width: 10, height: 10, borderRadius: 3, marginLeft: spacing.sm },
  legendText: { fontFamily: fontFamily.regular, fontSize: fontSize.caption },
});
