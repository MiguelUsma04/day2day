/**
 * Server-side storage for push subscriptions and their reminders.
 *
 * Backed by Vercel Blob rather than a database: the payload is one small JSON
 * document per device, and the app has no other server state to justify one.
 *
 * The store is private — these records hold push endpoints, which must not be
 * publicly fetchable — so reads go through the SDK's `get` rather than a public
 * URL.
 *
 * Each device owns a record keyed by a random id the client keeps locally, so
 * no accounts are needed and one person's reminders never reach another's
 * device. Reminders are stored as "what to send and at which local minute",
 * with the device's UTC offset, so the sender can work out the right instant
 * without knowing anything about the user.
 */

import { del, get, list, put } from '@vercel/blob';

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
    // Must match how the store was provisioned; these records are not public.
    access: 'private',
    contentType: 'application/json',
    // The path is the identity of the record, so keep it stable across writes.
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Reads and parses one record, or null when it does not exist. */
async function readBlob(pathname) {
  try {
    // `get` returns { stream, headers, blob }; the body arrives as a stream.
    const result = await get(pathname, { access: 'private' });
    if (!result?.stream) return null;
    const text = await new Response(result.stream).text();
    return text ? JSON.parse(text) : null;
  } catch {
    // A missing blob throws; treat it as "no record" rather than an error.
    return null;
  }
}

export async function loadDevice(deviceId) {
  return readBlob(pathFor(deviceId));
}

export async function deleteDevice(deviceId) {
  try {
    await del(pathFor(deviceId));
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
      const record = await readBlob(blob.pathname);
      if (record?.subscription) out.push(record);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}
