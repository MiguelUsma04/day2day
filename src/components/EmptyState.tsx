import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';

type Props = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.circle, { backgroundColor: colors.muted }]}>
        <Ionicons name="calendar-outline" size={30} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.md },
  circle: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.semibold, fontSize: fontSize.callout, textAlign: 'center' },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
});
