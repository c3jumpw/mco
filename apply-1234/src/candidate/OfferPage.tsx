// The candidate's offer: read it, open the attachments, then sign (drawn or typed) or decline.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { offerError, fmtDay, fmtStamp, offerCall, offerTitle, type PublicOffer } from '../lib/offers';
import { OfferDocument, SignaturePad } from './OfferDocument';
import { Button, Input, Modal, Segmented, Spinner, Textarea, Wordmark, cx } from '../ui';

export default function OfferPage() {
  const { token = '' } = useParams();
  const [offer, setOffer] = useState<PublicOffer | null | undefined>(undefined);
  const [err, setErr] = useState('');

  const load = async () => {
    const r = await offerCall<{ offer: PublicOffer }>({ action: 'view', token });
    if (r.ok) setOffer(r.offer); else { setOffer(null); setErr(offerError(r.error)); }
  };
  useEffect(() => { document.title = 'Your offer'; load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const open = async (file: number | 'pdf') => {
    const w = window.open('', '_blank');
    const r = await offerCall<{ url: string }>({ action: 'file', token, file });
    if (r.ok && w) w.location.href = r.url; else { w?.close(); setErr(offerError(r.error)); }
  };

  if (offer === undefined) return <Shell><div className="py-24 grid place-items-center"><Spinner /></div></Shell>;
  if (offer === null) {
    return (
      <Shell>
        <div className="py-20 max-w-md">
          <h1 className="font-display text-5xl leading-none">Offer not found.</h1>
          <p className="text-ink-2 mt-4 leading-relaxed">{err}</p>
        </div>
      </Shell>
    );
  }

  const contact = `${offer.manager.name}${offer.manager.email ? ` at ${offer.manager.email}` : ''}${offer.manager.phone ? ` or ${offer.manager.phone}` : ''}`;

  return (
    <Shell company={offer.company}>
      <div className="pt-6 sm:pt-10 pb-28">
        <StatusBanner offer={offer} contact={contact} onPdf={() => open('pdf')} />
        <div className="mt-6">
          <OfferDocument title={offerTitle(offer.summary)} company={offer.company} address={offer.company_address} position={offer.position} candidate={offer.candidate.name}
            date={offer.sent_at} letter={offer.letter} terms={offer.terms} attachments={offer.attachments} onFile={(i) => open(i)} />
        </div>
        {['sent', 'viewed'].includes(offer.status) && !offer.expired && <SignBox offer={offer} token={token} onDone={load} contact={contact} />}
        {err && <p className="mt-4 rounded-xl bg-bad-soft text-bad text-sm px-4 py-3">{err}</p>}
      </div>
    </Shell>
  );
}

function Shell({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line/70 bg-paper/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <span className="font-semibold truncate">{company || ''}</span>
          <span className="text-[12px] text-muted flex items-center gap-1.5 shrink-0">Sent with <Wordmark className="text-[13px]" /></span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6">{children}</main>
    </div>
  );
}

function StatusBanner({ offer, contact, onPdf }: { offer: PublicOffer; contact: string; onPdf: () => void }) {
  if (offer.status === 'signed') {
    return (
      <div className="rounded-2xl bg-good-soft border border-good/20 px-5 py-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="font-semibold text-good">✓ Signed{offer.signer_name ? ` by ${offer.signer_name}` : ''}</p>
          <p className="text-sm text-ink-2 mt-0.5">{fmtStamp(offer.signed_at)}. A copy was emailed to {offer.candidate.email}.</p>
        </div>
        {offer.pdf && <Button variant="primary" onClick={onPdf}>Download signed offer (PDF)</Button>}
      </div>
    );
  }
  if (offer.status === 'declined') return <Note tone="neutral" title="You declined this offer." text={`If that was a mistake, contact ${contact}.`} />;
  if (offer.status === 'withdrawn') return <Note tone="neutral" title="This offer was withdrawn." text={`Questions? Contact ${contact}.`} />;
  if (offer.expired) return <Note tone="warn" title="This offer has expired." text={`If you'd still like to accept, contact ${contact}.`} />;
  return (
    <div>
      <h1 className="font-display text-[44px] sm:text-[60px] leading-[.95]">You have an offer.</h1>
      <p className="text-ink-2 mt-3 leading-relaxed">
        Read the offer, the terms and any attachments below, then sign at the bottom{offer.summary.expires ? <> by <strong className="text-ink font-semibold">{fmtDay(offer.summary.expires)}</strong></> : ''}. Questions? Contact {contact}.
      </p>
    </div>
  );
}

function Note({ tone, title, text }: { tone: 'neutral' | 'warn'; title: string; text: string }) {
  return (
    <div className={cx('rounded-2xl px-5 py-4 border', tone === 'warn' ? 'bg-warn-soft border-warn/20' : 'bg-paper-2 border-line')}>
      <p className={cx('font-semibold', tone === 'warn' && 'text-warn')}>{title}</p>
      <p className="text-sm text-ink-2 mt-0.5">{text}</p>
    </div>
  );
}

function SignBox({ offer, token, onDone, contact }: { offer: PublicOffer; token: string; onDone: () => void; contact: string }) {
  const [name, setName] = useState(offer.candidate.name);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [png, setPng] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');

  const ready = name.trim().length >= 2 && read && consent && (mode === 'type' || !!png);
  const missing = [
    ...(name.trim().length < 2 ? ['your full name'] : []),
    ...(mode === 'draw' && !png ? ['your signature'] : []),
    ...(!read ? ['a tick to confirm you read everything'] : []),
    ...(!consent ? ['a tick to agree to sign electronically'] : []),
  ];

  const sign = async () => {
    setBusy(true); setErr('');
    const r = await offerCall({
      action: 'sign', token, name: name.trim(), read, consent, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      signature: mode === 'draw' ? { kind: 'drawn', png } : { kind: 'typed', text: name.trim() },
    });
    setBusy(false);
    if (r.ok) { window.scrollTo({ top: 0, behavior: 'smooth' }); onDone(); }
    else setErr(offerError(r.error));
  };
  const decline = async () => {
    setBusy(true);
    const r = await offerCall({ action: 'decline', token, reason });
    setBusy(false); setDeclineOpen(false);
    if (r.ok) { window.scrollTo({ top: 0, behavior: 'smooth' }); onDone(); } else setErr(offerError(r.error));
  };

  return (
    <section id="sign" className="mt-6 rounded-2xl bg-card border border-line p-5 sm:p-8">
      <h2 className="font-display text-[34px] leading-none">Sign to accept</h2>
      <p className="text-sm text-muted mt-2">Signing accepts this offer and its terms. You and {offer.manager.name || 'the hiring manager'} will both get the signed copy by email.</p>
      <label className="block mt-5">
        <span className="block text-[13px] font-medium mb-1.5">Your full legal name</span>
        <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-[13px] font-medium">Your signature</span>
          <Segmented size="sm" value={mode} onChange={setMode} options={[{ id: 'draw', label: 'Draw' }, { id: 'type', label: 'Type' }]} />
        </div>
        {mode === 'draw'
          ? <SignaturePad onChange={setPng} />
          : <div className="rounded-xl border border-line bg-card h-40 grid place-items-center px-4"><span className="font-[cursive] italic text-[40px] leading-none text-center break-words" style={{ fontFamily: "'Snell Roundhand','Segoe Script','Brush Script MT',cursive" }}>{name || 'Your name'}</span></div>}
      </div>
      <div className="mt-5 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-ink shrink-0" checked={read} onChange={(e) => setRead(e.target.checked)} />
          <span className="text-sm leading-relaxed text-ink-2">I’ve read the offer, the terms and conditions{offer.attachments.length ? ' and the attachments' : ''}.</span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-ink shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-sm leading-relaxed text-ink-2">I agree to sign electronically. My electronic signature has the same effect as signing by hand. The time, my IP address and my device are recorded with it.</span>
        </label>
      </div>
      {err && <p className="mt-4 rounded-xl bg-bad-soft text-bad text-sm px-4 py-3">{err}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="accent" size="lg" disabled={!ready || busy} onClick={sign}>{busy ? <><Spinner /> Signing</> : 'Sign and accept the offer'}</Button>
        <button className="text-sm text-muted underline underline-offset-2 hover:text-ink" onClick={() => setDeclineOpen(true)}>Decline the offer</button>
      </div>
      {!ready && !busy && <p className="mt-3 text-sm text-muted">To sign, add {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')}.</p>}
      <Modal open={declineOpen} onClose={() => setDeclineOpen(false)} title="Decline this offer?">
        <p className="text-sm text-ink-2">{offer.manager.name || 'The hiring manager'} will be told. You can add a short note if you’d like.</p>
        <Textarea className="mt-3" rows={3} value={reason} placeholder="Optional" onChange={(e) => setReason(e.target.value)} />
        <p className="text-xs text-muted mt-2">Changed your mind later? Contact {contact}.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeclineOpen(false)}>Keep the offer</Button>
          <Button variant="danger" disabled={busy} onClick={decline}>Decline</Button>
        </div>
      </Modal>
    </section>
  );
}
