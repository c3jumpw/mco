// Shared bits for the learner journey: Welcome, Home, Training, the module player and Practice.
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AssignKind, PlanItem } from '../../lib/plan';
import { PROGRESS_STATUS, cx, daysUntil, dueLabel, fmtDate, plural } from '../../lib/util';
import { Button, Chip, Icon, Logo, Progress, Sheet } from '../../ui';

// ───────── local storage (drafts, resume points) ─────────

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or storage full: drafts just aren't kept */ }
  },
  del(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/** Only allow in-app paths for ?return= so the link can't send people off-site. */
export function safeReturn(p: string | null | undefined, fallback = '/') {
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return fallback;
  return p;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const KIND_LABEL: Record<AssignKind, string> = {
  required: 'Required',
  role: 'Role track',
  continued: 'Continued training',
  optional: 'Optional',
};

export function isOverdue(item: PlanItem) {
  return !!item.due && item.status !== 'completed' && item.status !== 'submitted' && (daysUntil(item.due) ?? 0) < 0;
}

export function StatusChip({ status }: { status: PlanItem['status'] }) {
  const s = PROGRESS_STATUS[status];
  const icon = status === 'completed' ? 'check' : status === 'submitted' ? 'clock' : status === 'returned' ? 'alert' : undefined;
  return <Chip tone={s.tone} icon={icon}>{s.label}</Chip>;
}

/** Due label for a plan item, red when overdue. Nothing when there's no due date or it's done. */
export function DueText({ item, className }: { item: PlanItem; className?: string }) {
  if (!item.due || item.status === 'completed' || item.status === 'submitted') return null;
  const late = isOverdue(item);
  return (
    <span className={cx('inline-flex items-center gap-1 text-[13px] font-semibold', late ? 'text-bad' : 'text-muted', className)}>
      <Icon name={late ? 'alert' : 'calendar'} size={14} />{dueLabel(item.due)}
    </span>
  );
}

/** Primary action wording for a module, from where the person is with it. */
export function ctaFor(item: PlanItem) {
  if (item.status === 'returned') return 'Fix and resend';
  if (item.status === 'in_progress') return 'Continue';
  if (item.status === 'completed' || item.status === 'submitted') return 'Review';
  return 'Start';
}

// ───────── text with "Label: text" lines (slides, intros) ─────────

const LABEL_RE = /^([^:]{1,48}):\s+(.+)$/;

function LabelLine({ line }: { line: string }) {
  const m = line.match(LABEL_RE);
  if (!m) return <>{line}</>;
  return <><strong className="font-semibold text-ink">{m[1]}:</strong> {m[2]}</>;
}

/** One line becomes a paragraph; several become a list. Lines like "Label: text" get a bold label. */
export function Lines({ text, className }: { text: string; className?: string }) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (lines.length === 1) return <p className={cx('text-[16px] leading-relaxed text-ink-2', className)}><LabelLine line={lines[0]!} /></p>;
  return (
    <ul className={cx('flex flex-col gap-2.5', className)}>
      {lines.map((l, i) => (
        <li key={i} className="flex gap-3 text-[16px] leading-relaxed text-ink-2">
          <span aria-hidden="true" className="mt-[9px] w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
          <span className="min-w-0"><LabelLine line={l} /></span>
        </li>
      ))}
    </ul>
  );
}

export function Paragraphs({ text, className }: { text: string; className?: string }) {
  const parts = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {parts.map((p, i) => <p key={i} className="text-[16px] leading-relaxed text-ink-2">{p}</p>)}
    </div>
  );
}

// ───────── progress summary ─────────

