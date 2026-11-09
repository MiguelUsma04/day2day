import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { accountFor } from '../auth/accounts';
import { useAuth } from '../auth/AuthProvider';
import { usePartner } from '../auth/PartnerProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../theme/tokens';
import * as Haptics from '../utils/haptics';

/**
 * Two pills, me | my partner, deciding whose day the tabs show.
 * Renders nothing when there is no linked partner.
 */
export function PersonSwitcher() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { partner, viewing, setViewing } = usePartner();
  if (!partner) return null;

  const myName = accountFor(user?.email)?.name ?? 'Yo';
  const options = [
    { value: 'me' as const, label: myName },
    { value: 'partner' as const, label: partner.name },
  ];

  return (
    <View
      style={[styles.group, { backgroundColor: colors.muted, borderColor: colors.border }]}
      accessibilityRole="radiogroup"
    >
      {options.map((opt) => {
        const active = viewing === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              setViewing(opt.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`Ver el día de ${opt.label}`}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: active ? colors.surface : 'transparent',
                borderColor: active ? colors.primary : 'transparent',
                opacity: pressed && !active ? 0.7 : 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  color: active ? colors.primary : colors.mutedForeground,
                  fontFamily: active ? fontFamily.semibold : fontFamily.medium,
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  pill: {
    minHeight: 32,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: fontSize.label },
});
