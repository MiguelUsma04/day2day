import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * The app is a PWA, so the default storage (localStorage) is what we want for
 * the session: it survives the installed app being closed, and it is per
 * origin, so a session never leaks between sites.
 *
 * Sign-in is e-mail + password, never a magic link: on iOS a link opens in
 * Safari rather than in the installed app, which would leave the app itself
 * logged out. There is no URL to detect, hence `detectSessionInUrl: false`.
 *
 * The client is optional: without the two public variables the app keeps
 * working offline-only, exactly as before the database existed.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Base URL of the project's Edge Functions, or null when not configured. */
export const functionsUrl = isSupabaseConfigured
  ? `${(url as string).replace(/\/+$/, '')}/functions/v1`
  : null;

/** Headers every Edge Function call carries: the anon key identifies the app. */
export const functionHeaders: Record<string, string> = isSupabaseConfigured
  ? { apikey: anonKey as string, Authorization: `Bearer ${anonKey as string}` }
  : {};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
