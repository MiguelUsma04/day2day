import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize } from '../theme/tokens';

type Props = {
  total: number;
  done: number;
  size?: number;
};

/**
 * Progress readout. Uses a segmented bar rather than an SVG arc so it stays
 * crisp at any size and needs no extra dependency.
 */
export function ProgressRing({ total, done, size = 8 }: Props) {
  const { colors } = useTheme();
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      accessibilityLabel={`${done} de ${total} tareas completadas`}
    >
      <View style={styles.labelRow}>
        <Text style={[styles.count, { color: colors.foreground }]}>
          {done}/{total}
        </Text>
        <Text style={[styles.pct, { color: colors.mutedForeground }]}>{pct}%</Text>
      </View>

      <View
        style={[styles.track, { backgroundColor: colors.muted, height: size, borderRadius: size }]}
      >
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: size,
            backgroundColor: pct === 100 ? colors.accent : colors.primary,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  count: { fontFamily: fontFamily.bold, fontSize: fontSize.footnote },
  pct: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  track: { width: '100%', overflow: 'hidden' },
});
