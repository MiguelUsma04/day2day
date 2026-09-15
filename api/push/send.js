/**
 * Sends every reminder that falls due in the current window.
 *
 * Invoked on a schedule by an external trigger (see README): Vercel's own cron
 * runs only once a day on the Hobby plan, which is useless for minute-accurate
 * reminders.
 *
 * Idempotency matters more than precision here. The trigger may fire late, or
 * twice, so each reminder records the local date it was last sent for and is
 * skipped if that date is already stored. A missed window is caught by the next
 * run as long as the reminder is still inside the grace period.
 */

import webpush from 'web-push';

import { deleteDevice, listDevices, saveDevice } from '../_lib/store.js';

/** How far past its time a reminder may still be sent, in minutes. */
const GRACE_MINUTES = 12;

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@day2day.app';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/** The device's own wall-clock time, derived from the offset it reported. */
function localNow(tzOffsetMinutes) {
  const utcMs = Date.now();
  const local = new Date(utcMs - tzOffsetMinutes * 60000);
  return {
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
    dateKey: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(
      local.getUTCDate(),
    ).padStart(2, '0')}`,
  };
}

function appliesToday(reminder, weekday, dateKey) {
  // A day edited on its own is sent by its own entry, not by the series.
  if (Array.isArray(reminder.except) && reminder.except.includes(dateKey)) return false;

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

export default async function handler(req, res) {
  // A shared secret keeps the endpoint from being triggered by anyone.
  const secret = process.env.PUSH_CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? req.query?.key ?? '';
    if (provided !== secret) return res.status(401).json({ error: 'No autorizado' });
  }

  if (!configureWebPush()) {
    return res.status(500).json({ error: 'Faltan las claves VAPID en el entorno' });
  }

  const summary = { devices: 0, sent: 0, skipped: 0, failed: 0, pruned: 0 };
  const log = [];

  try {
    const devices = await listDevices();
    summary.devices = devices.length;

    for (const device of devices) {
      const { minute, weekday, dateKey } = localNow(device.tzOffsetMinutes ?? 0);

      for (const reminder of device.reminders ?? []) {
        if (!appliesToday(reminder, weekday, dateKey)) continue;

        const due = minute - reminder.minute;
        if (due < 0 || due > GRACE_MINUTES) continue;

        // Already delivered for this local day.
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
            {
              // Apple and Google hold low-urgency pushes to save battery, which
              // can delay them by minutes. A reminder is useless late.
              urgency: 'high',
              // No point delivering a reminder long after its moment.
              TTL: 15 * 60,
            },
          );
          reminder.lastSentDate = dateKey;
          summary.sent += 1;
          log.push({ title: reminder.title, at: reminder.minute, now: minute, lateBy: due });
          // Record it right away: a slow run must not let the next trigger
          // read a stale record and send the same reminder twice.
          await saveDevice(device.deviceId, device);
        } catch (error) {
          // 404/410 mean the browser dropped the subscription for good.
          const status = error?.statusCode;
          if (status === 404 || status === 410) {
            await deleteDevice(device.deviceId);
            summary.pruned += 1;
            break;
          }
          summary.failed += 1;
        }
      }

    }

    return res
      .status(200)
      .json({ ok: true, ...summary, log, at: new Date().toISOString() });
  } catch (error) {
    return res
      .status(500)
      .json({ error: 'Fallo al enviar', detail: String(error?.message ?? error), ...summary });
  }
}
