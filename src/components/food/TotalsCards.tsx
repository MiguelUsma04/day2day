import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '../../lib/nutrition/format';
import type { DailyTarget } from '../../lib/nutrition/targets';
import { Ionicons } from '../../theme/Ionicons';
import { shadow } from '../../theme/shadows';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, palette, radius, spacing, TOUCH_TARGET } from '../../theme/tokens';
import type { Macros } from '../../types/nutrition';

/** Over-target accent; the theme has no warning token yet. */
const WARNING = palette.amber500;

type Props = {
  totals: Macros;
  target: DailyTarget | null;
  onOpenProfile: () => void;
};

/** Calories and protein eaten today against the daily target. */
export function TotalsCards({ totals, target, onOpenProfile }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TotalCard
          label="Calorías"
          value={totals.kcal}
          target={target?.kcal ?? null}
          unit="kcal"
          warnWhenOver
        />
        <TotalCard label="Proteína" value={totals.proteinG} target={target?.proteinG ?? null} unit="g" />
      </View>
      {target === null ? (
        <Pressable
          onPress={onOpenProfile}
          accessibilityRole="link"
          accessibilityLabel="Crea tu perfil en Ajustes para ver tu meta"
          style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.ctaText, { color: colors.primary }]}>Crea tu perfil en Ajustes para ver tu meta</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TotalCard({
  label,
  value,
  target,
  unit,
  warnWhenOver = false,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  warnWhenOver?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const remaining = target === null ? null : Math.round(target - value);
  const over = remaining !== null && remaining < 0;
  const progress = target ? Math.min(1, value / target) : 0;
  const barColor = over && warnWhenOver ? WARNING : colors.primary;

  let note: string | null = null;
  if (remaining !== null) {
    if (!over) note = `faltan ${formatNumber(remaining)} ${unit}`;
    else if (warnWhenOver) note = `te pasaste ${formatNumber(-remaining)} ${unit}`;
    else note = 'meta cumplida';
  }

  return (
    <View
      style={[styles.card, shadow('sm', isDark), { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLabel={`${label}: ${formatNumber(value)} ${unit}${target !== null ? ` de ${formatNumber(target)}` : ''}`}
    >
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]}>
        {formatNumber(value)}
        <Text style={[styles.target, { color: colors.mutedForeground }]}>
          {target !== null ? ` / ${formatNumber(target)} ${unit}` : ` ${unit}`}
        </Text>
      </Text>
      {target !== null ? (
        <View style={[styles.track, { backgroundColor: colors.muted }]}>
          <View style={[styles.fill, { backgroundColor: barColor, width: `${progress * 100}%` }]} />
        </View>
      ) : null}
      {note ? (
        <Text style={[styles.note, { color: over && warnWhenOver ? WARNING : colors.mutedForeground }]}>{note}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  value: { fontFamily: fontFamily.bold, fontSize: fontSize.title },
  target: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: 6, borderRadius: radius.pill },
  note: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: TOUCH_TARGET },
  ctaText: { fontFamily: fontFamily.semibold, fontSize: fontSize.label, flexShrink: 1 },
});
