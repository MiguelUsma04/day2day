import { Platform } from 'react-native';

import type { TaskInstance } from '../types/task';
import { formatTime } from './date';

/**
 * Reminders for the installed web app.
 *
 * `expo-notifications` has no web support, so this uses the browser Notification
 * API directly. On iOS that requires the app to be installed to the home screen
 * (16.4+); in a plain Safari tab permission cannot even be requested.
 *
 * Scheduling is done with in-page timers, which means reminders fire while the
 * app is open or recently backgrounded. Delivery with the app fully closed for
 * hours needs a push server, which this does not attempt.
 */

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Longest delay we arm at once; beyond this, setTimeout drifts badly. */
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

function supported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'Notification' in window
  );
}

/** True when running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return (
    iosStandalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
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
 * Re-arms reminders for the given day's tasks. Call whenever the schedule or
 * the selected day changes; it clears previously armed timers first.
 */
export function scheduleReminders(instances: TaskInstance[], dayKey: string) {
  clearAll();
  if (!supported() || Notification.permission !== 'granted') return;

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  // Only today's remaining reminders can meaningfully fire from a live page.
  if (dayKey !== todayKey) return;

  const nowMs = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;

  for (const task of instances) {
    if (task.done || task.startMinutes === null || task.reminderMinutes === null) continue;

    const fireAtMs = (task.startMinutes - task.reminderMinutes) * 60000;
    const delay = fireAtMs - nowMs;
    if (delay <= 0 || delay > MAX_DELAY_MS) continue;

    const key = `${task.id}:${task.dayKey}`;
    const lead =
      task.reminderMinutes === 0
        ? 'Empieza ahora'
        : `En ${task.reminderMinutes} min · ${formatTime(task.startMinutes)}`;

    timers.set(
      key,
      setTimeout(() => {
        void show(task.title, lead, key);
        timers.delete(key);
      }, delay),
    );
  }
}

export function cancelReminders() {
  clearAll();
}

/** Fires a sample notification so the user can confirm it works. */
export async function sendTestNotification() {
  await show('day2day', 'Las notificaciones están funcionando.', 'day2day-test');
}
