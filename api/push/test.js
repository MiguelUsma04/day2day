/**
 * Sends one push to a single device, on demand.
 *
 * This is what proves the whole chain — subscription, VAPID keys, service
 * worker — actually works, which an in-page notification cannot: that one only
 * shows the browser can draw a banner, not that the server can reach the phone.
 */

import webpush from 'web-push';

import { deleteDevice, isValidDeviceId, loadDevice } from '../_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return res.status(500).json({ error: 'Faltan las claves VAPID en el servidor' });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@day2day.app',
    publicKey,
    privateKey,
  );

  const { deviceId } = req.body ?? {};
  if (!isValidDeviceId(deviceId)) {
    return res.status(400).json({ error: 'deviceId inválido' });
  }

  const device = await loadDevice(deviceId);
  if (!device?.subscription) {
    return res.status(404).json({ error: 'Este dispositivo no está registrado' });
  }

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
    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error?.statusCode;
    if (status === 404 || status === 410) {
      // The browser revoked this subscription; drop it so it is re-created.
      await deleteDevice(deviceId);
      return res.status(410).json({ error: 'La suscripción caducó. Vuelve a activar los avisos.' });
    }
    return res
      .status(500)
      .json({ error: 'No se pudo enviar', detail: String(error?.message ?? error) });
  }
}
