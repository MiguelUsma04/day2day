/**
 * Temporary diagnostic: shows what each device has stored and whether any
 * reminder is due right now, so a silent miss can be traced.
 */
import { list } from '@vercel/blob';
import { get } from '@vercel/blob';

const GRACE_MINUTES = 12;

function localNow(tzOffsetMinutes) {
  const local = new Date(Date.now() - tzOffsetMinutes * 60000);
  return {
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
    dateKey: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`,
  };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default async function handler(req, res) {
  if (req.query?.key !== process.env.PUSH_CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const out = { serverUtc: new Date().toISOString(), devices: [] };
  const page = await list({ prefix: 'push/', limit: 100 });

  for (const blob of page.blobs) {
    try {
      const r = await get(blob.pathname, { access: 'private' });
      const record = JSON.parse(await new Response(r.stream).text());
      const now = localNow(record.tzOffsetMinutes ?? 0);

      const reminders = (record.reminders ?? []).map((rm) => ({
        title: rm.title,
        at: hhmm(rm.minute),
        kind: rm.kind,
        days: rm.days,
        date: rm.date,
        lastSentDate: rm.lastSentDate ?? null,
        dueIn: rm.minute - now.minute,
      }));

      // Anything that should have fired inside the window.
      const dueNow = reminders.filter((rm) => {
        const past = now.minute - Number(rm.at.slice(0, 2)) * 60 - Number(rm.at.slice(3));
        return past >= 0 && past <= GRACE_MINUTES;
      });

      out.devices.push({
        deviceId: record.deviceId,
        tzOffsetMinutes: record.tzOffsetMinutes,
        localTime: hhmm(now.minute),
        localDate: now.dateKey,
        weekday: now.weekday,
        totalReminders: reminders.length,
        dueNow,
        // A window around now, to see what is scheduled nearby.
        nearby: reminders
          .filter((rm) => Math.abs(rm.dueIn) <= 90)
          .sort((a, b) => a.dueIn - b.dueIn)
          .slice(0, 12),
      });
    } catch (e) {
      out.devices.push({ pathname: blob.pathname, error: String(e?.message ?? e).slice(0, 120) });
    }
  }

  return res.status(200).json(out);
}
