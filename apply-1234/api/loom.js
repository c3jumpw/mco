// Looks up a Loom share link's public metadata (title, duration) via Loom's oEmbed endpoint.
// Used to check answer length/format without opening every video.
// Right after recording, Loom reports a duration of 0 while it processes the video. We treat that
// as "still processing" (duration: null) and don't cache it, so the next check gets the real length.
const LOOM_RE = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/(?:[^/?#]*-)?([a-f0-9]{32})/i;

export default async function handler(req, res) {
  const url = String((req.query && req.query.url) || '').trim();
  const m = url.match(LOOM_RE);
  if (!m) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, reason: 'not_loom' });
    return;
  }
  const id = m[1].toLowerCase();
  try {
    const r = await fetch(
      'https://www.loom.com/v1/oembed?url=' + encodeURIComponent('https://www.loom.com/share/' + id),
      { headers: { accept: 'application/json', 'user-agent': 'apply1234-link-check' } }
    );
    if (!r.ok) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: false, id, reason: r.status === 404 ? 'not_found' : 'private_or_unavailable', status: r.status });
      return;
    }
    const d = await r.json();
    const raw = typeof d.duration === 'number' ? d.duration : d.duration ? Number(d.duration) : NaN;
    const seconds = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : null;
    res.setHeader('Cache-Control', seconds ? 's-maxage=300, stale-while-revalidate=3600' : 'no-store');
    res.status(200).json({
      ok: true,
      id,
      title: d.title || '',
      duration: seconds,
      processing: seconds === null,
      thumbnail: d.thumbnail_url || null,
      author: d.author_name || null,
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, id, reason: 'lookup_failed' });
  }
}
