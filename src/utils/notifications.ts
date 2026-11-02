import { Platform } from 'react-native';

import type { DayModeMap } from '../storage/dayModes';
import { occursOn } from '../storage/occurrence';
import type { Task } from '../types/task';
import { formatTime, toDayKey } from './date';

/**
 * Reminders for the installed web app.
 *
 * Uses the browser Notification API directly. On iOS that requires the app to be installed to the home screen
 * (16.4+); in a plain Safari tab permission cannot even be requested.
 *
 * Timers are armed in-page, so reminders fire while the app is open or recently
 * backgrounded. Delivery with the app fully closed for hours needs a push
 * server, which this does not attempt — the re-arm on focus below is what makes
 * the common case (app opened at some point during the day) work reliably.
 */

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

const PUSH_SYNC_KEY = 'day2day:pushSync:v1';

/** True once this device has uploaded its reminders to the push server. */
function serverPushActive(): boolean {
  try {
    return localStorage.getItem(PUSH_SYNC_KEY) !== null;
  } catch {
    return false;
  }
}

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

/**
 * Arms reminders for everything still ahead today.
 *
 * Takes the full task list rather than one day's view, so reminders stay armed
 * for today even while the user is browsing another date.
 */
export function scheduleReminders(tasks: Task[], dayModes?: DayModeMap) {
  clearAll();
  if (!supported() || Notification.permission !== 'granted') return;
  // Once the server sends pushes, an in-page timer for the same minute would
  // show a second banner; the server copy is the one that also works closed.
  if (serverPushActive()) return;

  const now = new Date();
  const todayKey = toDayKey(now);
  const nowMs =
    now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;

  for (const task of tasks) {
    if (!occursOn(task, todayKey, dayModes)) continue;
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
        ? `Es hora · ${formatTime(startMinutes)}`
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

/**
 * Schedules a notification a minute out, so the user can check that a *delayed*
 * reminder survives leaving the app — the case an immediate test cannot prove.
 */
export function sendDelayedTestNotification(): boolean {
  if (!supported() || Notification.permission !== 'granted') return false;
  setTimeout(() => {
    void show('day2day', 'Prueba de 1 minuto: los avisos programados funcionan.', 'day2day-delayed');
  }, 60000);
  return true;
}
