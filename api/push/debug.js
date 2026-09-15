/** Temporary: shows what the sender sees right now, to trace a silent miss. */
import { get, list } from '@vercel/blob';

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default async function handler(req, res) {
  if (req.query?.key !== process.env.PUSH_CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const page = await list({ prefix: 'push/', limit: 10 });
  const out = { utc: new Date().toISOString(), devices: [] };

  for (const blob of page.blobs) {
    const r = await get(blob.pathname, { access: 'private' });
    const rec = JSON.parse(await new Response(r.stream).text());
    const off = rec.tzOffsetMinutes ?? 0;
    const local = new Date(Date.now() - off * 60000);
    const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
    const dateKey = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
    const weekday = local.getUTCDay();

    const rows = (rec.reminders ?? []).map((rm) => ({
      t: rm.title.slice(0, 26),
      at: hhmm(rm.minute),
      kind: rm.kind,
      days: rm.days,
      sent: rm.lastSentDate ?? null,
      past: nowMin - rm.minute,
    }));

    out.devices.push({
      localTime: hhmm(nowMin),
      dateKey,
      weekday,
      total: rows.length,
      // Anything whose time has passed today, and whether it went out.
      passedToday: rows
        .filter((x) => x.past >= 0 && x.past < 240)
        .sort((a, b) => a.past - b.past),
      upcoming: rows.filter((x) => x.past < 0 && x.past > -120).sort((a, b) => b.past - a.past),
    });
  }

  return res.status(200).json(out);
}
