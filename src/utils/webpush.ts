import { Platform } from 'react-native';

import type { Task } from '../types/task';
import { formatTime } from './date';

/**
 * Web Push: reminders delivered by the server, so they arrive with the app
 * closed — which in-page timers cannot do, since iOS discards them when it
 * unloads the app.
 *
 * The device registers a subscription and uploads what it wants to be reminded
 * about; a scheduled job on the server decides what is due and sends it. No
 * accounts: each device keeps a random id locally and only ever sees its own
 * reminders.
 */

const DEVICE_KEY = 'day2day:deviceId:v1';
const SYNC_KEY = 'day2day:pushSync:v1';

export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'denied'
  | 'default'
  | 'subscribed';

function hasWindow(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

export function isStandalone(): boolean {
  if (!hasWindow()) return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return (
    iosStandalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

function supported(): boolean {
  return (
    hasWindow() &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** Stable per-device id; the server uses it to keep records apart. */
function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'fallback-device-0000';
  }
}

/** VAPID keys travel as base64url and the browser wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function getState(): PushState {
  if (!supported()) return 'unsupported';
  // iOS refuses to even prompt outside an installed app.
  if (!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent)) return 'needs-install';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'subscribed';
  return 'default';
}

/** The reminders this device wants, flattened for the server. */
export function buildReminders(tasks: Task[]) {
  const out: {
    id: string;
    title: string;
    body: string;
    minute: number;
    kind: 'daily' | 'weekdays' | 'custom' | 'once';
    days: number[];
    date: string | null;
  }[] = [];

  for (const task of tasks) {
    if (task.startMinutes === null || task.reminderMinutes === null) continue;

    const minute = task.startMinutes - task.reminderMinutes;
    if (minute < 0 || minute >= 24 * 60) continue;

    out.push({
      id: task.id,
      title: task.title,
      body:
        task.reminderMinutes === 0
          ? `Es hora · ${formatTime(task.startMinutes)}`
          : `En ${task.reminderMinutes} min · ${formatTime(task.startMinutes)}`,
      minute,
      kind: task.repeat.kind === 'none' ? 'once' : task.repeat.kind,
      days: task.repeat.kind === 'custom' ? task.repeat.days : [],
      date: task.repeat.kind === 'none' ? task.date : null,
    });
  }

  return out;
}

async function getSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const key = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return null;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
}

async function upload(subscription: PushSubscription, tasks: Task[]): Promise<boolean> {
  const payload = {
    deviceId: deviceId(),
    subscription: subscription.toJSON(),
    reminders: buildReminders(tasks),
    // The server has no idea what timezone the device is in.
    tzOffsetMinutes: new Date().getTimezoneOffset(),
  };

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    localStorage.setItem(SYNC_KEY, JSON.stringify({ at: Date.now(), count: payload.reminders.length }));
    return true;
  } catch {
    return false;
  }
}

/** Asks for permission and registers the device. Must run from a user gesture. */
export async function enablePush(tasks: Task[]): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (getState() === 'needs-install') return 'needs-install';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const subscription = await getSubscription();
  if (!subscription) return 'default';

  await upload(subscription, tasks);
  return 'subscribed';
}

/**
 * Re-uploads the current reminders.
 *
 * iOS drops push subscriptions on its own — after a reinstall, sometimes after
 * an OS update — so this re-reads the subscription rather than trusting a
 * cached one, and quietly does nothing when there is no permission yet.
 */
export async function syncReminders(tasks: Task[]): Promise<boolean> {
  if (!supported() || Notification.permission !== 'granted') return false;
  try {
    const subscription = await getSubscription();
    if (!subscription) return false;
    return await upload(subscription, tasks);
  } catch {
    return false;
  }
}

export function lastSync(): { at: number; count: number } | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Sends one push immediately, to prove the whole chain works end to end. */
export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId() }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data?.error ?? 'Error del servidor' };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}
