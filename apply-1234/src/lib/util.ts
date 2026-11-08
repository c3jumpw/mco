// Small helpers shared by candidate and admin pages.

const mem: Record<string, string> = {};

export function store(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    if (value === undefined) return mem[key] ?? null;
    if (value === null) delete mem[key];
    else mem[key] = value;
  }
  return value ?? null;
}

export function storeJson<T>(key: string, value?: T | null): T | null {
  if (value === undefined) {
    const raw = store(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  store(key, value === null ? null : JSON.stringify(value));
  return value;
}

export function uid(prefix = ''): string {
  const r = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
  return prefix + r.slice(0, 8);
}

export function visitorId(): string {
  let v = store('a1234_vid');
  if (!v) { v = uid('v'); store('a1234_vid', v); }
  return v;
}

/** True on a browser where an admin has signed in, so their own test visits are marked as previews. */
export function isPreviewBrowser(): boolean {
  return store('a1234_admin') === '1';
}

export function fmtDuration(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtSpan(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)} days`;
}

export function fmtDate(iso?: string | null, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, withTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function relTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso, false);
}

export function minutesLabel(sec?: number | null): string {
  if (sec == null) return '';
  const m = sec / 60;
  return Number.isInteger(m) ? `${m}` : m.toFixed(1);
}

export function rangeLabel(min?: number | null, max?: number | null): string {
  if (min && max) return `${minutesLabel(min)}–${minutesLabel(max)} minutes`;
  if (max) return `up to ${minutesLabel(max)} minutes`;
  if (min) return `at least ${minutesLabel(min)} minutes`;
  return '';
}

export async function copyText(text: string, html?: string): Promise<boolean> {
  try {
    if (html && 'ClipboardItem' in window && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function download(filename: string, content: string, mime = 'text/markdown') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';
}

const WORDS = ['harbor', 'ember', 'quarry', 'lantern', 'meridian', 'cobalt', 'atlas', 'juniper', 'summit', 'ledger',
  'falcon', 'orbit', 'granite', 'willow', 'beacon', 'kestrel', 'saffron', 'tundra', 'voyage', 'cinder'];

export function randomSlug(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${w}-${n}`;
}

export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}
