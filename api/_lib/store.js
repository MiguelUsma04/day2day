/**
 * Server-side storage for push subscriptions and their reminders.
 *
 * Backed by Vercel Blob rather than a database: the payload is one small JSON
 * document per device, and the app has no other server state to justify one.
 *
 * Each device owns a record keyed by a random id the client keeps locally, so
 * no accounts are needed and one person's reminders never reach another's
 * device. Reminders are stored as "what to send and at which local minute",
 * with the device's UTC offset, so the sender can work out the right instant
 * without knowing anything about the user.
 */

import { head, list, put, del } from '@vercel/blob';

const PREFIX = 'push/';

/** A device id is generated client-side; keep it to a safe, bounded shape. */
export function isValidDeviceId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

function pathFor(deviceId) {
  return `${PREFIX}${deviceId}.json`;
}

export async function saveDevice(deviceId, record) {
  await put(pathFor(deviceId), JSON.stringify(record), {
    access: 'public',
    contentType: 'application/json',
    // The path is the identity of the record, so keep it stable across writes.
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function loadDevice(deviceId) {
  try {
    const meta = await head(pathFor(deviceId));
    if (!meta?.url) return null;
    const res = await fetch(meta.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // A missing blob throws; treat it as "no record" rather than an error.
    return null;
  }
}

export async function deleteDevice(deviceId) {
  try {
    const meta = await head(pathFor(deviceId));
    if (meta?.url) await del(meta.url);
  } catch {
    // Already gone is success for our purposes.
  }
}

/** Every registered device, for the scheduled sender to walk through. */
export async function listDevices() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      try {
        const res = await fetch(blob.url, { cache: 'no-store' });
        if (!res.ok) continue;
        const record = await res.json();
        if (record?.subscription) out.push(record);
      } catch {
        // Skip an unreadable record instead of failing the whole run.
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}
