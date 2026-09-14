import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ICON_GROUPS, type IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';

type Props = {
  value: IconName | undefined;
  /** Icon shown as the "automatic" choice, taken from the category. */
  fallback: IconName;
  onChange: (icon: IconName | undefined) => void;
};

export function IconPicker({ value, fallback, onChange }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const select = (icon: IconName | undefined) => {
    void Haptics.selectionAsync();
    onChange(icon);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {/* Automatic keeps the category icon, which is the sensible default. */}
        <Pressable
          onPress={() => select(undefined)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === undefined }}
          accessibilityLabel="Icono automático"
          style={[
            styles.tile,
            {
              backgroundColor: value === undefined ? colors.primary : colors.muted,
              borderColor: value === undefined ? colors.primary : colors.border,
            },
          ]}
        >
          <Ionicons
            name={fallback}
            size={20}
            color={value === undefined ? colors.onPrimary : colors.mutedForeground}
          />
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {ICON_GROUPS[0].icons.concat(ICON_GROUPS[1].icons.slice(0, 4)).map((icon) => {
            const active = icon === value;
            return (
              <Pressable
                key={icon}
                onPress={() => select(icon)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={icon}
                style={[
                  styles.tile,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons name={icon} size={20} color={active ? colors.onPrimary : colors.foreground} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          setExpanded((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.moreText, { color: colors.primary }]}>
          {expanded ? 'Ver menos iconos' : 'Ver todos los iconos'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={15}
          color={colors.primary}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.groups}>
          {ICON_GROUPS.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>
                {group.label}
              </Text>
              <View style={styles.grid}>
                {group.icons.map((icon) => {
                  const active = icon === value;
                  return (
                    <Pressable
                      key={icon}
                      onPress={() => select(icon)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={icon}
                      style={[
                        styles.tile,
                        {
                          backgroundColor: active ? colors.primary : colors.muted,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={icon}
                        size={20}
                        color={active ? colors.onPrimary : colors.foreground}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  strip: { gap: spacing.sm, paddingRight: spacing.sm },
  tile: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    minHeight: 36,
  },
  moreText: { fontFamily: fontFamily.medium, fontSize: fontSize.label },
  groups: { gap: spacing.md },
  group: { gap: spacing.xs },
  groupLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
