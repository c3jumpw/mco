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
  thumbnail?: string | null;
  reason?: 'not_loom' | 'not_found' | 'private_or_unavailable' | 'lookup_failed' | 'network';
}

const cache = new Map<string, Promise<LoomInfo>>();

export function fetchLoomInfo(url: string): Promise<LoomInfo> {
  const id = loomId(url);
  if (!id) return Promise.resolve({ ok: false, reason: 'not_loom' });
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`/api/loom?url=${encodeURIComponent(url.trim())}`)
        .then((r) => (r.ok ? r.json() : { ok: false, id, reason: 'lookup_failed' }))
        .catch(() => ({ ok: false, id, reason: 'network' as const }))
    );
  }
  return cache.get(id)!;
}

export function embedUrl(id: string) {
  return `https://www.loom.com/embed/${id}?hide_owner=true&hide_share=true&hideEmbedTopBar=true`;
}
