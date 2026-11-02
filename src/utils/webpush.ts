import { Platform } from 'react-native';

import { functionHeaders, functionsUrl } from '../lib/supabase';
import { resolveDayMode, taskFitsMode, type DayModeMap } from '../storage/dayModes';
import type { Task } from '../types/task';
import { addDays, formatTime, toDayKey } from './date';

/**
 * Web Push: reminders delivered by the server, so they arrive with the app
 * closed — which in-page timers cannot do, since iOS discards them when it
 * unloads the app.
 *
 * The device registers a subscription and uploads what it wants to be reminded
 * about; a scheduled job on the server decides what is due and sends it. No
 * accounts: each device keeps a random id locally and only ever sees its own
 * reminders.
 *
 * The server is the `push` Supabase Edge Function (supabase/functions/push),
 * driven every minute by pg_cron. Without Supabase configured, push is
 * reported as unsupported.
 */

/** Endpoint of one route of the push function, or null when Supabase is not configured. */
function endpoint(route: 'subscribe' | 'status' | 'test'): string | null {
  return functionsUrl ? `${functionsUrl}/push/${route}` : null;
}

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
    functionsUrl !== null &&
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

/** How far ahead day modes are resolved into concrete dates for the server. */
const HORIZON_DAYS = 90;

/**
 * Upcoming days, split by what each one would show, so a recurring reminder
 * can skip holidays and farm days, and a farm routine can be sent as the
 * handful of dates it actually applies to.
 */
function upcomingDays(dayModes?: DayModeMap) {
  const today = new Date();
  const days: { key: string; mode: ReturnType<typeof resolveDayMode> }[] = [];
  for (let i = 0; i < HORIZON_DAYS; i += 1) {
    const key = toDayKey(addDays(today, i));
    days.push({ key, mode: resolveDayMode(dayModes, key) });
  }
  return days;
}

/** The reminders this device wants, flattened for the server. */
export function buildReminders(tasks: Task[], dayModes?: DayModeMap) {
  const horizon = upcomingDays(dayModes);
  const out: {
    id: string;
    title: string;
    body: string;
    minute: number;
    kind: 'daily' | 'weekdays' | 'custom' | 'once';
    days: number[];
    date: string | null;
    /** Local dates the recurring entry must skip, because they were edited. */
    except: string[];
  }[] = [];

  const add = (
    id: string,
    title: string,
    startMinutes: number,
    reminderMinutes: number,
    kind: 'daily' | 'weekdays' | 'custom' | 'once',
    days: number[],
    date: string | null,
    except: string[] = [],
  ) => {
    const minute = startMinutes - reminderMinutes;
    if (minute < 0 || minute >= 24 * 60) return;
    out.push({
      id,
      title,
      body:
        reminderMinutes === 0
          ? `Es hora · ${formatTime(startMinutes)}`
          : `En ${reminderMinutes} min · ${formatTime(startMinutes)}`,
      minute,
      kind,
      days,
      date,
      except,
    });
  };

  for (const task of tasks) {
    if (task.reminderMinutes === null) continue;

    /**
     * A day the routine was edited on its own, or skipped, must not use the
     * series' time. Each override becomes its own one-off entry and the day is
     * excluded from the recurring one, so an edited occurrence is reminded at
     * the time the user actually set.
     */
    const overriddenDays = new Set<string>();

    for (const [dayKey, override] of Object.entries(task.overrides ?? {})) {
      const start = override.startMinutes ?? task.startMinutes;
      if (start === null) continue;
      overriddenDays.add(dayKey);
      add(
        `${task.id}@${dayKey}`,
        override.title ?? task.title,
        start,
        task.reminderMinutes,
        'once',
        [],
        dayKey,
      );
    }

    if (task.startMinutes === null) continue;

    if (task.repeat.kind === 'none') {
      // A one-off already handled by an override should not be sent twice,
      // and one on a day that hides it (holiday, wrong context) not at all.
      if (
        !overriddenDays.has(task.date) &&
        !task.skippedDays.includes(task.date) &&
        taskFitsMode(task, resolveDayMode(dayModes, task.date))
      ) {
        add(task.id, task.title, task.startMinutes, task.reminderMinutes, 'once', [], task.date);
      }
      continue;
    }

    /**
     * The server only knows weekdays, not how a day is spent. Farm routines
     * apply to a few explicitly marked dates, so they go up as one-offs; the
     * rest go up as the series, minus the upcoming dates that would hide them.
     */
    const matchesWeekday = (key: string) => {
      const weekday = new Date(`${key}T00:00:00`).getDay();
      return task.repeat.kind === 'daily'
        ? true
        : task.repeat.kind === 'weekdays'
          ? weekday >= 1 && weekday <= 5
          : task.repeat.days.includes(weekday as (typeof task.repeat.days)[number]);
    };

    if (task.context === 'farm') {
      for (const day of horizon) {
        if (day.mode !== 'farm' || day.key < task.date) continue;
        if (!matchesWeekday(day.key)) continue;
        if (overriddenDays.has(day.key) || task.skippedDays.includes(day.key)) continue;
        add(
          `${task.id}@${day.key}`,
          task.title,
          task.startMinutes,
          task.reminderMinutes,
          'once',
          [],
          day.key,
        );
      }
      continue;
    }

    const hiddenDays = horizon
      .filter((day) => !taskFitsMode(task, day.mode))
      .map((day) => day.key);

    add(
      task.id,
      task.title,
      task.startMinutes,
      task.reminderMinutes,
      task.repeat.kind,
      task.repeat.kind === 'custom' ? task.repeat.days : [],
      null,
      // Days handled by an override, days the user removed outright, and days
      // whose mode hides this routine.
      [...new Set([...overriddenDays, ...task.skippedDays, ...hiddenDays])],
    );
  }

  return out;
}

