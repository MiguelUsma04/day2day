import type { ThemeColors } from './tokens';

/**
 * Selectable colour themes. Each defines a full light and dark palette so the
 * whole interface shifts together, rather than only the accent colour.
 *
 * Every foreground/background pair here is chosen to clear WCAG AA (4.5:1) for
 * body text; the `onPrimary` white sits on the 600-weight primary in light mode
 * and the same hue holds up on dark surfaces.
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

const neutralLight = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  foreground: '#0F172A',
  muted: '#F1F5F9',
  mutedForeground: '#64748B',
  border: '#E2E8F0',
  destructive: '#DC2626',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(15, 23, 42, 0.5)',
};

const neutralDark = {
  background: '#020617',
  surface: '#0B1220',
  surfaceElevated: '#1E293B',
  foreground: '#F8FAFC',
  muted: '#1E293B',
  mutedForeground: '#94A3B8',
  border: '#1E293B',
  destructive: '#F87171',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(2, 6, 23, 0.6)',
};

/** Warm neutrals suit the warm accents better than the cool slate ramp. */
const warmLight = {
  ...neutralLight,
  background: '#FAF9F7',
  muted: '#F5F3F0',
  mutedForeground: '#78716C',
  border: '#E7E5E4',
  foreground: '#1C1917',
};

const warmDark = {
  ...neutralDark,
  background: '#0C0A09',
  surface: '#161311',
  surfaceElevated: '#292524',
  muted: '#292524',
  mutedForeground: '#A8A29E',
  border: '#292524',
  foreground: '#FAFAF9',
};

export const THEMES: Record<ThemeId, ThemeOption> = {
  blue: {
    id: 'blue',
    label: 'Azul',
    swatch: '#2563EB',
    light: { ...neutralLight, primary: '#2563EB', accent: '#059669', ring: '#2563EB' },
    dark: { ...neutralDark, primary: '#3B82F6', accent: '#34D399', ring: '#3B82F6' },
  },
  pink: {
    id: 'pink',
    label: 'Rosa',
    swatch: '#DB2777',
    light: { ...warmLight, primary: '#DB2777', accent: '#0D9488', ring: '#DB2777' },
    dark: { ...warmDark, primary: '#F472B6', accent: '#2DD4BF', ring: '#F472B6' },
  },
  violet: {
    id: 'violet',
    label: 'Lila',
    swatch: '#7C3AED',
    light: { ...neutralLight, primary: '#7C3AED', accent: '#0891B2', ring: '#7C3AED' },
    dark: { ...neutralDark, primary: '#A78BFA', accent: '#22D3EE', ring: '#A78BFA' },
  },
  amber: {
    id: 'amber',
    label: 'Ámbar',
    swatch: '#D97706',
    light: { ...warmLight, primary: '#D97706', accent: '#0D9488', ring: '#D97706' },
    dark: { ...warmDark, primary: '#FBBF24', accent: '#2DD4BF', ring: '#FBBF24' },
  },
  emerald: {
    id: 'emerald',
    label: 'Verde',
    swatch: '#059669',
    light: { ...neutralLight, primary: '#059669', accent: '#7C3AED', ring: '#059669' },
    dark: { ...neutralDark, primary: '#34D399', accent: '#A78BFA', ring: '#34D399' },
  },
  rose: {
    id: 'rose',
    label: 'Coral',
    swatch: '#E11D48',
    light: { ...warmLight, primary: '#E11D48', accent: '#0891B2', ring: '#E11D48' },
    dark: { ...warmDark, primary: '#FB7185', accent: '#22D3EE', ring: '#FB7185' },
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'blue';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}
