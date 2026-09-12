/**
 * Design tokens — single source of truth for the visual system.
 * Style: "Soft UI Evolution" — soft elevation, clear contrast, WCAG AA+.
 */

export const palette = {
  blue600: '#2563EB',
  blue500: '#3B82F6',
  blue100: '#DBEAFE',
  green600: '#059669',
  green100: '#D1FAE5',
  amber500: '#F59E0B',
  amber100: '#FEF3C7',
  violet500: '#8B5CF6',
  violet100: '#EDE9FE',
  rose500: '#F43F5E',
  rose100: '#FFE4E6',
  red600: '#DC2626',

  slate950: '#020617',
  slate900: '#0F172A',
  slate800: '#1E293B',
  slate700: '#334155',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',
  white: '#FFFFFF',
} as const;

export type ThemeColors = {
  primary: string;
  onPrimary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  destructive: string;
  scrim: string;
};

export const lightColors: ThemeColors = {
  primary: palette.blue600,
  onPrimary: palette.white,
  accent: palette.green600,
  background: palette.slate50,
  surface: palette.white,
  surfaceElevated: palette.white,
  foreground: palette.slate900,
  muted: palette.slate100,
  mutedForeground: palette.slate500,
  border: palette.slate200,
  destructive: palette.red600,
  scrim: 'rgba(15, 23, 42, 0.5)',
};

export const darkColors: ThemeColors = {
  primary: palette.blue500,
  onPrimary: palette.white,
  accent: '#34D399',
  background: palette.slate950,
  surface: '#0B1220',
  surfaceElevated: palette.slate800,
  foreground: '#F8FAFC',
  muted: palette.slate800,
  // slate400 on dark surface clears 3:1 for secondary text.
  mutedForeground: palette.slate400,
  border: '#1E293B',
  destructive: '#F87171',
  scrim: 'rgba(2, 6, 23, 0.6)',
};

/** 4pt rhythm. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  label: 13,
  footnote: 14,
  body: 16,
  callout: 18,
  title: 22,
  headline: 28,
  display: 34,
} as const;

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

/** Motion: micro-interactions 150-300ms; exits ~65% of enters. */
export const duration = {
  fast: 150,
  normal: 220,
  slow: 300,
  exit: 140,
} as const;

/** Minimum touch target (Apple HIG 44pt / Material 48dp). */
export const TOUCH_TARGET = 44;
