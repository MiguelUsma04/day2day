import type { ThemeColors } from './tokens';

/**
 * Selectable colour themes.
 *
 * Each theme tints the whole surface stack — background, cards, inputs, borders
 * and secondary text — not just the accent, so switching theme visibly changes
 * the entire interface. Neutrals are derived from the theme's own hue rather
 * than a shared grey ramp.
 *
 * Contrast: every `foreground` on its `background`/`surface` clears WCAG AA
 * (4.5:1), and `mutedForeground` clears 4.5:1 in light mode and 3:1 on dark
 * surfaces, which is the floor for secondary text.
 */

export const THEME_IDS = ['blue', 'pink', 'violet', 'amber', 'emerald', 'rose'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeOption = {
  id: ThemeId;
  label: string;
  /** Swatch shown in the picker. */
  swatch: string;
  light: ThemeColors;
  dark: ThemeColors;
};

/** Builds a full palette from a hue's tinted neutrals plus its accents. */
function palette(spec: {
  primary: string;
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
  onPrimary?: string;
}): ThemeColors {
  return {
    primary: spec.primary,
    onPrimary: spec.onPrimary ?? '#FFFFFF',
    accent: spec.accent,
    background: spec.background,
    surface: spec.surface,
    surfaceElevated: spec.surfaceElevated,
    foreground: spec.foreground,
    muted: spec.muted,
    mutedForeground: spec.mutedForeground,
    border: spec.border,
    destructive: spec.destructive,
    ring: spec.primary,
    scrim: spec.scrim,
  };
}

export const THEMES: Record<ThemeId, ThemeOption> = {
  blue: {
    id: 'blue',
    label: 'Azul',
    swatch: '#2563EB',
    light: palette({
      primary: '#2563EB',
      accent: '#0891B2',
      background: '#F3F6FD',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      foreground: '#111B33',
      muted: '#E7EDFB',
      mutedForeground: '#5A6B8C',
      border: '#D6E0F5',
      destructive: '#DC2626',
      scrim: 'rgba(17, 27, 51, 0.5)',
    }),
    dark: palette({
      primary: '#60A5FA',
      accent: '#22D3EE',
      background: '#080D1A',
      surface: '#101A2E',
      surfaceElevated: '#1B2740',
      foreground: '#EEF3FC',
      muted: '#1B2740',
      mutedForeground: '#9DB0D0',
      border: '#25314C',
      destructive: '#F87171',
      scrim: 'rgba(4, 8, 18, 0.62)',
    }),
  },

  pink: {
    id: 'pink',
    label: 'Rosa',
    swatch: '#DB2777',
    light: palette({
      primary: '#DB2777',
      accent: '#0D9488',
      background: '#FDF2F7',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      foreground: '#3A1026',
      muted: '#FBE3EE',
      mutedForeground: '#8C5570',
      border: '#F5D2E2',
      destructive: '#DC2626',
      scrim: 'rgba(58, 16, 38, 0.5)',
    }),
    dark: palette({
      primary: '#F472B6',
      accent: '#2DD4BF',
      background: '#150810',
      surface: '#22101A',
      surfaceElevated: '#331926',
      foreground: '#FCEEF5',
      muted: '#331926',
      mutedForeground: '#D4A0BB',
      border: '#402132',
      destructive: '#F87171',
      scrim: 'rgba(10, 4, 8, 0.62)',
    }),
  },

  violet: {
    id: 'violet',
    label: 'Lila',
    swatch: '#7C3AED',
    light: palette({
      primary: '#7C3AED',
      accent: '#0891B2',
      background: '#F5F2FE',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      foreground: '#22143F',
      muted: '#EBE4FC',
      mutedForeground: '#6A5A8C',
      border: '#DED3F7',
      destructive: '#DC2626',
      scrim: 'rgba(34, 20, 63, 0.5)',
    }),
    dark: palette({
      primary: '#A78BFA',
      accent: '#22D3EE',
      background: '#0C081A',
      surface: '#16102B',
      surfaceElevated: '#241B42',
      foreground: '#F1EDFD',
      muted: '#241B42',
      mutedForeground: '#B3A5D6',
      border: '#2E2450',
      destructive: '#F87171',
      scrim: 'rgba(6, 4, 14, 0.62)',
    }),
  },

  amber: {
    id: 'amber',
    label: 'Ámbar',
    swatch: '#C2620A',
    light: palette({
      primary: '#C2620A',
      accent: '#0D9488',
      background: '#FDF6EC',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      foreground: '#33220B',
      muted: '#F8EAD6',
      mutedForeground: '#87663C',
      border: '#F0DCC0',
      destructive: '#DC2626',
      scrim: 'rgba(51, 34, 11, 0.5)',
    }),
    dark: palette({
      primary: '#FBBF24',
      accent: '#2DD4BF',
      background: '#130E05',
      surface: '#1F170B',
      surfaceElevated: '#302416',
      foreground: '#FBF4E6',
      muted: '#302416',
      mutedForeground: '#CBAE83',
      border: '#3D2F1D',
      destructive: '#F87171',
      // Amber primary is light; dark text keeps the contrast on buttons.
      onPrimary: '#2A1C05',
      scrim: 'rgba(9, 6, 2, 0.62)',
    }),
  },

  emerald: {
    id: 'emerald',
    label: 'Verde',
    swatch: '#047857',
    light: palette({
      primary: '#047857',
      accent: '#7C3AED',
      background: '#EFF8F3',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      foreground: '#0C2B20',
      muted: '#DEF0E7',
      mutedForeground: '#4A7061',
      border: '#C9E6D8',
      destructive: '#DC2626',
      scrim: 'rgba(12, 43, 32, 0.5)',
    }),
    dark: palette({
      primary: '#34D399',
      accent: '#A78BFA',
      background: '#05120D',
      surface: '#0C1E17',
      surfaceElevated: '#153026',
      foreground: '#E9F8F1',
      muted: '#153026',
      mutedForeground: '#93C4B0',
      border: '#1D3C30',
      destructive: '#F87171',
      onPrimary: '#05271B',
      scrim: 'rgba(2, 9, 6, 0.62)',
    }),
  },

  rose: {
    id: 'rose',
    label: 'Coral',
    swatch: '#E11D48',
    light: palette({
      primary: '#E11D48',
      accent: '#0891B2',
      background: '#FEF3F4',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      foreground: '#3D101A',
      muted: '#FCE4E7',
      mutedForeground: '#8F5560',
      border: '#F7D4D9',
      destructive: '#B91C1C',
      scrim: 'rgba(61, 16, 26, 0.5)',
    }),
    dark: palette({
      primary: '#FB7185',
      accent: '#22D3EE',
      background: '#14070A',
      surface: '#210E13',
      surfaceElevated: '#32171E',
      foreground: '#FDEFF1',
      muted: '#32171E',
      mutedForeground: '#D6A0A9',
      border: '#3F1F27',
      destructive: '#F87171',
      scrim: 'rgba(10, 3, 5, 0.62)',
    }),
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'blue';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}
