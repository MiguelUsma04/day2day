import { Platform } from 'react-native';

import type { Task, Weekday } from '../types/task';
import { formatTime, toDayKey } from './date';

/**
 * Reminders for the installed web app.
 *
 * `expo-notifications` has no web support, so this uses the browser Notification
 * API directly. On iOS that requires the app to be installed to the home screen
 * (16.4+); in a plain Safari tab permission cannot even be requested.
 *
 * Timers are armed in-page, so reminders fire while the app is open or recently
 * backgrounded. Delivery with the app fully closed for hours needs a push
 * server, which this does not attempt — the re-arm on focus below is what makes
 * the common case (app opened at some point during the day) work reliably.
 */

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Longest delay we arm at once; beyond this, setTimeout drifts badly. */
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;
/** Fired reminders, so re-arming on focus does not repeat one already shown. */
const fired = new Set<string>();

function supported(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;
}

/** True when running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return (
    iosStandalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

export function getPermission(): PermissionState {
  if (!supported()) return 'unsupported';
  return Notification.permission as PermissionState;
}

export async function requestPermission(): Promise<PermissionState> {
  if (!supported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as PermissionState;
  } catch {
    return 'denied';
  }
}

async function show(title: string, body: string, tag: string) {
  if (!supported() || Notification.permission !== 'granted') return;
  try {
    // A service worker registration shows notifications reliably on iOS;
    // the plain constructor is the fallback elsewhere.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      });
      return;
    }
    new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
  } catch {
    // Never let a failed reminder break the app.
  }
}

function clearAll() {
  for (const id of timers.values()) clearTimeout(id);
  timers.clear();
}

/** Does a repeating task land on this day? Mirrors the schedule's own rule. */
function occursToday(task: Task, dayKey: string): boolean {
  if (task.repeat.kind === 'none') return task.date === dayKey;
  if (dayKey < task.date) return false;
  if (task.skippedDays.includes(dayKey)) return false;

  const [y, m, d] = dayKey.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay() as Weekday;
  switch (task.repeat.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday >= 1 && weekday <= 5;
    case 'custom':
      return task.repeat.days.includes(weekday);
    default:
      return false;
  }
}

/**
 * Arms reminders for everything still ahead today.
 *
 * Takes the full task list rather than one day's view, so reminders stay armed
 * for today even while the user is browsing another date.
 */
export function scheduleReminders(tasks: Task[]) {
  clearAll();
  if (!supported() || Notification.permission !== 'granted') return;

  const now = new Date();
  const todayKey = toDayKey(now);
  const nowMs =
    now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;

  for (const task of tasks) {
    if (!occursToday(task, todayKey)) continue;
    if (task.startMinutes === null || task.reminderMinutes === null) continue;
    if (task.completedDays.includes(todayKey)) continue;

    // A per-day edit can move the time, so honour the override when present.
    const override = task.overrides[todayKey];
    const startMinutes = override?.startMinutes ?? task.startMinutes;
    const title = override?.title ?? task.title;
    if (startMinutes === null) continue;

    const key = `${task.id}:${todayKey}`;
    if (fired.has(key)) continue;

    const delay = (startMinutes - task.reminderMinutes) * 60000 - nowMs;
    if (delay <= 0 || delay > MAX_DELAY_MS) continue;

    const lead =
      task.reminderMinutes === 0
        ? `Empieza ahora · ${formatTime(startMinutes)}`
        : `En ${task.reminderMinutes} min · ${formatTime(startMinutes)}`;

    timers.set(
      key,
      setTimeout(() => {
        fired.add(key);
        void show(title, lead, key);
        timers.delete(key);
      }, delay),
    );
  }
}

export function cancelReminders() {
  clearAll();
}

/** How many reminders are currently armed; used by the settings screen. */
export function armedCount(): number {
  return timers.size;
}

/** Fires a sample notification so the user can confirm it works. */
export async function sendTestNotification() {
  await show('day2day', 'Las notificaciones están funcionando.', 'day2day-test');
}
