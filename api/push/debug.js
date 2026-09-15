/**
 * Temporary diagnostic: shows what the store actually contains and how the
 * read path resolves, so a mismatch between write and read is visible.
 */
import { get, list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.query?.key !== process.env.PUSH_CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const out = { listed: [], reads: {} };

  try {
    const page = await list({ prefix: 'push/', limit: 100 });
    out.listed = page.blobs.map((b) => ({ pathname: b.pathname, size: b.size, url: b.url }));
  } catch (e) {
    out.listError = String(e?.message ?? e);
  }

  const target = out.listed[0]?.pathname;
  if (target) {
    for (const access of ['private', 'public']) {
      try {
        const r = await get(target, { access });
        out.reads[access] = r?.stream ? 'stream ok' : r ? Object.keys(r).join(',') : 'null';
      } catch (e) {
        out.reads[access] = 'ERROR: ' + String(e?.message ?? e).slice(0, 120);
      }
    }
    // Reading by the listed URL is the other candidate path.
    try {
      const r = await get(out.listed[0].url, { access: 'private' });
      out.reads.byUrl = r?.stream ? 'stream ok' : 'null';
    } catch (e) {
      out.reads.byUrl = 'ERROR: ' + String(e?.message ?? e).slice(0, 120);
    }
  }

  // Run the real read path, surfacing the error the store module swallows.
  if (target) {
    try {
      const r = await get(target, { access: 'private' });
      const text = await new Response(r.stream).text();
      out.parsed = {
        length: text.length,
        head: text.slice(0, 80),
        json: (() => {
          try {
            const o = JSON.parse(text);
            return { hasSubscription: !!o.subscription, reminders: o.reminders?.length ?? 0 };
          } catch (e) {
            return 'JSON PARSE FAIL: ' + String(e?.message).slice(0, 80);
          }
        })(),
      };
    } catch (e) {
      out.parsed = 'READ FAIL: ' + String(e?.message ?? e).slice(0, 200);
    }
  }

  return res.status(200).json(out);
}
