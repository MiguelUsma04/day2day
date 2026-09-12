/**
 * Day keys are local "YYYY-MM-DD" strings. Using them instead of timestamps keeps a
 * task on the day the user picked, regardless of timezone or DST.
 */

export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDayKey(a) === toDayKey(b);
}

export function isToday(key: string): boolean {
  return key === toDayKey(new Date());
}

/** 570 -> "9:30 AM" */
export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function dayName(date: Date): string {
  return DAY_NAMES[date.getDay()];
}

export function dayShort(date: Date): string {
  return DAY_SHORT[date.getDay()];
}

export function monthName(date: Date): string {
  return MONTH_NAMES[date.getMonth()];
}

/** "Hoy" / "Mañana" / "Ayer", else "Lunes, 15 de enero". */
export function friendlyDate(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) return 'Hoy';
  if (isSameDay(date, addDays(today, 1))) return 'Mañana';
  if (isSameDay(date, addDays(today, -1))) return 'Ayer';
  return `${dayName(date)}, ${date.getDate()} de ${monthName(date)}`;
}
