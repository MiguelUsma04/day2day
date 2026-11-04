import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
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

/**
 * What travels between devices. It lives in the account's user metadata in
 * Supabase Auth rather than in a table: one small record per user, no
 * migration, and it comes down with the session. `updatedAt` (client ms)
 * decides who wins, like every other synced record.
 */
type Appearance = { themeId: ThemeId; mode: ModePreference; updatedAt: number };

function parseAppearance(raw: unknown): Appearance | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Partial<Appearance>;
  if (!isThemeId(a.themeId)) return null;
  if (typeof a.mode !== 'string' || !(MODES as readonly string[]).includes(a.mode)) return null;
  return {
    themeId: a.themeId,
    mode: a.mode as ModePreference,
    updatedAt: typeof a.updatedAt === 'number' ? a.updatedAt : 0,
  };
}

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
  // 0 until the user picks something: any synced choice then beats the default.
  const [updatedAt, setUpdatedAt] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  /** True while the local choice has not reached the account yet. */
  const dirty = useRef(false);
  const current = useRef<Appearance>({ themeId, mode, updatedAt });
  current.current = { themeId, mode, updatedAt };

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as { themeId?: unknown; mode?: unknown; updatedAt?: unknown };
        if (isThemeId(parsed.themeId)) setThemeIdState(parsed.themeId);
        if (typeof parsed.mode === 'string' && (MODES as readonly string[]).includes(parsed.mode)) {
          setModeState(parsed.mode as ModePreference);
        }
        if (typeof parsed.updatedAt === 'number') setUpdatedAt(parsed.updatedAt);
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
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ themeId, mode, updatedAt })).catch(
      () => {},
    );
  }, [themeId, mode, updatedAt, hydrated]);

  /** Takes the account's copy when it is newer than what this device holds. */
  const applyRemote = useCallback((raw: unknown) => {
    const remote = parseAppearance(raw);
    if (!remote || remote.updatedAt <= current.current.updatedAt) return;
    setThemeIdState(remote.themeId);
    setModeState(remote.mode);
    setUpdatedAt(remote.updatedAt);
    dirty.current = false;
  }, []);

  /** Writes this device's choice to the account; silently retried later if offline. */
  const push = useCallback(async () => {
    if (!supabase || !dirty.current) return;
    const appearance = current.current;
    const { error } = await supabase.auth.updateUser({ data: { appearance } });
    // Only clear if nothing changed while the request was in flight.
    if (!error && current.current.updatedAt === appearance.updatedAt) dirty.current = false;
  }, []);

  /**
   * Pulls fresh metadata (the cached session may be hours old) and, if this
   * device has an unsent choice that is still the newest, sends it.
   */
  const pull = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    applyRemote(data.user.user_metadata?.appearance);
    if (dirty.current) void push();
  }, [applyRemote, push]);

  // Account sync: on sign-in, whenever the session refreshes, and on return to
  // the foreground, so a change on the phone shows up on the PC when it is
  // next looked at. Nothing runs without Supabase or without a session.
  useEffect(() => {
    if (!hydrated || !supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      applyRemote(session.user.user_metadata?.appearance);
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') void pull();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pull();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', pull);
    }
    return () => {
      sub.subscription.unsubscribe();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', pull);
      }
    };
  }, [hydrated, applyRemote, pull]);

  // A local pick goes up shortly after; the delay folds a burst of taps on
  // the palette into one request.
  useEffect(() => {
    if (!hydrated || !dirty.current) return;
    const id = setTimeout(() => void push(), 600);
    return () => clearTimeout(id);
  }, [updatedAt, hydrated, push]);

  const choose = useCallback((next: Partial<Pick<Appearance, 'themeId' | 'mode'>>) => {
    if (next.themeId) setThemeIdState(next.themeId);
    if (next.mode) setModeState(next.mode);
    dirty.current = true;
    setUpdatedAt(Date.now());
  }, []);

  const setThemeId = useCallback((id: ThemeId) => choose({ themeId: id }), [choose]);
  const setMode = useCallback((next: ModePreference) => choose({ mode: next }), [choose]);

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
