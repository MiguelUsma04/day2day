import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

/**
 * Session state for the whole app.
 *
 * Sign-in is a two-step e-mail code: request a code, type it in. No password,
 * no OAuth redirect, so it works the same in a Safari tab and in the installed
 * PWA. Sign-up is closed: the accounts are created by hand in Supabase and a
 * code is only ever sent to one of them.
 */

type AuthValue = {
  /** False when the Supabase variables are missing; the UI hides the account section. */
  configured: boolean;
  /** True until the stored session (if any) has been read. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  requestCode: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  verifyCode: (
    email: string,
    code: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function describe(error: { message?: string } | null | undefined): string {
  const m = error?.message ?? '';
  if (/signups? not allowed|user not found/i.test(m)) return 'Ese correo no tiene cuenta en day2day.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  if (/expired|invalid/i.test(m)) return 'Código incorrecto o vencido. Pide uno nuevo.';
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

  const requestCode = useCallback<AuthValue['requestCode']>(async (email) => {
    if (!supabase) return { ok: false, error: 'La cuenta no está configurada en esta build.' };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      // Sign-up is closed: only the accounts created in Supabase can get a code.
      options: { shouldCreateUser: false },
    });
    return error ? { ok: false, error: describe(error) } : { ok: true };
  }, []);

  const verifyCode = useCallback<AuthValue['verifyCode']>(async (email, code) => {
    if (!supabase) return { ok: false, error: 'La cuenta no está configurada en esta build.' };
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\s+/g, ''),
      type: 'email',
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
      requestCode,
      verifyCode,
      signOut,
    }),
    [loading, session, requestCode, verifyCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
