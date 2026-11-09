/** Parses "65,4" / "65.4" / " 65 " into a number; null when empty or not finite. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parses "H:MM" / "HH:MM" into minutes since midnight; null when invalid. */
export function parseHHMM(s: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
