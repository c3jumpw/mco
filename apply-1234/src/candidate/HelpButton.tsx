import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { browserLabel, notify } from '../lib/files';
import { Button, Field, Input, Modal, Spinner, Textarea, cx } from '../ui';

type Kind = 'bug' | 'question' | 'other';
const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'bug', label: "Something isn't working", hint: 'What happened, and what did you expect? We attach your browser and the step you were on.' },
  { id: 'question', label: 'Question about the role', hint: 'Ask anything about the job or the activity.' },
  { id: 'other', label: 'Something else', hint: 'Anything else you want the hiring team to know.' },
];

export default function HelpButton({ jobId, visitor, step, name, email, lastError, preview }:
  { jobId: string; visitor: string; step: string; name?: string; email?: string; lastError?: string; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [body, setBody] = useState('');
  const [who, setWho] = useState(name || '');
  const [mail, setMail] = useState(email || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const show = () => {
    setOpen(true);
    setSent(false);
    setErr('');
    if (!who && name) setWho(name);
    if (!mail && email) setMail(email);
  };

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.trim());
  const ready = body.trim().length >= 5 && emailOk;

  const send = async () => {
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('hiring_contact', {
      p_job: jobId, p_visitor: visitor, p_kind: kind, p_name: who, p_email: mail, p_body: body,
      p_context: {
        step,
        browser: browserLabel(),
        ua: navigator.userAgent.slice(0, 300),
        screen: `${window.innerWidth}x${window.innerHeight}`,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        page: window.location.pathname,
        ...(lastError ? { last_error: lastError } : {}),
        ...(preview ? { preview: true } : {}),
      },
    });
    setBusy(false);
    const res = data as { ok: boolean; id?: string; error?: string } | null;
    if (error || !res?.ok) {
      setErr(res?.error === 'rate'
        ? "You've sent a few messages already. We'll get back to you soon."
        : res?.error === 'email' ? 'Please check your email address.'
        : 'We couldn’t send that right now. Please try again in a moment.');
      return;
    }
    setSent(true);
    setBody('');
    if (res.id) notify({ message_id: res.id, visitor_id: visitor });
  };

  const current = KINDS.find((k) => k.id === kind)!;
  return (
    <>
      <button onClick={show} aria-label="Need help?"
        className="fixed z-30 right-3 sm:right-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] inline-flex items-center gap-2 h-10 sm:h-11 pl-2.5 pr-3.5 sm:pl-3 sm:pr-4 rounded-full bg-card/95 backdrop-blur border border-line shadow-lg shadow-ink/5 text-sm font-medium hover:border-ink/30 transition">
        <span className="grid place-items-center h-6 w-6 rounded-full bg-ink text-white text-[13px] font-semibold">?</span>
        <span className="sm:hidden">Help</span><span className="hidden sm:inline">Need help?</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={sent ? 'Message sent' : 'Contact the hiring team'}>
        {sent ? (
          <div>
            <p className="leading-relaxed">Thanks. Your message reached the hiring team, and we'll reply to <strong>{mail}</strong>.</p>
            <p className="text-sm text-muted mt-2">Your progress on this page is saved, so you can carry on.</p>
            <div className="mt-6 flex gap-2">
              <Button variant="primary" onClick={() => setOpen(false)}>Back to the activity</Button>
              <Button variant="ghost" onClick={() => setSent(false)}>Send another</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              {KINDS.map((k) => (
                <button key={k.id} type="button" onClick={() => setKind(k.id)}
                  className={cx('text-left rounded-xl border px-4 py-3 text-sm transition',
                    kind === k.id ? 'border-ink bg-paper-2 font-medium' : 'border-line hover:border-ink/30')}>
                  {k.label}
                </button>
              ))}
            </div>
            <Field label="Message" hint={current.hint}>
              <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your name"><Input autoComplete="name" value={who} onChange={(e) => setWho(e.target.value)} /></Field>
              <Field label="Email for our reply"><Input type="email" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} /></Field>
            </div>
            {err && <p className="rounded-xl bg-bad-soft text-bad text-sm px-4 py-3">{err}</p>}
            <div className="flex items-center gap-3">
              <Button variant="primary" disabled={!ready || busy} onClick={send}>{busy ? <><Spinner /> Sending</> : 'Send message'}</Button>
              {!ready && <span className="text-xs text-muted">{body.trim().length < 5 ? 'Write a short message.' : 'Add your email so we can reply.'}</span>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
