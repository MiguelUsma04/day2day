/**
 * Reports whether the server currently holds a subscription for a device.
 *
 * The client cannot tell on its own: a browser can hold a subscription the
 * server never received, which is exactly the state that makes reminders fail
 * silently.
 */

import { isValidDeviceId, loadDevice } from '../_lib/store.js';

export default async function handler(req, res) {
  const deviceId = req.query?.deviceId;
  if (!isValidDeviceId(deviceId)) {
    return res.status(400).json({ error: 'deviceId inválido' });
  }

  try {
    const device = await loadDevice(deviceId);
    return res.status(200).json({
      registered: Boolean(device?.subscription),
      reminders: device?.reminders?.length ?? 0,
      updatedAt: device?.updatedAt ?? null,
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message ?? error) });
  }
}