export function ProgressSummary({ summary, title = 'Your training', action, compact, children }: {
  summary: { total: number; done: number; waiting: number; overdue: number; pct: number };
  title?: string; action?: ReactNode; compact?: boolean; children?: ReactNode;
}) {
  const { total, done, waiting, overdue, pct } = summary;
  return (
    <div className={cx('bg-card border border-line rounded-2xl flex flex-col gap-3', compact ? 'p-4' : 'p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">{title}</p>
          <p className="font-display text-[30px] leading-tight font-bold">{pct}%<span className="sr-only"> complete</span></p>
        </div>
        {action}
      </div>
      <Progress value={pct} tone={pct === 100 ? 'good' : 'brand'} label="Training progress" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        <span><strong className="text-ink">{done}</strong> of {plural(total, 'module')} complete</span>
        {waiting > 0 && <span className="text-warn font-semibold">{waiting} waiting for review</span>}
        {overdue > 0 && <span className="text-bad font-semibold">{overdue} overdue</span>}
      </div>
      {children}
    </div>
  );
}

// ───────── certificate ─────────

const PRINT_CSS = `
@media print {
  @page { size: landscape; margin: 12mm; }
  html, body { background: #fff !important; min-height: 0 !important; height: auto !important; }
  body * { visibility: hidden !important; }
  #ramp-certificate, #ramp-certificate * { visibility: visible !important; }
  body *:not(:has(#ramp-certificate)):not(#ramp-certificate):not(#ramp-certificate *) { display: none !important; }
  *:has(#ramp-certificate) { min-height: 0 !important; height: auto !important; max-height: none !important; overflow: visible !important; }
  #ramp-certificate { position: fixed !important; inset: 0 !important; margin: 0 !important; box-shadow: none !important;
    display: flex !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export function CertificateSheet({ open, onClose, person, module, date, org }: {
  open: boolean; onClose: () => void; person: string; module: string; date: string | null; org: string;
}) {
  const when = date ? fmtDate(date, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return (
    <Sheet open={open} onClose={onClose} title="Certificate" wide
      subtitle="Print it, or choose “Save as PDF” in the print dialog to keep a copy."
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" icon="download" onClick={() => window.print()}>Print</Button></>}>
      <style>{PRINT_CSS}</style>
      <div id="ramp-certificate" className="relative flex flex-col items-center justify-center text-center gap-3 bg-white rounded-2xl border-2 border-brand-2 px-6 py-10 md:px-12 md:py-14">
        <div aria-hidden="true" className="absolute inset-2.5 rounded-xl border border-line pointer-events-none" />
        <Logo size={44} />
        <p className="text-xs font-bold tracking-[0.18em] uppercase text-brand-ink">{org}</p>
        <h3 className="font-display text-[28px] md:text-[34px] leading-tight font-bold">Certificate of completion</h3>
        <p className="text-[15px] text-muted mt-2">This certifies that</p>
        <p className="font-display text-[28px] md:text-[36px] leading-tight font-bold px-4 pb-2 border-b-2 border-line max-w-full break-words">{person}</p>
        <p className="text-[15px] text-muted">has completed the training module</p>
        <p className="font-display text-xl md:text-2xl font-semibold text-brand-ink max-w-full break-words">{module}</p>
        <div className="mt-8 grid grid-cols-2 gap-8 w-full max-w-md text-sm">
          <div className="flex flex-col gap-1 border-t border-line pt-2">
            <span className="text-muted">Date</span>
            <span className="font-semibold">{when || '—'}</span>
          </div>
          <div className="flex flex-col gap-1 border-t border-line pt-2">
            <span className="text-muted">Issued by</span>
            <span className="font-semibold">{org}</span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ───────── misc ─────────

/** Run `fn` when the tab regains focus or becomes visible again (e.g. after coming back from another screen or app). */
export function useOnReturn(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') ref.current(); };
    window.addEventListener('focus', on);
    document.addEventListener('visibilitychange', on);
    return () => { window.removeEventListener('focus', on); document.removeEventListener('visibilitychange', on); };
  }, []);
}

/** Section heading with an optional "see all" link, used on Home and Training. */
export function SectionTitle({ title, sub, to, linkLabel }: { title: string; sub?: string; to?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold leading-snug">{title}</h2>
        {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
      </div>
      {to && (
        <Link to={to} className="inline-flex items-center gap-1 min-h-11 px-1 text-sm font-semibold text-brand-ink no-underline shrink-0">
          {linkLabel || 'See all'}<Icon name="chevronRight" size={16} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
