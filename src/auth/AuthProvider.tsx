import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

/**
 * Session state for the whole app.
 *
 * Sign-in is e-mail + password, done once per device: the session lives in
 * localStorage and refreshes itself, so the login screen only shows up again
 * after signing out. Sign-up is closed: the accounts are created by hand in
 * Supabase and nothing in the app can create one.
 */

type AuthValue = {
  /** False when the Supabase variables are missing; the app then runs offline-only. */
  configured: boolean;
  /** True until the stored session (if any) has been read. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function describe(error: { message?: string } | null | undefined): string {
  const m = error?.message ?? '';
  if (/invalid login credentials|invalid_credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Esa cuenta no está confirmada en Supabase.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  if (/network|fetch/i.test(m)) return 'Sin conexión con el servidor.';
  return m || 'Algo falló. Inténtalo de nuevo.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback<AuthValue['signIn']>(async (email, password) => {
    if (!supabase) return { ok: false, error: 'La cuenta no está configurada en esta build.' };
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return error ? { ok: false, error: describe(error) } : { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      signIn,
      signOut,
    }),
    [loading, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
