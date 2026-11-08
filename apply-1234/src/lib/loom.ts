export const LOOM_RE = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/(?:[^/?#]*-)?([a-f0-9]{32})/i;

export function loomId(url: string): string | null {
  const m = url.trim().match(LOOM_RE);
  return m ? m[1].toLowerCase() : null;
}

export function looksLikeUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+\.[^\s]+/i.test(url.trim());
}

export interface LoomInfo {
  ok: boolean;
  id?: string;
  title?: string;
  duration?: number | null;
  processing?: boolean;
  thumbnail?: string | null;
  reason?: 'not_loom' | 'not_found' | 'private_or_unavailable' | 'lookup_failed' | 'network';
}

const cache = new Map<string, Promise<LoomInfo>>();

/** Loom reports 0 seconds while a fresh recording is processing; treat that as unknown. */
export function knownDuration(info?: LoomInfo | null): number | null {
  const d = info?.ok ? info.duration : null;
  return typeof d === 'number' && d >= 1 ? d : null;
}

export function fetchLoomInfo(url: string, fresh = false): Promise<LoomInfo> {
  const id = loomId(url);
  if (!id) return Promise.resolve({ ok: false, reason: 'not_loom' });
  if (fresh || !cache.has(id)) {
    const p: Promise<LoomInfo> = fetch(`/api/loom?url=${encodeURIComponent(url.trim())}${fresh ? `&t=${Date.now()}` : ''}`)
      .then((r) => (r.ok ? r.json() : { ok: false, id, reason: 'lookup_failed' }))
      .catch(() => ({ ok: false, id, reason: 'network' as const }));
    cache.set(id, p);
    // only keep answers that are final, so a still-processing video gets re-checked
    p.then((info) => { if (!info.ok || knownDuration(info) === null) cache.delete(id); });
  }
  return cache.get(id)!;
}

export function embedUrl(id: string) {
  return `https://www.loom.com/embed/${id}?hide_owner=true&hide_share=true&hideEmbedTopBar=true`;
}
