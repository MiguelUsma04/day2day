import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CoachAdvice } from '../../lib/nutrition/coach';
import { formatNumber } from '../../lib/nutrition/format';
import { Ionicons } from '../../theme/Ionicons';
import type { IconName } from '../../theme/icons';
import { shadow } from '../../theme/shadows';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, palette, radius, spacing } from '../../theme/tokens';

const WARNING = palette.amber500;

type Props = { advice: CoachAdvice };

/** "What to eat to land on the target" or "how long to move after passing it". */
export function CoachCard({ advice }: Props) {
  const { colors, isDark } = useTheme();
  if (advice.kind === 'none') return null;

  const icon: IconName =
    advice.kind === 'burn' ? 'flame-outline' : advice.kind === 'done' ? 'checkmark-circle-outline' : 'restaurant-outline';
  const accent = advice.kind === 'burn' ? WARNING : colors.primary;
  const title =
    advice.kind === 'burn'
      ? `Te pasaste por ${formatNumber(advice.excessKcal)} kcal`
      : advice.kind === 'done'
        ? 'Meta del día cumplida'
        : `Te faltan ${formatNumber(advice.remainingKcal)} kcal` +
          (advice.remainingProteinG > 0 ? ` y ${advice.remainingProteinG} g de proteína` : '');

  return (
    <View
      style={[styles.card, shadow('sm', isDark), { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="summary"
    >
      <View style={styles.head}>
        <Ionicons name={icon} size={18} color={accent} />
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      </View>

      {advice.kind === 'done' ? (
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {advice.remainingProteinG > 5
            ? `Kcal al tope. Mañana prioriza la proteína desde el desayuno: hoy faltaron ${advice.remainingProteinG} g.`
            : 'Kcal y proteína en su punto. No hace falta comer más.'}
        </Text>
      ) : advice.kind === 'burn' ? (
        <>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Para quedar en la meta, una de estas:</Text>
          {advice.options.map((o) => (
            <View key={o.label} style={styles.row}>
              <Text style={[styles.rowText, { color: colors.foreground }]}>{o.label}</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{o.minutes} min</Text>
            </View>
          ))}
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            O déjalo así y mañana vuelves a la meta. Un día no rompe la semana.
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Con una de estas llegas sin pasarte:</Text>
          {advice.options.map((o) => (
            <View key={o.label} style={styles.row}>
              <Text style={[styles.rowText, { color: colors.foreground }]}>{o.label}</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                {formatNumber(o.kcal)} kcal{o.proteinG > 0 ? ` · ${o.proteinG} g` : ''}
              </Text>
            </View>
          ))}
          {advice.note ? <Text style={[styles.body, { color: colors.mutedForeground }]}>{advice.note}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, flex: 1 },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.footnote, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowText: { fontFamily: fontFamily.medium, fontSize: fontSize.label, flex: 1 },
  rowMeta: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
});
