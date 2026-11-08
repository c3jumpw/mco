// Looks up a Loom share link's public metadata (title, duration) via Loom's oEmbed endpoint.
// Used to check answer length/format without opening every video.
const LOOM_RE = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/(?:[^/?#]*-)?([a-f0-9]{32})/i;

export default async function handler(req, res) {
  const url = String((req.query && req.query.url) || '').trim();
  const m = url.match(LOOM_RE);
  if (!m) {
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
      res.status(200).json({ ok: false, id, reason: r.status === 404 ? 'not_found' : 'private_or_unavailable', status: r.status });
      return;
    }
    const d = await r.json();
    const dur = typeof d.duration === 'number' ? d.duration : d.duration ? Number(d.duration) : null;
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.status(200).json({
      ok: true,
      id,
      title: d.title || '',
      duration: Number.isFinite(dur) ? Math.round(dur) : null,
      thumbnail: d.thumbnail_url || null,
      author: d.author_name || null,
    });
  } catch (e) {
    res.status(200).json({ ok: false, id, reason: 'lookup_failed' });
  }
}
