/**
 * The fixed set of people who may sign in.
 *
 * Sign-up is closed in Supabase (no new users via OTP) and the two accounts
 * exist beforehand, so the login screen can simply offer a name to tap instead
 * of asking for an e-mail. The mapping lives in `VITE_ACCOUNTS` as
 * "Nombre:correo,Nombre:correo", so changing a mailbox is a redeploy, not a
 * code change.
 */

export type Account = { name: string; email: string };

function parse(raw: string | undefined): Account[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      if (idx === -1) return null;
      const name = pair.slice(0, idx).trim();
      const email = pair.slice(idx + 1).trim().toLowerCase();
      return name && email.includes('@') ? { name, email } : null;
    })
    .filter((a): a is Account => a !== null);
}

export const ACCOUNTS: Account[] = parse(import.meta.env.VITE_ACCOUNTS);

export function accountFor(email: string | null | undefined): Account | null {
  if (!email) return null;
  const e = email.toLowerCase();
  return ACCOUNTS.find((a) => a.email === e) ?? null;
}
