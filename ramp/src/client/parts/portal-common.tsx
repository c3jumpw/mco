// Shared bits for the client portal. Client contacts see bill rates for their own account, never pay rates.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { REQUEST_KIND, cx, fmtDate } from '../../lib/util';
import type { ClientPortal, ClientRequest } from '../../lib/types';
import { Button, Field, Icon, Notice, Pills, Select, Sheet, Textarea, useToast } from '../../ui';
import { ScoreButtons } from '../../pages/parts/work-common';

export type PortalPlacement = ClientPortal['placements'][number];
export type PortalTimesheet = ClientPortal['timesheets'][number];

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** “Nov 1 – Nov 30, 2026” */
export function invoicePeriod(a: string, b: string) {
  return `${fmtDate(a)} – ${fmtDate(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export const first = (name: string) => (name || '').trim().split(/\s+/)[0] || name;

/** A link to an outside page (Stripe, PDFs), styled like a button. Opens in a new tab. */
export function ExternalButton({ href, children, variant = 'primary', size = 'md', icon, className }: {
  href: string; children: ReactNode; variant?: 'primary' | 'secondary'; size?: 'sm' | 'md'; icon?: string; className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={cx('inline-flex items-center justify-center font-semibold whitespace-nowrap no-underline transition-colors',
        variant === 'primary' ? 'bg-brand text-white hover:bg-brand-ink border border-transparent' : 'bg-white text-ink border border-[#C9CED6] hover:bg-chip',
        size === 'sm' ? 'min-h-10 px-3 text-sm rounded-[10px] gap-1.5' : 'min-h-11 px-4 text-[15px] rounded-xl gap-2', className)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export const REQUEST_STATUS: Record<ClientRequest['status'], { label: string; tone: 'brand' | 'warn' | 'good' }> = {
  open: { label: 'Received', tone: 'brand' },
  in_progress: { label: 'In progress', tone: 'warn' },
  done: { label: 'Resolved', tone: 'good' },
};

// ───────── feedback ─────────

export function FeedbackSheet({ placement, onClose, onDone }: { placement: PortalPlacement | null; onClose: () => void; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [score, setScore] = useState<number | null>(null);
  const [went, setWent] = useState('');
  const [improve, setImprove] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (placement) { setScore(null); setWent(''); setImprove(''); setErr(''); } }, [placement]);
  const name = placement ? first(placement.va.name) : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!placement) return;
    if (!score) { setErr(`Pick a score from 1 to 5 for how ${name} is doing.`); return; }
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.rpc('ramp_client_feedback', { p_placement: placement.id, p_score: score, p_went_well: went.trim(), p_improve: improve.trim() });
      if (error) throw error;
      toast(`Thank you. We’ve shared your feedback with ${placement.coach.name || 'our team'}.`);
      onClose();
      await onDone();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!placement} onClose={onClose} title={`How is ${name} doing?`}
      subtitle="Your feedback goes to your coach, who uses it in their next session with your assistant."
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="feedback-form" loading={busy} icon="send">Send feedback</Button>
      </>}>
      <form id="feedback-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">Overall <span className="text-bad" aria-hidden="true">*</span></span>
          <ScoreButtons value={score} onChange={(n) => { setScore(n); setErr(''); }} label={`Score for ${name} from 1 to 5`} />
        </div>
        <Field label="What’s going well">
          <Textarea rows={3} maxLength={4000} value={went} onChange={(e) => setWent(e.target.value)} placeholder="Wins, strengths, things to keep doing" />
        </Field>
        <Field label="What could be better">
          <Textarea rows={3} maxLength={4000} value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Anything you’d like to see change" />
        </Field>
        {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      </form>
    </Sheet>
  );
}

// ───────── requests ─────────

const KINDS = Object.entries(REQUEST_KIND).map(([value, label]) => ({ value: value as ClientRequest['kind'], label }));
const PROMPTS: Record<ClientRequest['kind'], string> = {
  support: 'What’s going on, and how can we help?',
  replacement: 'Tell us what isn’t working. We’ll talk it through with you before anything changes.',
  hours: 'How many hours a week would you like, and from when?',
  new_va: 'What would the new assistant help with, and how many hours a week?',
  other: 'What do you need?',
};

export function RequestSheet({ open, placements, placementId, onClose, onDone }: {
  open: boolean; placements: PortalPlacement[]; placementId: string | null; onClose: () => void; onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<ClientRequest['kind']>('support');
  const [pid, setPid] = useState<string>('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setKind('support'); setBody(''); setErr('');
    setPid(placementId || (placements.length === 1 ? placements[0]!.id : ''));
  }, [open, placementId, placements]);
  const who = placements.find((p) => p.id === pid);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setErr('Write a short note so we know what you need.'); return; }
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.rpc('ramp_client_request', { p_placement: kind === 'new_va' ? null : pid || null, p_kind: kind, p_body: body.trim() });
      if (error) throw error;
      toast('Request sent. We’ll reply right here on your overview.');
      onClose();
      await onDone();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ask for help" subtitle={who ? `About ${who.va.name}` : 'Our team reads every request.'}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="request-form" loading={busy} icon="send">Send request</Button>
      </>}>
      <form id="request-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">What’s it about?</span>
          <Pills label="What the request is about" options={KINDS} value={kind} onChange={(k) => { setKind(k); setErr(''); }} size="sm" />
        </div>
        {placements.length > 1 && kind !== 'new_va' && (
          <Field label="Which assistant?">
            <Select value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">Not about one assistant</option>
              {placements.map((p) => <option key={p.id} value={p.id}>{p.va.name} · {p.title}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Your message" required error={err || undefined} hint={PROMPTS[kind]}>
          <Textarea rows={5} maxLength={4000} value={body} onChange={(e) => { setBody(e.target.value); setErr(''); }} />
        </Field>
      </form>
    </Sheet>
  );
}
