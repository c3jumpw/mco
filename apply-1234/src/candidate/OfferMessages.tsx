// Messages between the candidate and the hiring team, on the candidate's offer page.
import { useEffect, useRef, useState } from 'react';
import { offerCall, offerError, type PublicChat } from '../lib/offers';
import { Button, Spinner, Textarea, cx } from '../ui';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function OfferMessages({ token, company, manager, email, initial }: { token: string; company: string; manager: string; email: string; initial: PublicChat[] }) {
  const [list, setList] = useState<PublicChat[]>(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setList(initial); }, [initial]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [list.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setErr('');
    const r = await offerCall<{ messages: PublicChat[] }>({ action: 'message', token, body });
    setBusy(false);
    if (r.ok) { setList(r.messages); setText(''); setSent(true); } else setErr(offerError(r.error));
  };

  return (
    <section id="messages" className="mt-6 rounded-2xl bg-card border border-line p-5 sm:p-8 scroll-mt-20">
      <h2 className="font-display text-[34px] leading-none">Questions?</h2>
      <p className="text-sm text-muted mt-2">Message {company} here. {manager ? `${manager} and the hiring team` : 'The hiring team'} will see it, and you’ll get an email at {email} when they reply.</p>
      {list.length > 0 && (
        <div ref={box} className="mt-5 max-h-[420px] overflow-y-auto space-y-3 pr-1" aria-live="polite">
          {list.map((m) => (
            <div key={m.id} className={cx('flex', m.from === 'you' ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[85%] rounded-2xl px-4 py-2.5', m.from === 'you' ? 'bg-ink text-white rounded-br-md' : 'bg-paper-2 text-ink rounded-bl-md')}>
                <p className={cx('text-[12px] mb-0.5', m.from === 'you' ? 'text-white/70' : 'text-muted')}>{m.from === 'you' ? 'You' : m.name} · {when(m.at)}</p>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <label className="block mt-5">
        <span className="sr-only">Your message</span>
        <Textarea rows={3} maxLength={5000} value={text} placeholder={`Write to ${company}…`} onChange={(e) => { setText(e.target.value); setSent(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
      </label>
      {err && <p className="mt-3 rounded-xl bg-bad-soft text-bad text-sm px-4 py-3">{err}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy || !text.trim()} onClick={send}>{busy ? <><Spinner /> Sending</> : 'Send message'}</Button>
        {sent && <span className="text-sm text-good">Sent. We’ll email you when they reply.</span>}
      </div>
    </section>
  );
}
