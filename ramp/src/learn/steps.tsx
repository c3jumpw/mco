// Interactive steps: visuals, pictures, scenarios, drills, flashcards, checklists, click-throughs and real work.
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as RMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { cx } from '../lib/util';
import { Button, Icon, Notice, useToast } from '../ui';
import { ActivityHead, CheckButton, Mark, ResultBar, TONES, pct, shuffled, type StepProps } from './kit';
import { MediaImg } from './media';
import type {
  ChecklistBlock, FlashcardsBlock, HotspotBlock, ImageBlock, MatchBlock, OrderBlock, RealWorkBlock, ScenarioBlock, SortBlock, VisualBlock,
} from './types';

const ICONS = new Set(['home', 'book', 'tasks', 'notes', 'chat', 'folder', 'users', 'userPlus', 'shield', 'lock', 'search', 'send', 'file', 'fileText',
  'upload', 'download', 'eye', 'replay', 'building', 'list', 'chart', 'megaphone', 'lifebuoy', 'sliders', 'pen', 'bell', 'star', 'clock', 'calendar',
  'link', 'copy', 'mail', 'alert', 'info', 'sparkle', 'target', 'key', 'refresh', 'check', 'play', 'history']);
const icon = (name: string | undefined, fallback = 'sparkle') => (name && ICONS.has(name) ? name : fallback);

// ───────── visual ─────────

export function VisualStep({ block: b }: StepProps<VisualBlock>) {
  const items = b.items || [];
  return (
    <div className="flex flex-col gap-6">
      <ActivityHead icon="sparkle" kind="Visual" title={b.title} prompt={b.intro} />
      {b.layout === 'steps' && <StepsVisual items={items} />}
      {b.layout === 'cycle' && <CycleVisual items={items} />}
      {b.layout === 'cards' && <CardsVisual items={items} />}
      {b.layout === 'pillars' && <PillarsVisual items={items} />}
      {b.layout === 'compare' && <CompareVisual items={items} />}
      {b.layout === 'timeline' && <TimelineVisual items={items} />}
      {b.note && <Notice icon="info">{b.note}</Notice>}
    </div>
  );
}

type VItem = VisualBlock['items'][number];
const lines = (s?: string) => (s || '').split('\n').map((l) => l.trim()).filter(Boolean);

function Body({ text, className }: { text?: string; className?: string }) {
  const l = lines(text);
  if (!l.length) return null;
  if (l.length === 1) return <p className={cx('text-[15px] leading-relaxed text-ink-2', className)}>{l[0]}</p>;
  return (
    <ul className={cx('flex flex-col gap-1.5', className)}>
      {l.map((x, i) => <li key={i} className="flex gap-2 text-[15px] leading-snug text-ink-2"><span className="mt-[8px] w-1.5 h-1.5 rounded-full bg-brand shrink-0" />{x.replace(/^[-•]\s*/, '')}</li>)}
    </ul>
  );
}

