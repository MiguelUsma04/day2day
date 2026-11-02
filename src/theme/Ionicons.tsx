import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import glyphMap from 'react-native-vector-icons/glyphmaps/Ionicons.json';

/**
 * Ionicons rendered from the icon font.
 *
 * The glyph map is the one the font was built from, so `name` is type-checked
 * against the real set and a typo fails to compile instead of drawing a box.
 * The font itself is registered in main.tsx.
 */

export type IconName = keyof typeof glyphMap;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

export function Ionicons({ name, size = 24, color, style, accessibilityLabel }: Props) {
  const code = glyphMap[name];
  const glyph = typeof code === 'number' ? String.fromCodePoint(code) : '';
  return (
    <Text
      selectable={false}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      aria-hidden={!accessibilityLabel}
      style={[styles.glyph, { fontSize: size, lineHeight: size, color }, style]}
    >
      {glyph}
    </Text>
  );
}

/** True when the name exists in the font; used to validate imported data. */
export function isIoniconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(glyphMap, name);
}

const styles = StyleSheet.create({
  glyph: {
    fontFamily: 'Ionicons',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'center',
  },
});