async function getSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) return null;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
}

/**
 * Fire-and-forget upload that survives the page being closed.
 *
 * `keepalive` lets the request outlive the page, like a beacon, while still
 * carrying the headers the function needs; `sendBeacon` cannot set any.
 */
export function uploadBeacon(tasks: Task[], dayModes?: DayModeMap): boolean {
  if (!supported() || Notification.permission !== 'granted') return false;
  const url = endpoint('subscribe');
  if (!url) return false;
  try {
    const cached = cachedSubscription;
    if (!cached) return false;
    const payload = JSON.stringify({
      deviceId: deviceId(),
      subscription: cached,
      reminders: buildReminders(tasks, dayModes),
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    });
    void fetch(url, {
      method: 'POST',
      headers: { ...functionHeaders, 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Last subscription seen, so a beacon can be sent without awaiting anything. */
let cachedSubscription: PushSubscriptionJSON | null = null;

async function upload(
  subscription: PushSubscription,
  tasks: Task[],
  dayModes?: DayModeMap,
): Promise<boolean> {
  cachedSubscription = subscription.toJSON();
  const payload = {
    deviceId: deviceId(),
    subscription: cachedSubscription,
    reminders: buildReminders(tasks, dayModes),
    // The server has no idea what timezone the device is in.
    tzOffsetMinutes: new Date().getTimezoneOffset(),
  };

  const url = endpoint('subscribe');
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...functionHeaders, 'Content-Type': 'application/json' },
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
export async function enablePush(tasks: Task[], dayModes?: DayModeMap): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (getState() === 'needs-install') return 'needs-install';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const subscription = await getSubscription();
  if (!subscription) return 'default';

  await upload(subscription, tasks, dayModes);
  return 'subscribed';
}

/**
 * Re-uploads the current reminders.
 *
 * iOS drops push subscriptions on its own — after a reinstall, sometimes after
 * an OS update — so this re-reads the subscription rather than trusting a
 * cached one, and quietly does nothing when there is no permission yet.
 */
export async function syncReminders(tasks: Task[], dayModes?: DayModeMap): Promise<boolean> {
  if (!supported() || Notification.permission !== 'granted') return false;
  try {
    const subscription = await getSubscription();
    if (!subscription) return false;
    return await upload(subscription, tasks, dayModes);
  } catch {
    return false;
  }
}

/** Asks the server whether it currently knows this device. */
export async function isRegistered(): Promise<boolean> {
  const status = await serverStatus();
  return status?.registered === true;
}

/** What the server currently holds for this device. */
export async function serverStatus(): Promise<{
  registered: boolean;
  reminders: number;
  updatedAt: string | null;
} | null> {
  try {
    // Must bypass the cache: the service worker would otherwise keep serving
    // the stale answer from before the device was stored.
    const url = endpoint('status');
    if (!url) return null;
    const res = await fetch(`${url}?deviceId=${encodeURIComponent(deviceId())}`, {
      headers: functionHeaders,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
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

async function postTest(): Promise<Response | null> {
  try {
    const url = endpoint('test');
    if (!url) return null;
    return await fetch(url, {
      method: 'POST',
      headers: { ...functionHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId() }),
    });
  } catch {
    return null;
  }
}

/**
 * Sends one push immediately, to prove the whole chain works end to end.
 *
 * If the server does not know this device — an expired subscription, or a build
 * that predates push — it registers and retries once, so the button repairs the
 * situation instead of only reporting it.
 */
export async function sendTestPush(
  tasks: Task[] = [],
  dayModes?: DayModeMap,
): Promise<{ ok: boolean; error?: string }> {
  if (!supported()) {
    return { ok: false, error: 'Este navegador no admite avisos.' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, error: 'Primero activa el permiso de notificaciones.' };
  }

  let res = await postTest();

  if (res && (res.status === 404 || res.status === 410)) {
    const subscription = await getSubscription().catch(() => null);
    if (!subscription) {
      return {
        ok: false,
        error: 'No se pudo crear la suscripción. Cierra la app del todo, ábrela y reintenta.',
      };
    }
    const uploaded = await upload(subscription, tasks, dayModes);
    if (!uploaded) {
      return { ok: false, error: 'No se pudo registrar el dispositivo en el servidor.' };
    }
    res = await postTest();
  }

  if (!res) return { ok: false, error: 'Sin conexión con el servidor.' };

  const data = await res.json().catch(() => ({}) as { error?: string });
  return res.ok
    ? { ok: true }
    : { ok: false, error: data?.error ?? `Error del servidor (${res.status})` };
}
