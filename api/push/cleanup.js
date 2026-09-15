/**
 * One-off maintenance: removes device records that hold no real subscription,
 * left behind by diagnostics. Guarded by the same secret as the sender.
 */
import { del, list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.query?.key !== process.env.PUSH_CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const keep = String(req.query?.keep ?? '');
  const removed = [];

  try {
    const page = await list({ prefix: 'push/', limit: 100 });
    for (const blob of page.blobs) {
      const id = blob.pathname.replace('push/', '').replace('.json', '');
      if (id === keep) continue;
      await del(blob.pathname);
      removed.push(id);
    }
    return res.status(200).json({ ok: true, removed, kept: keep });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message ?? error) });
  }
}
