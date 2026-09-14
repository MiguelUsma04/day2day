import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_THEME_ID,
  THEMES,
  isThemeId,
  type ThemeId,
  type ThemeOption,
} from './palettes';
import type { ThemeColors } from './tokens';

const STORAGE_KEY = 'day2day:appearance:v1';

/** "system" follows the device; the others pin the mode regardless of it. */
export const MODES = ['system', 'light', 'dark'] as const;
export type ModePreference = (typeof MODES)[number];

type ThemeValue = {
  colors: ThemeColors;
  isDark: boolean;
  themeId: ThemeId;
  mode: ModePreference;
  options: ThemeOption[];
  setThemeId: (id: ThemeId) => void;
  setMode: (mode: ModePreference) => void;
};

const fallback = THEMES[DEFAULT_THEME_ID];

const ThemeContext = createContext<ThemeValue>({
  colors: fallback.light,
  isDark: false,
  themeId: DEFAULT_THEME_ID,
  mode: 'system',
  options: Object.values(THEMES),
  setThemeId: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [mode, setModeState] = useState<ModePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as { themeId?: unknown; mode?: unknown };
        if (isThemeId(parsed.themeId)) setThemeIdState(parsed.themeId);
        if (typeof parsed.mode === 'string' && (MODES as readonly string[]).includes(parsed.mode)) {
          setModeState(parsed.mode as ModePreference);
        }
      })
      .catch(() => {
        // A corrupt preference should not block the app from rendering.
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Persist only after hydration, so defaults never overwrite a stored choice.
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ themeId, mode })).catch(() => {});
  }, [themeId, mode, hydrated]);

  const setThemeId = useCallback((id: ThemeId) => setThemeIdState(id), []);
  const setMode = useCallback((next: ModePreference) => setModeState(next), []);

  const value = useMemo<ThemeValue>(() => {
    const isDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
    const theme = THEMES[themeId] ?? fallback;
    return {
      colors: isDark ? theme.dark : theme.light,
      isDark,
      themeId,
      mode,
      options: Object.values(THEMES),
      setThemeId,
      setMode,
    };
  }, [themeId, mode, scheme, setThemeId, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
