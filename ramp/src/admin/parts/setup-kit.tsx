// Shared building blocks for the admin setup pages (organization, roles, flow, documents, training, assign).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '../../lib/util';
import type { Block, Module, Template } from '../../lib/types';
import { Button, Chip, IconButton, Input, useConfirm } from '../../ui';

export const ADMIN_BACK = { to: '/admin', label: 'Admin' };

/** Swap an item with its neighbour. Returns the same array when the move is out of range. */
export function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
  const out = list.slice();
  const a = out[i]!;
  out[i] = out[j]!;
  out[j] = a;
  return out;
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ───────── “[placeholder]” detection ─────────

/** Bracketed placeholders like “[Your company story]” left in starter content. */
export function placeholdersIn(texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    if (!t || !t.includes('[')) continue;
    for (const m of t.match(/\[[^\]\n]*\]?/g) || []) found.add(m.length > 70 ? m.slice(0, 67) + '…]' : m);
  }
  return [...found];
}

export function templateTexts(t: Pick<Template, 'title' | 'description' | 'fields'>): string[] {
  const out = [t.title, t.description];
  for (const f of t.fields || []) out.push(f.label, f.help || '', ...(f.options || []));
  return out;
}

export function blockTexts(b: Block): string[] {
  switch (b.type) {
    case 'slides': return b.slides.flatMap((s) => [s.title, s.body]);
    case 'reading': return [b.title, b.body];
    case 'video': return [b.caption || ''];
    case 'quiz': return b.questions.flatMap((qq) => [qq.q, qq.explain || '', ...qq.options]);
    case 'assignment': return [b.prompt];
    case 'form': return [b.note || ''];
    default: return [];
  }
}

export function moduleTexts(m: Pick<Module, 'title' | 'summary' | 'objectives' | 'blocks'>): string[] {
  return [m.title, m.summary, ...(m.objectives || []), ...(m.blocks || []).flatMap(blockTexts)];
}

// ───────── brand color helpers ─────────

export const HEX_RE = /^#[0-9a-f]{6}$/i;

/** CSS variables that re-tint the theme's brand tokens inside one element (for live previews). */
export function brandVars(color: string): CSSProperties {
  const c = HEX_RE.test(color) ? color : '#4338CA';
  return {
    '--brand': c,
    '--color-brand': c,
    '--color-brand-ink': `color-mix(in oklab, ${c} 82%, black)`,
    '--color-brand-soft': `color-mix(in oklab, ${c} 9%, white)`,
    '--color-brand-2': `color-mix(in oklab, ${c} 16%, white)`,
  } as CSSProperties;
}

/** Contrast ratio of white text on a hex color (WCAG). */
export function contrastWithWhite(hex: string): number {
  if (!HEX_RE.test(hex)) return 21;
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return 1.05 / (lum + 0.05);
}

// ───────── small UI pieces ─────────

export function StatusChip({ status }: { status: 'draft' | 'published' }) {
  return status === 'published' ? <Chip tone="good" icon="check">Published</Chip> : <Chip>Draft</Chip>;
}

export function MoveButtons({ index, count, onMove, what, disabled }: { index: number; count: number; onMove: (dir: -1 | 1) => void; what: string; disabled?: boolean }) {
  return (
    <>
      <IconButton icon="chevronUp" label={`Move ${what} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)} />
      <IconButton icon="chevronDown" label={`Move ${what} down`} disabled={disabled || index >= count - 1} onClick={() => onMove(1)} />
    </>
  );
}

/** Section heading inside a card, with an optional action on the right. */
export function SectionHead({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-56">
        <h2 id={id} className="font-display text-lg font-semibold leading-snug">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Editable list of short strings (objectives, choice options). */
export function ListEditor({ items, onChange, label, placeholder, addLabel = 'Add', empty, maxLength = 200 }: {
  items: string[]; onChange: (items: string[]) => void; label: string; placeholder?: string; addLabel?: string; empty?: ReactNode; maxLength?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && empty && <p className="text-sm text-muted">{empty}</p>}
      {items.length > 0 && (
        <ol className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1">
              <span className="hidden sm:inline-flex w-7 justify-center text-sm font-bold text-muted shrink-0" aria-hidden="true">{i + 1}</span>
              <Input aria-label={`${label} ${i + 1}`} value={it} maxLength={maxLength} className="flex-1 min-w-[180px]"
                onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
              <span className="flex ml-auto">
                <MoveButtons index={i} count={items.length} what={`${label.toLowerCase()} ${i + 1}`} onMove={(d) => onChange(move(items, i, d))} />
                <IconButton icon="trash" label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} />
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <Input aria-label={`New ${label.toLowerCase()}`} value={draft} placeholder={placeholder} maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button onClick={add} icon="plus" disabled={!draft.trim()}>{addLabel}</Button>
      </div>
    </div>
  );
}

/**
 * Sticky bottom bar for long editors: says whether there are unsaved changes and holds the actions.
 * Sits above the phone bottom navigation.
 */
export function SaveBar({ dirty, saving, children, note }: { dirty: boolean; saving?: boolean; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="sticky z-20 bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-white border border-line rounded-2xl shadow-[0_8px_30px_rgba(17,24,39,.12)] px-4 py-3">
        <span role="status" className="flex items-center gap-2 text-sm font-semibold text-ink-2 min-w-0 mr-auto">
          <span aria-hidden="true" className={cx('w-2.5 h-2.5 rounded-full shrink-0', saving ? 'bg-brand' : dirty ? 'bg-amber' : 'bg-good-2')} />
          <span className="truncate">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : note || 'All changes saved'}</span>
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">{children}</div>
      </div>
    </div>
  );
}

/**
 * Warn before leaving with unsaved changes: closing the tab (browser prompt) or following an in-app link
 * (our own confirm dialog). Render the returned `dialog`. Call `allowLeave()` before navigating on purpose.
 */
export function useLeaveGuard(dirty: boolean) {
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypass = useRef(false);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current || bypass.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || bypass.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      confirm({
        title: 'Leave without saving?',
        body: 'You have changes that aren’t saved yet. If you leave this page now, they’ll be lost.',
        action: 'Leave without saving',
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        bypass.current = true;
        navigate(url.pathname + url.search + url.hash);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [confirm, navigate]);

  return { dialog, allowLeave: () => { bypass.current = true; } };
}

/** Like Field, but for a group of several controls (a `label` may only wrap one). */
export function Group({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={typeof label === 'string' ? label : undefined} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted leading-relaxed">{hint}</span>}
      {error && <span className="text-xs font-semibold text-bad">{error}</span>}
    </div>
  );
}

/** Row of stats-style counters used in list pages. */
export function MetaLine({ parts, className }: { parts: (ReactNode | false | null | undefined | '')[]; className?: string }) {
  const shown = parts.filter(Boolean);
  if (!shown.length) return null;
  return (
    <span className={cx('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted', className)}>
      {shown.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">{i > 0 && <span aria-hidden="true">·</span>}{p}</span>
      ))}
    </span>
  );
}