function StepsVisual({ items }: { items: VItem[] }) {
  return (
    <ol className="relative flex flex-col gap-3">
      <span aria-hidden="true" className="absolute left-[21px] top-6 bottom-6 w-[2px] bg-brand-2" />
      {items.map((it, i) => (
        <li key={i} className="relative flex gap-4 items-start">
          <span className="relative z-10 w-11 h-11 rounded-2xl bg-brand text-white font-display font-bold text-lg flex items-center justify-center shrink-0 shadow-[0_6px_14px_-8px_var(--color-brand)]">{i + 1}</span>
          <div className="flex-1 min-w-0 rounded-2xl bg-card border border-line p-4">
            <p className="font-display font-semibold text-[17px] leading-snug">{it.title}</p>
            <Body text={it.body} className="mt-1" />
            {it.image && <MediaImg src={it.image} alt={it.title} className="mt-3 w-full max-h-64 object-contain rounded-xl bg-bg" />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CycleVisual({ items }: { items: VItem[] }) {
  const n = items.length;
  return (
    <>
      <div className="hidden md:block relative mx-auto w-full max-w-[640px] aspect-square">
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <defs><marker id="cyc-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--color-brand)" /></marker></defs>
          <circle cx="50" cy="50" r="33" fill="none" stroke="var(--color-brand-2)" strokeWidth="1.6" strokeDasharray="1 2.2" />
          {items.map((_, i) => {
            const a0 = ((i + 0.32) / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 0.68) / n) * Math.PI * 2 - Math.PI / 2;
            return <path key={i} d={`M${50 + 33 * Math.cos(a0)} ${50 + 33 * Math.sin(a0)} A33 33 0 0 1 ${50 + 33 * Math.cos(a1)} ${50 + 33 * Math.sin(a1)}`} fill="none" stroke="var(--color-brand)" strokeWidth="1.4" markerEnd="url(#cyc-arrow)" />;
          })}
        </svg>
        <div className="absolute inset-[34%] rounded-full bg-brand-soft flex items-center justify-center text-center p-3">
          <span className="font-display font-bold text-brand-ink text-[15px] leading-tight">Repeat the cycle</span>
        </div>
        {items.map((it, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          return (
            <div key={i} className="absolute w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card border border-line p-3 shadow-sm text-center"
              style={{ left: `${50 + 36 * Math.cos(a)}%`, top: `${50 + 36 * Math.sin(a)}%` }}>
              <span className="inline-flex w-7 h-7 rounded-full bg-brand text-white text-sm font-bold items-center justify-center">{i + 1}</span>
              <p className="font-display font-semibold text-[15px] leading-tight mt-1">{it.title}</p>
              {it.body && <p className="text-[12.5px] leading-snug text-muted mt-1 line-clamp-4">{it.body}</p>}
            </div>
          );
        })}
      </div>
      <div className="md:hidden"><StepsVisual items={[...items, { title: 'Then repeat', body: 'Go round again, deeper each time.' }]} /></div>
    </>
  );
}

function CardsVisual({ items }: { items: VItem[] }) {
  return (
    <div className={cx('grid gap-3', items.length >= 4 ? 'sm:grid-cols-2' : '', items.length === 3 ? 'md:grid-cols-3' : '')}>
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl bg-card border border-line p-4 flex flex-col gap-2">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: TONES[i % TONES.length] }}>
            <Icon name={icon(it.icon)} size={20} strokeWidth={2} />
          </span>
          <p className="font-display font-semibold text-[17px] leading-snug">{it.title}</p>
          <Body text={it.body} />
          {it.image && <MediaImg src={it.image} alt={it.title} className="w-full max-h-48 object-contain rounded-xl bg-bg" />}
        </div>
      ))}
    </div>
  );
}

function PillarsVisual({ items }: { items: VItem[] }) {
  return (
    <div className="flex flex-col gap-0">
      <div className={cx('grid gap-3', items.length === 2 ? 'sm:grid-cols-2' : 'md:grid-cols-3')}>
        {items.map((it, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border border-line bg-card flex flex-col">
            <div className="px-4 py-3 text-white flex items-center gap-2" style={{ background: TONES[i % TONES.length] }}>
              <Icon name={icon(it.icon, 'building')} size={18} /><span className="font-display font-bold text-[17px]">{it.title}</span>
            </div>
            <div className="p-4"><Body text={it.body} /></div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="h-3 mx-2 rounded-b-xl bg-line" />
    </div>
  );
}

function CompareVisual({ items }: { items: VItem[] }) {
  const [a, b] = [items[0], items[1]];
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] items-stretch">
      {[a, b].map((it, i) => it && (
        <Fragment key={i}>
          {i === 1 && <span className="self-center justify-self-center w-10 h-10 rounded-full bg-ink text-white text-sm font-bold flex items-center justify-center">vs</span>}
          <div className={cx('rounded-2xl border p-4 flex flex-col gap-2', i === 0 ? 'bg-brand-soft border-brand/20' : 'bg-card border-line')}>
            <p className="font-display font-bold text-[18px]">{it.title}</p>
            <Body text={it.body} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

const COLS: Record<number, string> = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };

function TimelineVisual({ items }: { items: VItem[] }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="hidden md:block absolute left-4 right-4 top-[22px] h-[3px] rounded-full bg-gradient-to-r from-brand-2 via-brand to-brand-ink" />
      <ol className={cx('grid gap-3', COLS[Math.min(items.length, 4)])}>
        {items.map((it, i) => (
          <li key={i} className="relative flex md:flex-col gap-3 md:gap-2 md:items-center md:text-center">
            <span className="relative z-10 w-11 h-11 rounded-full bg-white border-[3px] border-brand text-brand-ink font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="rounded-2xl bg-card border border-line p-3 flex-1 md:w-full">
              <p className="font-display font-semibold text-[16px] leading-snug">{it.title}</p>
              <Body text={it.body} className="mt-1 text-left" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────── picture ─────────

export function ImageStep({ block: b }: StepProps<ImageBlock>) {
  return (
    <div className="flex flex-col gap-4">
      {b.title && <ActivityHead icon="eye" kind="Picture" title={b.title} />}
      <figure className="flex flex-col gap-2">
        <div className="rounded-2xl border border-line bg-white p-2">
          <MediaImg src={b.src} alt={b.alt} className="w-full max-h-[60vh] object-contain rounded-xl" />
        </div>
        {b.caption && <figcaption className="text-sm text-muted text-center">{b.caption}</figcaption>}
      </figure>
    </div>
  );
}

// ───────── scenario ─────────

const RESULT_UI = {
  best: { label: 'Best move', tone: 'border-good bg-good-soft', icon: 'check', dot: 'bg-good' },
  ok: { label: 'Works, but there’s a better move', tone: 'border-amber bg-warn-soft', icon: 'info', dot: 'bg-amber' },
  poor: { label: 'Not this one', tone: 'border-bad bg-bad-soft', icon: 'x', dot: 'bg-bad' },
} as const;

export function ScenarioStep({ block: b, result, onResult, review }: StepProps<ScenarioBlock>) {
  const order = useMemo(() => shuffled(b.choices, b.title + b.question), [b]);
  const [picked, setPicked] = useState<number[]>([]);
  const pick = (i: number) => {
    if (picked.includes(i)) return;
    if (!picked.length) onResult(b.choices[i]!.result === 'best' ? 100 : b.choices[i]!.result === 'ok' ? 50 : 0);
    setPicked([...picked, i]);
  };
  const showAll = review;
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="chat" kind="Scenario" title={b.title} prompt={b.setup} />
      {b.message && (
        <div className="rounded-2xl border border-line bg-white overflow-hidden">
          <div className="px-4 py-2 bg-[#FAFBFC] border-b border-line-2 flex items-center gap-2 text-[13px] text-muted">
            <Icon name={b.message.channel?.includes('@') ? 'mail' : 'chat'} size={15} />
            <span className="font-semibold text-ink-2">{b.message.channel || 'Message'}</span>
            {b.message.time && <span className="ml-auto">{b.message.time}</span>}
          </div>
          <div className="p-4 flex gap-3">
            <span className="w-10 h-10 rounded-full bg-ink text-white text-sm font-bold flex items-center justify-center shrink-0">{initials(b.message.from)}</span>
            <div className="min-w-0">
              <p className="font-semibold text-[15px]">{b.message.from}</p>
              <p className="text-[16px] leading-relaxed text-ink whitespace-pre-line mt-0.5">{b.message.text}</p>
            </div>
          </div>
        </div>
      )}
      <p className="font-semibold text-[17px]">{b.question}</p>
      <div className="flex flex-col gap-2.5" role="list">
        {order.map((i) => {
          const c = b.choices[i]!;
          const open = showAll || picked.includes(i);
          const ui = RESULT_UI[c.result];
          return (
            <div key={i} role="listitem">
              <button type="button" onClick={() => pick(i)} disabled={review} aria-expanded={open}
                className={cx('w-full text-left rounded-2xl border-2 p-4 transition-colors cursor-pointer', open ? ui.tone : 'border-line bg-white hover:border-brand hover:bg-brand-soft')}>
                <span className="flex items-start gap-3">
                  <span className={cx('mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0', open ? `${ui.dot} border-transparent text-white` : 'border-[#C9CED6]')}>
                    {open && <Icon name={ui.icon} size={13} strokeWidth={2.6} />}
                  </span>
                  <span className="text-[16px] leading-snug">{c.text}</span>
                </span>
                {open && (
                  <span className="block mt-3 pl-9 rise">
                    <span className="block text-[13px] font-bold uppercase tracking-[0.06em]">{ui.label}</span>
                    <span className="block text-[15px] leading-relaxed text-ink-2 mt-0.5">{c.feedback}</span>
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      {!review && picked.length > 0 && result && (
        <p className="text-sm text-muted">{b.choices[picked[0]!]!.result === 'best' ? 'You found the best move first time.' : 'Tap the other choices to see why they work or don’t.'}</p>
      )}
    </div>
  );
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

// ───────── put in order ─────────

export function OrderStep({ block: b, onResult, review }: StepProps<OrderBlock>) {
  const start = useMemo(() => shuffled(b.items, b.title), [b]);
  const [order, setOrder] = useState<number[]>(review ? b.items.map((_, i) => i) : start);
  const [checked, setChecked] = useState(!!review);
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    setOrder(next);
    setChecked(false);
  };
  const right = order.filter((v, i) => v === i).length;
  const check = () => { setChecked(true); onResult(pct(right, order.length)); };
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="list" kind="Put in order" title={b.title} prompt={b.prompt} />
      <p className="text-sm text-muted -mt-2">Drag the cards, or use the arrows, so the first step is at the top.</p>
      <ol className="flex flex-col gap-2">
        {order.map((v, i) => {
          const ok = v === i;
          return (
            <li key={v} draggable={!review}
              onDragStart={(e: DragEvent) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); }}
              onDragEnd={() => setDrag(null)}
              className={cx('flex items-center gap-3 rounded-2xl border-2 bg-white pl-3 pr-1.5 py-2 transition-colors',
                checked ? (ok ? 'border-good bg-good-soft' : 'border-bad/60 bg-bad-soft') : drag === i ? 'border-brand bg-brand-soft opacity-70' : 'border-line',
                !review && 'cursor-grab active:cursor-grabbing')}>
              <span className="w-8 h-8 rounded-lg bg-brand-soft text-brand-ink font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0 text-[15.5px] leading-snug py-1">{b.items[v]}</span>
              {checked && <Mark ok={ok} />}
              {!review && (
                <span className="flex flex-col">
                  <button type="button" aria-label={`Move “${b.items[v]}” up`} disabled={i === 0} onClick={() => move(i, i - 1)}
                    className="w-9 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-chip disabled:opacity-30 cursor-pointer"><Icon name="chevronUp" size={18} /></button>
                  <button type="button" aria-label={`Move “${b.items[v]}” down`} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}
                    className="w-9 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-chip disabled:opacity-30 cursor-pointer"><Icon name="chevronDown" size={18} /></button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!review && (checked
        ? <ResultBar score={pct(right, order.length)} right={right} total={order.length} onRetry={() => { setChecked(false); }} retryLabel="Keep sorting" />
        : <CheckButton onClick={check} />)}
      {checked && right < order.length && !review && <p className="text-sm text-muted">Green cards are in the right place. Move the red ones and check again.</p>}
    </div>
  );
}

// ───────── sort into groups ─────────

export function SortStep({ block: b, onResult, review }: StepProps<SortBlock>) {
  const order = useMemo(() => shuffled(b.items, b.title), [b]);
  const [placed, setPlaced] = useState<Record<number, number>>(() => (review ? Object.fromEntries(b.items.map((it, i) => [i, it.group])) : {}));
  const [sel, setSel] = useState<number | null>(null);
  const [checked, setChecked] = useState(!!review);
  const pool = order.filter((i) => placed[i] == null);
  const put = (item: number, group: number) => { setPlaced((p) => ({ ...p, [item]: group })); setSel(null); setChecked(false); };
  const unplace = (item: number) => { if (review) return; setPlaced((p) => { const n = { ...p }; delete n[item]; return n; }); setChecked(false); };
  const right = b.items.filter((it, i) => placed[i] === it.group).length;
  const check = () => { setChecked(true); onResult(pct(right, b.items.length)); };
  const onDrop = (g: number) => (e: DragEvent) => { e.preventDefault(); const i = Number(e.dataTransfer.getData('text/plain')); if (!Number.isNaN(i)) put(i, g); };
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="sliders" kind="Sort into groups" title={b.title} prompt={b.prompt} />
      {!review && (
        <div className="rounded-2xl bg-bg border border-dashed border-[#C9CED6] p-3 min-h-[64px]">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted mb-2">{pool.length ? `Cards to sort · ${pool.length} left` : 'All sorted'}</p>
          <div className="flex flex-wrap gap-2">
            {pool.map((i) => (
              <button key={i} type="button" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                onClick={() => setSel(sel === i ? null : i)} aria-pressed={sel === i}
                className={cx('min-h-11 px-3.5 py-2 rounded-xl border-2 text-[15px] text-left leading-snug bg-white cursor-grab shadow-sm',
                  sel === i ? 'border-brand ring-4 ring-brand/15' : 'border-line hover:border-brand')}>
                {b.items[i]!.text}
              </button>
            ))}
          </div>
          {sel != null && <p className="text-sm text-brand-ink font-semibold mt-2">Now tap the group it belongs in.</p>}
        </div>
      )}
      <div className={cx('grid gap-3', b.groups.length === 2 ? 'sm:grid-cols-2' : b.groups.length >= 3 ? 'md:grid-cols-3' : '')}>
        {b.groups.map((g, gi) => {
          const here = order.filter((i) => placed[i] === gi);
          return (
            <div key={gi} onDragOver={(e) => e.preventDefault()} onDrop={onDrop(gi)}
              onClick={() => sel != null && put(sel, gi)}
              className={cx('rounded-2xl border-2 bg-card p-3 min-h-[140px] flex flex-col gap-2 transition-colors',
                sel != null ? 'border-brand border-dashed cursor-pointer hover:bg-brand-soft' : 'border-line')}>
              <p className="flex items-center gap-2 font-display font-bold text-[16px]">
                <span className="w-3 h-3 rounded-full" style={{ background: TONES[gi % TONES.length] }} />{g}
                <span className="ml-auto text-xs font-semibold text-muted">{here.length}</span>
              </p>
              {here.map((i) => {
                const it = b.items[i]!;
                const ok = it.group === gi;
                return (
                  <div key={i} className={cx('rounded-xl border px-3 py-2 text-[14.5px] leading-snug', checked ? (ok ? 'border-good/40 bg-good-soft' : 'border-bad/40 bg-bad-soft') : 'border-line bg-white')}>
                    <div className="flex items-start gap-2">
                      <span className="flex-1">{it.text}</span>
                      {checked ? <Mark ok={ok} /> : !review && (
                        <button type="button" aria-label={`Take “${it.text}” out`} onClick={(e) => { e.stopPropagation(); unplace(i); }} className="text-muted hover:text-ink cursor-pointer"><Icon name="x" size={16} /></button>
                      )}
                    </div>
                    {checked && !ok && <p className="text-[13px] text-bad mt-1">Belongs in {b.groups[it.group]}.{it.why ? ` ${it.why}` : ''}</p>}
                    {checked && ok && it.why && <p className="text-[13px] text-ink-2 mt-1">{it.why}</p>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {!review && (checked
        ? <ResultBar score={pct(right, b.items.length)} right={right} total={b.items.length} onRetry={() => { setPlaced(Object.fromEntries(Object.entries(placed).filter(([i, g]) => b.items[Number(i)]!.group === g))); setChecked(false); }} retryLabel="Fix the red ones" />
        : <CheckButton onClick={check} disabled={pool.length > 0} hint={pool.length ? 'Sort every card first.' : undefined} />)}
    </div>
  );
}

// ───────── match pairs ─────────

export function MatchStep({ block: b, onResult, review }: StepProps<MatchBlock>) {
  const rightOrder = useMemo(() => shuffled(b.pairs, b.title + 'r'), [b]);
  const [links, setLinks] = useState<Record<number, number>>(() => (review ? Object.fromEntries(b.pairs.map((_, i) => [i, i])) : {})); // left → right
  const [left, setLeft] = useState<number | null>(null);
  const [checked, setChecked] = useState(!!review);
  const color = (l: number) => TONES[Object.keys(links).map(Number).sort((a, c) => a - c).indexOf(l) % TONES.length];
  const rightTaken = (r: number) => Object.entries(links).find(([, v]) => v === r)?.[0];
  const pickRight = (r: number) => {
    if (review || left == null) return;
    const next = { ...links };
    for (const [k, v] of Object.entries(next)) if (v === r) delete next[Number(k)];
    next[left] = r;
    setLinks(next); setLeft(null); setChecked(false);
  };
  const right = b.pairs.filter((_, i) => links[i] === i).length;
  const all = Object.keys(links).length === b.pairs.length;
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="link" kind="Match pairs" title={b.title} prompt={b.prompt} />
      <p className="text-sm text-muted -mt-2">Tap an item on the left, then its partner on the right.</p>
      <div className="grid grid-cols-2 gap-3 md:gap-6">
        <div className="flex flex-col gap-2">
          {b.pairs.map((p, i) => {
            const linked = links[i] != null;
            return (
              <button key={i} type="button" disabled={review} onClick={() => setLeft(left === i ? null : i)} aria-pressed={left === i}
                className={cx('min-h-14 rounded-2xl border-2 px-3 py-2 text-left text-[15px] leading-snug flex items-center gap-2 bg-white cursor-pointer',
                  left === i ? 'border-brand ring-4 ring-brand/15' : checked ? (links[i] === i ? 'border-good bg-good-soft' : 'border-bad/60 bg-bad-soft') : 'border-line hover:border-brand')}>
                {linked && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color(i) }} />}
                <span className="flex-1">{p.left}</span>
                {checked && <Mark ok={links[i] === i} />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rightOrder.map((r) => {
            const owner = rightTaken(r);
            return (
              <button key={r} type="button" disabled={review} onClick={() => pickRight(r)}
                className={cx('min-h-14 rounded-2xl border-2 px-3 py-2 text-left text-[15px] leading-snug flex items-center gap-2 cursor-pointer',
                  left != null ? 'border-dashed border-brand bg-white hover:bg-brand-soft' : 'border-line bg-[#FAFBFC]')}>
                {owner != null && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color(Number(owner)) }} />}
                <span className="flex-1">{b.pairs[r]!.right}</span>
              </button>
            );
          })}
        </div>
      </div>
      {checked && right < b.pairs.length && !review && (
        <ul className="flex flex-col gap-1 text-sm text-ink-2">
          {b.pairs.map((p, i) => links[i] !== i && <li key={i}><span className="font-semibold">{p.left}</span> goes with “{p.right}”.</li>)}
        </ul>
      )}
      {!review && (checked
        ? <ResultBar score={pct(right, b.pairs.length)} right={right} total={b.pairs.length} onRetry={() => { setLinks(Object.fromEntries(Object.entries(links).filter(([k, v]) => Number(k) === v))); setChecked(false); }} retryLabel="Fix the red ones" />
        : <CheckButton onClick={() => { setChecked(true); onResult(pct(right, b.pairs.length)); }} disabled={!all} hint={all ? undefined : 'Match every item first.'} />)}
    </div>
  );
}

// ───────── flashcards ─────────

export function FlashcardsStep({ block: b, onResult, review }: StepProps<FlashcardsBlock>) {
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set(review ? b.cards.map((_, i) => i) : []));
  const [face, setFace] = useState<Set<number>>(new Set());
  const reported = useRef(false);
  const flip = (i: number) => {
    setFace((f) => { const n = new Set(f); if (n.has(i)) n.delete(i); else n.add(i); return n; });
    setFlipped((f) => new Set(f).add(i));
  };
  useEffect(() => {
    if (!review && !reported.current && flipped.size === b.cards.length) { reported.current = true; onResult(100); }
  }, [flipped, b.cards.length, onResult, review]);
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="replay" kind="Flashcards" title={b.title} prompt={b.intro || 'Say the answer in your head, then tap the card to check.'} />
      <p className="text-sm font-semibold text-muted -mt-2" aria-live="polite">{flipped.size} of {b.cards.length} flipped</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {b.cards.map((c, i) => {
          const back = face.has(i);
          return (
            <button key={i} type="button" onClick={() => flip(i)} aria-label={back ? `${c.front}: ${c.back}` : `${c.front}. Tap to flip.`}
              className="group relative min-h-[150px] [perspective:1000px] cursor-pointer text-left">
              <span className={cx('absolute inset-0 rounded-2xl transition-transform duration-500 [transform-style:preserve-3d]', back && '[transform:rotateY(180deg)]')}>
                <span className="absolute inset-0 rounded-2xl border-2 border-line bg-white p-4 flex flex-col justify-between [backface-visibility:hidden] group-hover:border-brand">
                  <span className="font-display font-bold text-[18px] leading-snug">{c.front}</span>
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted"><Icon name="replay" size={14} />{flipped.has(i) ? 'Tap to flip back' : 'Tap to flip'}</span>
                </span>
                <span className="absolute inset-0 rounded-2xl border-2 border-brand bg-brand-soft p-4 flex items-center [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-auto">
                  <span className="text-[15px] leading-relaxed text-ink">{c.back}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────── checklist ─────────

export function ChecklistStep({ block: b, onResult, review }: StepProps<ChecklistBlock>) {
  const [done, setDone] = useState<Set<number>>(() => new Set(review ? b.items.map((_, i) => i) : []));
  const reported = useRef(false);
  const toggle = (i: number) => { if (review) return; setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n; }); };
  useEffect(() => { if (!review && !reported.current && done.size === b.items.length) { reported.current = true; onResult(100); } }, [done, b.items.length, onResult, review]);
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="tasks" kind="Checklist" title={b.title} prompt={b.intro} />
      <div className="rounded-2xl bg-card border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line-2 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-chip overflow-hidden"><div className="h-full bg-good-2 transition-all" style={{ width: `${pct(done.size, b.items.length)}%` }} /></div>
          <span className="text-sm font-semibold text-muted">{done.size}/{b.items.length}</span>
        </div>
        <ul>
          {b.items.map((it, i) => (
            <li key={i} className="border-b border-line-2 last:border-0">
              <button type="button" role="checkbox" aria-checked={done.has(i)} onClick={() => toggle(i)}
                className="w-full flex items-start gap-3 px-4 py-3 min-h-14 text-left cursor-pointer hover:bg-[#FAFBFC]">
                <span className={cx('mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors', done.has(i) ? 'bg-good-2 border-good-2 text-white' : 'border-[#AEB4BF]')}>
                  {done.has(i) && <Icon name="check" size={15} strokeWidth={2.8} />}
                </span>
                <span className={cx('text-[15.5px] leading-snug', done.has(i) && 'text-muted line-through decoration-1')}>{it}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ───────── click-through on a screenshot ─────────

export function HotspotStep({ block: b, onResult, review }: StepProps<HotspotBlock>) {
  const [at, setAt] = useState(review ? b.steps.length : 0);
  const [firstTry, setFirstTry] = useState(0);
  const [miss, setMiss] = useState<{ x: number; y: number } | null>(null);
  const [misses, setMisses] = useState(0);
  const done = at >= b.steps.length;
  const s = b.steps[at];
  const click = (e: RMouseEvent<HTMLDivElement>) => {
    if (done || !s) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
      const ft = firstTry + (misses === 0 ? 1 : 0);
      setFirstTry(ft); setMiss(null); setMisses(0);
      const next = at + 1;
      setAt(next);
      if (next >= b.steps.length) onResult(pct(ft, b.steps.length));
    } else { setMiss({ x, y }); setMisses((m) => m + 1); }
  };
  return (
    <div className="flex flex-col gap-4">
      <ActivityHead icon="target" kind="Click-through" title={b.title} prompt={b.intro} />
      <div className={cx('rounded-2xl border-2 p-3 flex items-start gap-3', done ? 'border-good/40 bg-good-soft' : 'border-brand/30 bg-brand-soft')} aria-live="polite">
        <span className={cx('w-8 h-8 rounded-lg text-white font-bold flex items-center justify-center shrink-0', done ? 'bg-good' : 'bg-brand')}>{done ? <Icon name="check" size={16} strokeWidth={2.6} /> : at + 1}</span>
        <span className="text-[16px] leading-snug pt-1">
          {done ? `Done. ${firstTry} of ${b.steps.length} found on the first click.` : s?.prompt}
          {!done && misses > 0 && <span className="block text-sm text-bad mt-1">Not there. {misses >= 2 && s?.tip ? s.tip : 'Look again and try another spot.'}</span>}
        </span>
        {!done && <span className="ml-auto text-sm text-muted shrink-0 pt-1">{at + 1} of {b.steps.length}</span>}
      </div>
      <div className="relative rounded-2xl overflow-hidden border border-line bg-white cursor-crosshair select-none" onClick={click}>
        <MediaImg src={b.image} alt={b.title} className="block w-full" />
        {b.steps.slice(0, at).map((st, i) => (
          <span key={i} className="absolute rounded-lg border-2 border-good bg-good/10 pointer-events-none" style={{ left: `${st.x}%`, top: `${st.y}%`, width: `${st.w}%`, height: `${st.h}%` }}>
            <span className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-good text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
          </span>
        ))}
        {!done && s && misses >= 2 && <span className="absolute rounded-lg pulse-ring pointer-events-none" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }} />}
        {miss && <span className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-bad bg-bad/15 pointer-events-none flex items-center justify-center text-bad" style={{ left: `${miss.x}%`, top: `${miss.y}%` }}><Icon name="x" size={16} strokeWidth={2.6} /></span>}
      </div>
      {done && !review && <Button className="self-start" icon="replay" onClick={() => { setAt(0); setFirstTry(0); setMisses(0); setMiss(null); }}>Practise again</Button>}
    </div>
  );
}

// ───────── real work in RAMP ─────────

export function RealWorkStep({ block: b, result, onResult, preview, review }: StepProps<RealWorkBlock>) {
  const { me } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const done = !!result?.done || review;
  const label = b.action === 'task' ? 'Add it to my tasks' : b.action === 'note' ? 'Create the notebook page' : 'Copy the message';
  async function act() {
    if (preview) { toast('Preview: nothing was created.', 'ok'); onResult(100); return; }
    setBusy(true);
    try {
      if (b.action === 'task' && b.task) {
        const due = b.task.due_days != null ? new Date(Date.now() + b.task.due_days * 86400000).toISOString().slice(0, 10) : null;
        const { error } = await supabase.from('ramp_tasks').insert({ member_id: me.id, created_by: me.id, status: 'todo', title: b.task.title.slice(0, 200), notes: b.task.notes || '', due_date: due });
        if (error) throw error;
        setMade('/tasks');
      } else if (b.action === 'note' && b.note) {
        const { data, error } = await supabase.from('ramp_pages').insert({ member_id: me.id, title: b.note.title.slice(0, 200), body: b.note.body }).select('id').single();
        if (error) throw error;
        setMade(`/notes/${(data as { id: string }).id}`);
      } else if (b.action === 'message' && b.message) {
        await navigator.clipboard.writeText(b.message.text);
        setMade('/chat');
      }
      onResult(100);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally { setBusy(false); }
  }
  const actIcon = b.action === 'task' ? 'tasks' : b.action === 'note' ? 'notes' : 'chat';
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon={actIcon} kind="Do it in RAMP" title={b.title} prompt={b.body} />
      <div className="rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft p-4 flex flex-col gap-3">
        {b.action === 'task' && b.task && <Preview label="Task" title={b.task.title} body={b.task.notes} extra={b.task.due_days != null ? `Due in ${b.task.due_days} day${b.task.due_days === 1 ? '' : 's'}` : undefined} />}
        {b.action === 'note' && b.note && <Preview label="Notebook page" title={b.note.title} body={b.note.body} />}
        {b.action === 'message' && b.message && <Preview label="Message" title="" body={b.message.text} />}
        <div className="flex flex-wrap items-center gap-3">
          {done
            ? <span className="inline-flex items-center gap-2 font-semibold text-good"><Icon name="check" size={18} strokeWidth={2.4} />Done{made && <Link to={made} className="font-semibold text-brand-ink">Open it</Link>}</span>
            : <Button variant="primary" icon={actIcon} loading={busy} onClick={act}>{label}</Button>}
          {b.action === 'message' && !done && <span className="text-sm text-muted">Then paste it to your mentor in Chat.</span>}
        </div>
      </div>
    </div>
  );
}

function Preview({ label, title, body, extra }: { label: string; title: string; body?: string; extra?: string }) {
  return (
    <div className="rounded-xl bg-white border border-line p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}{extra ? ` · ${extra}` : ''}</p>
      {title && <p className="font-semibold text-[15.5px] mt-0.5">{title}</p>}
      {body && <p className="text-[14px] text-ink-2 whitespace-pre-line mt-1 max-h-40 overflow-auto">{body}</p>}
    </div>
  );
}
