/**
 * Registers (or updates) a device's push subscription and its reminders.
 *
 * The client posts the whole set every time its schedule changes, so this is a
 * replace rather than a merge: the device is the source of truth for its own
 * data, and a stale server copy would send reminders the user already deleted.
 */

import { isValidDeviceId, saveDevice } from '../_lib/store.js';

/** Bound the payload so a bad client cannot store something unreasonable. */
const MAX_REMINDERS = 200;

function sanitizeReminders(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_REMINDERS)
    .map((r) => ({
      id: String(r?.id ?? '').slice(0, 80),
      title: String(r?.title ?? '').slice(0, 120),
      body: String(r?.body ?? '').slice(0, 200),
      // Local minute of the day the notification should appear at.
      minute: Number(r?.minute),
      // Which days it applies to: 'daily', 'weekdays', or explicit weekdays.
      days: Array.isArray(r?.days)
        ? r.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).slice(0, 7)
        : [],
      kind: r?.kind === 'daily' || r?.kind === 'weekdays' || r?.kind === 'custom' || r?.kind === 'once'
        ? r.kind
        : 'once',
      // For one-off reminders, the local date it belongs to.
      date: typeof r?.date === 'string' ? r.date.slice(0, 10) : null,
    }))
    .filter(
      (r) =>
        r.id &&
        r.title &&
        Number.isInteger(r.minute) &&
        r.minute >= 0 &&
        r.minute < 24 * 60,
    );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { deviceId, subscription, reminders, tzOffsetMinutes } = req.body ?? {};

    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ error: 'deviceId inválido' });
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'subscription incompleta' });
    }

    await saveDevice(deviceId, {
      deviceId,
      subscription,
      reminders: sanitizeReminders(reminders),
      // Sent by the client because the server has no idea where the user is.
      tzOffsetMinutes: Number.isFinite(tzOffsetMinutes) ? Number(tzOffsetMinutes) : 0,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo guardar', detail: String(error?.message ?? error) });
  }
}
