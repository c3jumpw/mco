// An offer letter as the candidate reads it. The hiring team's preview uses the same component.
import { useEffect, useRef, useState } from 'react';
import { mdToHtml } from '../lib/posting';
import { fmtDay, PLACEHOLDER_RE } from '../lib/offers';
import { cx } from '../ui';

export interface OfferDocProps {
  company: string;
  address?: string;
  position: string;
  candidate: string;
  date?: string | null;        // when it was sent (ISO)
  letter: string;
  terms: string;
  attachments: { name: string; size?: number | null }[];
  onFile?: (i: number) => void;
  /** Marks [notes] the sender still has to replace (the hiring team's preview). */
  highlight?: boolean;
}

const marked = (html: string, on?: boolean) => (on
  ? html.replace(new RegExp(PLACEHOLDER_RE.source, 'g'), (m) => `<mark class="rounded bg-warn-soft text-warn px-0.5">${m}</mark>`)
  : html);

const kb = (n?: number | null) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : '');

export function OfferDocument(p: OfferDocProps) {
  return (
    <article className="rounded-2xl bg-card border border-line shadow-sm px-5 py-7 sm:px-10 sm:py-10">
      <header>
        <p className="font-display text-[30px] sm:text-[38px] leading-none">{p.company || 'Your company'}</p>
        {p.address && <p className="text-[13px] text-muted mt-2">{p.address}</p>}
        <span className="block h-[3px] w-10 bg-accent mt-4" />
        <p className="mt-5 text-[13px] font-medium text-muted uppercase tracking-[.12em]">Offer of employment</p>
        <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight mt-1">{p.position || 'Position'}</h1>
        <p className="text-sm text-muted mt-1">For {p.candidate}{p.date ? ` · ${fmtDay(p.date.slice(0, 10))}` : ''}</p>
      </header>
      <div className="prose-posting mt-6 [&_p]:text-ink" dangerouslySetInnerHTML={{ __html: marked(mdToHtml(p.letter), p.highlight) }} />
      {p.terms.trim() && (
        <section className="mt-8 pt-6 border-t border-line">
          <h2 className="font-semibold text-lg">Terms and conditions</h2>
          <div className="prose-posting text-[15px] [&_li]:my-2" dangerouslySetInnerHTML={{ __html: marked(mdToHtml(p.terms), p.highlight) }} />
        </section>
      )}
      {p.attachments.length > 0 && (
        <section className="mt-6 pt-6 border-t border-line">
          <h2 className="font-semibold text-lg">Attachments</h2>
          <p className="text-sm text-muted mt-1">These documents are part of the offer.</p>
          <ul className="mt-3 space-y-2">
            {p.attachments.map((a, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <span className="grid place-items-center h-9 w-8 rounded-md bg-accent-soft text-accent text-[10px] font-bold uppercase shrink-0">{a.name.split('.').pop()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{a.name}</span>
                  {a.size ? <span className="block text-xs text-muted">{kb(a.size)}</span> : null}
                </span>
                {p.onFile && <button className="text-sm font-medium underline underline-offset-2 hover:text-accent" onClick={() => p.onFile!(i)}>Open</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** A pad to draw a signature with a finger, pen or mouse. */
export function SignaturePad({ onChange, className }: { onChange: (png: string | null) => void; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(false);

  useEffect(() => {
    const c = canvas.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.4; ctx.strokeStyle = '#16151a';
      setInk(false); onChange(null);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  /** The drawing, cropped to the ink, as a PNG data URL. */
  const exportPng = () => {
    const c = canvas.current!, ctx = c.getContext('2d')!;
    const { width: w, height: h } = c;
    const px = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null;
    const pad = 8, out = document.createElement('canvas');
    out.width = Math.min(w, x1 - x0 + pad * 2); out.height = Math.min(h, y1 - y0 + pad * 2);
    out.getContext('2d')!.drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setInk(false); onChange(null);
  };
  return (
    <div className={className}>
      <div className="relative rounded-xl border border-line bg-card">
        <canvas ref={canvas} aria-label="Draw your signature here" role="img"
          className="block w-full h-40 touch-none cursor-crosshair"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e); }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const p = point(e), ctx = canvas.current!.getContext('2d')!;
            ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y);
            ctx.quadraticCurveTo(last.current.x, last.current.y, (last.current.x + p.x) / 2, (last.current.y + p.y) / 2);
            ctx.lineTo(p.x, p.y); ctx.stroke();
            last.current = p;
            if (!ink) setInk(true);
          }}
          onPointerUp={() => { drawing.current = false; last.current = null; onChange(exportPng()); }}
          onPointerLeave={() => { if (drawing.current) { drawing.current = false; last.current = null; onChange(exportPng()); } }} />
        <span className="pointer-events-none absolute left-4 right-4 bottom-9 border-b border-dashed border-line" />
        {!ink && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">Sign here with your finger or mouse</span>}
      </div>
      <button type="button" onClick={clear} className={cx('mt-1.5 text-xs text-muted underline underline-offset-2 hover:text-ink', !ink && 'invisible')}>Clear and sign again</button>
    </div>
  );
}
