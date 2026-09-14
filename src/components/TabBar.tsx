import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, spacing, TOUCH_TARGET } from '../theme/tokens';

export const TABS = ['schedule', 'todos', 'report', 'settings'] as const;
export type TabId = (typeof TABS)[number];

const META: Record<TabId, { label: string; icon: IconName; active: IconName }> = {
  schedule: { label: 'Cronograma', icon: 'calendar-outline', active: 'calendar' },
  todos: { label: 'Pendientes', icon: 'checkbox-outline', active: 'checkbox' },
  report: { label: 'Progreso', icon: 'stats-chart-outline', active: 'stats-chart' },
  settings: { label: 'Ajustes', icon: 'settings-outline', active: 'settings' },
};

type Props = {
  current: TabId;
  onChange: (tab: TabId) => void;
  /** Count shown on the pendientes tab; hidden at zero. */
  pendingCount: number;
};

export function TabBar({ current, onChange, pendingCount }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom || spacing.sm,
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = tab === current;
        const meta = META[tab];
        return (
          <Pressable
            key={tab}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(tab);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={meta.label}
            style={({ pressed }) => [styles.tab, { opacity: pressed && !active ? 0.6 : 1 }]}
          >
            <View>
              <Ionicons
                name={active ? meta.active : meta.icon}
                size={22}
                color={active ? colors.primary : colors.mutedForeground}
              />
              {tab === 'todos' && pendingCount > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.badgeText, { color: colors.onPrimary }]}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Label plus icon: an icon alone hurts discoverability. */}
            <Text
              style={[
                styles.label,
                {
                  color: active ? colors.primary : colors.mutedForeground,
                  fontFamily: active ? fontFamily.semibold : fontFamily.medium,
                },
              ]}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: TOUCH_TARGET,
  },
  label: { fontSize: fontSize.caption },
  badge: {
    position: 'absolute',
    top: -4,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10 },
});
