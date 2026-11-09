import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { usePartner } from '../auth/PartnerProvider';
import { Ionicons } from '../theme/Ionicons';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';

/** Fixed reminder, while looking at the partner's day, that nothing here is editable. */
export function ViewingBanner() {
  const { colors } = useTheme();
  const { partner, viewing, loading, error } = usePartner();
  if (!partner || viewing !== 'partner') return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.muted, borderColor: colors.border }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="eye-outline" size={14} color={colors.primary} />
      <Text numberOfLines={1} style={[styles.text, { color: colors.foreground }]}>
        Viendo a {partner.name} · solo lectura
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Actualizando" />
      ) : error ? (
        <Text numberOfLines={1} style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '100%',
  },
  text: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, flexShrink: 1 },
  error: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, flexShrink: 1 },
});
