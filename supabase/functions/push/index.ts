// deno-lint-ignore-file no-explicit-any
/**
 * Web Push backend for day2day, as one Supabase Edge Function.
 *
 * Routes (under /functions/v1/push):
 *   POST /subscribe  registers a device and replaces its reminders
 *   GET  /status     says whether the server knows a device
 *   POST /test       sends one push to a device right away
 *   POST /send       sends everything due now; called by pg_cron every minute
 *                    (idempotent, so it needs no secret beyond the public key)
 *
 * Devices are keyed by a random id the client keeps locally, so no account is
 * needed and one person's reminders never reach another's device. Reminders
 * are stored as "what to send and at which local minute", with the device's
 * UTC offset, so the sender can work out the right instant without knowing
 * anything about the user.
 *
 * Secrets (Dashboard → Edge Functions → Secrets): VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT. SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const TABLE = 'push_devices';
/** How far past its time a reminder may still be sent, in minutes. */
const GRACE_MINUTES = 12;
/** Bound the payload so a bad client cannot store something unreasonable. */
const MAX_REMINDERS = 200;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** Keys the app may present: legacy anon JWT and/or the newer publishable key. */
const CLIENT_KEYS = new Set(
  [Deno.env.get('SUPABASE_ANON_KEY'), Deno.env.get('SUPABASE_PUBLISHABLE_KEY')].filter(
    (k): k is string => Boolean(k),
  ),
);

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function configureWebPush(): boolean {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@day2day.app';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/** A device id is generated client-side; keep it to a safe, bounded shape. */
function isValidDeviceId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

// ------------------------------------------------------------------ storage

type Reminder = {
  id: string;
  title: string;
  body: string;
  minute: number;
  days: number[];
  kind: 'daily' | 'weekdays' | 'custom' | 'once';
  date: string | null;
  except: string[];
  lastSentDate?: string;
};

type Device = {
  deviceId: string;
  subscription: any;
  reminders: Reminder[];
  tzOffsetMinutes: number;
  updatedAt: string;
};

function toRecord(row: any): Device | null {
  if (!row) return null;
  return {
    deviceId: row.device_id,
    subscription: row.subscription,
    reminders: Array.isArray(row.reminders) ? row.reminders : [],
    tzOffsetMinutes: row.tz_offset_minutes ?? 0,
    updatedAt: row.updated_at,
  };
}

async function saveDevice(device: Device): Promise<void> {
  const { error } = await db.from(TABLE).upsert(
    {
      device_id: device.deviceId,
      subscription: device.subscription,
      reminders: device.reminders,
      tz_offset_minutes: Number.isFinite(device.tzOffsetMinutes) ? device.tzOffsetMinutes : 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id' },
  );
  if (error) throw error;
}

async function loadDevice(deviceId: string): Promise<Device | null> {
  const { data, error } = await db.from(TABLE).select('*').eq('device_id', deviceId).maybeSingle();
  if (error) throw error;
  return toRecord(data);
}

async function deleteDevice(deviceId: string): Promise<void> {
  await db.from(TABLE).delete().eq('device_id', deviceId);
}

async function listDevices(): Promise<Device[]> {
  const out: Device[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .order('device_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const record = toRecord(row);
      if (record?.subscription) out.push(record);
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ----------------------------------------------------------------- handlers

function sanitizeReminders(input: unknown): Reminder[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_REMINDERS)
    .map((r: any) => ({
      id: String(r?.id ?? '').slice(0, 80),
      title: String(r?.title ?? '').slice(0, 120),
      body: String(r?.body ?? '').slice(0, 200),
      minute: Number(r?.minute),
      days: Array.isArray(r?.days)
        ? r.days.filter((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6).slice(0, 7)
        : [],
      kind:
        r?.kind === 'daily' || r?.kind === 'weekdays' || r?.kind === 'custom' || r?.kind === 'once'
          ? r.kind
          : 'once',
      date: typeof r?.date === 'string' ? r.date.slice(0, 10) : null,
      except: Array.isArray(r?.except)
        ? r.except.filter((d: unknown) => typeof d === 'string').slice(0, 120)
        : [],
    }))
    .filter(
      (r: Reminder) =>
        r.id && r.title && Number.isInteger(r.minute) && r.minute >= 0 && r.minute < 24 * 60,
    );
}

/**
 * Registers (or updates) a device's push subscription and its reminders.
 *
 * The client posts the whole set every time its schedule changes, so this is
 * a replace rather than a merge. What was already delivered today is carried
 * over, or the same reminder would be sent again on the next run.
 */
async function subscribe(req: Request): Promise<Response> {
  const { deviceId, subscription, reminders, tzOffsetMinutes } = await req.json().catch(() => ({}));

  if (!isValidDeviceId(deviceId)) return json({ error: 'deviceId inválido' }, 400);
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return json({ error: 'subscription incompleta' }, 400);
  }

  const previous = await loadDevice(deviceId);
  const alreadySent = new Map(
    (previous?.reminders ?? [])
      .filter((r) => r.lastSentDate)
      .map((r) => [r.id, r.lastSentDate as string]),
  );
  const incoming = sanitizeReminders(reminders).map((r) => {
    const lastSentDate = alreadySent.get(r.id);
    return lastSentDate ? { ...r, lastSentDate } : r;
  });

  await saveDevice({
    deviceId,
    subscription,
    reminders: incoming,
    tzOffsetMinutes: Number.isFinite(tzOffsetMinutes) ? Number(tzOffsetMinutes) : 0,
    updatedAt: new Date().toISOString(),
  });
  return json({ ok: true });
}

async function status(url: URL): Promise<Response> {
  const deviceId = url.searchParams.get('deviceId');
  if (!isValidDeviceId(deviceId)) return json({ error: 'deviceId inválido' }, 400);
  const device = await loadDevice(deviceId);
  return json({
    registered: Boolean(device?.subscription),
    reminders: device?.reminders?.length ?? 0,
    updatedAt: device?.updatedAt ?? null,
  });
}

/** One push, on demand: proves subscription, VAPID keys and service worker end to end. */
async function test(req: Request): Promise<Response> {
  if (!configureWebPush()) return json({ error: 'Faltan las claves VAPID en el servidor' }, 500);
  const { deviceId } = await req.json().catch(() => ({}));
  if (!isValidDeviceId(deviceId)) return json({ error: 'deviceId inválido' }, 400);

  const device = await loadDevice(deviceId);
  if (!device?.subscription) return json({ error: 'Este dispositivo no está registrado' }, 404);

  try {
    await webpush.sendNotification(
      device.subscription,
      JSON.stringify({
        title: 'day2day',
        body: 'Prueba enviada desde el servidor. Los avisos funcionan con la app cerrada.',
        tag: 'day2day-server-test',
        url: '/',
      }),
    );
    return json({ ok: true });
  } catch (error: any) {
    const code = error?.statusCode;
    if (code === 404 || code === 410) {
      await deleteDevice(deviceId);
      return json({ error: 'La suscripción caducó. Vuelve a activar los avisos.' }, 410);
    }
    return json({ error: 'No se pudo enviar', detail: String(error?.message ?? error) }, 500);
  }
}

/** The device's own wall-clock time, derived from the offset it reported. */
function localNow(tzOffsetMinutes: number) {
  const local = new Date(Date.now() - tzOffsetMinutes * 60000);
  return {
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
    dateKey: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(
      local.getUTCDate(),
    ).padStart(2, '0')}`,
  };
}

function appliesToday(reminder: Reminder, weekday: number, dateKey: string): boolean {
  if (reminder.except?.includes(dateKey)) return false;
  switch (reminder.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday >= 1 && weekday <= 5;
    case 'custom':
      return reminder.days.includes(weekday);
    case 'once':
      return reminder.date === dateKey;
    default:
      return false;
  }
}

/**
 * Sends every reminder that falls due in the current window.
 *
 * Idempotent: each reminder records the local date it was last sent for and
 * is skipped if that date is already stored, so a late or doubled trigger
 * never duplicates a notification.
 */
async function send(): Promise<Response> {
  if (!configureWebPush()) return json({ error: 'Faltan las claves VAPID en el entorno' }, 500);

  const summary = { devices: 0, sent: 0, skipped: 0, failed: 0, pruned: 0 };
  const log: unknown[] = [];

  const devices = await listDevices();
  summary.devices = devices.length;

  for (const device of devices) {
    const { minute, weekday, dateKey } = localNow(device.tzOffsetMinutes ?? 0);

    for (const reminder of device.reminders ?? []) {
      if (!appliesToday(reminder, weekday, dateKey)) continue;
      const due = minute - reminder.minute;
      if (due < 0 || due > GRACE_MINUTES) continue;
      if (reminder.lastSentDate === dateKey) {
        summary.skipped += 1;
        continue;
      }

      try {
        await webpush.sendNotification(
          device.subscription,
          JSON.stringify({
            title: reminder.title,
            body: reminder.body,
            tag: `${reminder.id}:${dateKey}`,
            url: '/',
          }),
          // High urgency so Apple and Google deliver it now; short TTL because a
          // reminder is useless late.
          { urgency: 'high', TTL: 15 * 60 },
        );
        reminder.lastSentDate = dateKey;
        summary.sent += 1;
        log.push({ title: reminder.title, at: reminder.minute, now: minute, lateBy: due });
        // Record it right away so the next run never reads a stale record.
        await saveDevice(device);
      } catch (error: any) {
        const code = error?.statusCode;
        if (code === 404 || code === 410) {
          await deleteDevice(device.deviceId);
          summary.pruned += 1;
          break;
        }
        summary.failed += 1;
      }
    }
  }

  return json({ ok: true, ...summary, log, at: new Date().toISOString() });
}

// ------------------------------------------------------------------- router

function bearer(req: Request): string {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

/** Browser calls carry the anon key; the cron carries the service role key. */
function isClient(req: Request): boolean {
  const key = req.headers.get('apikey') ?? bearer(req);
  return key.length > 0 && (CLIENT_KEYS.has(key) || key === SERVICE_KEY || isLegacyAnon(key));
}

/**
 * Legacy anon keys are JWTs; new projects hand the function only the
 * publishable key, so a legacy anon key is recognised by its claims instead.
 * The anon key is public by design, so this is a gate against stray traffic,
 * not a secret check.
 */
function isLegacyAnon(key: string): boolean {
  try {
    const [, payload] = key.split('.');
    if (!payload) return false;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    return claims?.role === 'anon' && claims?.ref === ref;
  } catch {
    return false;
  }
}

/**
 * The cron (pg_net) carries the project's public key: /send is idempotent and
 * only ever delivers what is due within the grace window, so a stray call
 * cannot cause a wrong or duplicate notification.
 */
function isCron(req: Request): boolean {
  return isClient(req);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/push/, '').replace(/\/+$/, '') || '/';

  try {
    if (route === '/send') {
      if (!isCron(req)) return json({ error: 'No autorizado' }, 401);
      return await send();
    }
    if (!isClient(req)) return json({ error: 'No autorizado' }, 401);

    if (route === '/subscribe' && req.method === 'POST') return await subscribe(req);
    if (route === '/status' && req.method === 'GET') return await status(url);
    if (route === '/test' && req.method === 'POST') return await test(req);
    return json({ error: 'Ruta no encontrada' }, 404);
  } catch (error: any) {
    return json({ error: 'Fallo interno', detail: String(error?.message ?? error) }, 500);
  }
});
