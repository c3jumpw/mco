// Write an offer, preview it exactly as the candidate will see it, and send it for e-signature.
// Once sent, the same page shows where the offer stands, its audit trail and the signed files.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Application, Job } from '../lib/types';
import {
  CURRENCIES, ccList, DEFAULT_LETTER, DEFAULT_TERMS, EMPLOYMENT_TYPES, EVENT_LABELS, OFFER_STATUS, PAY_PERIODS,
  defaultsToKeep, fillOffer, loadCompanyDefaults, teamFileLink, fmtDay, fmtStamp, missingForSend, offerCall, offerError, offerTitle, offerVars, placeholdersIn, uaLabel,
  type Offer, type OfferDefaults, type OfferFields, type OfferFile,
} from '../lib/offers';
import { fmtSize } from '../lib/files';
import { getApplication, getJob, updateJob } from './data';
import { useRole } from './role';
import { OfferDocument } from '../candidate/OfferDocument';
import { AddFileButton, AttachmentList } from './OfferDefaultsForm';
import { Button, Card, CopyButton, Field, Input, Loading, Modal, Pill, SectionTitle, Segmented, Select, Spinner, Textarea, cx, useToast } from '../ui';

const FILLINS = ['first', 'candidate_name', 'company', 'position', 'start_date', 'pay', 'pay_schedule', 'schedule', 'location', 'provisional_period',
  'employment_type', 'expires', 'manager_name', 'manager_title', 'manager_contact', 'benefits'];

export { slugName, teamFileLink } from '../lib/offers';
export const offerBase = (o: Pick<Offer, 'job_id' | 'application_id' | 'id'>) => `${o.job_id}/${o.application_id}/offers/${o.id}`;

/** Everything recorded about an offer, as a file to keep with the signed PDF. */
export function auditTrail(o: Offer, app: Pick<Application, 'name' | 'email'>) {
  return {
    offer_id: o.id, status: o.status, document_sha256: o.doc_hash,
    candidate: { name: app.name, email: app.email },
    offered_by: { company: o.fields.company, manager: o.fields.manager_name, manager_email: o.fields.manager_email, sent_by: o.sent_by, sent_at: o.sent_at, sent_from: o.sent_meta, cc: o.fields.cc || [] },
    signed: o.signed_at ? { at: o.signed_at, name: o.signer_name, signature: o.signature?.kind, ip: o.signer_meta?.ip, device: uaLabel(o.signer_meta?.ua), user_agent: o.signer_meta?.ua, time_zone: o.signer_meta?.tz } : null,
    declined: o.declined_at ? { at: o.declined_at, reason: o.decline_reason } : null,
    withdrawn_at: o.withdrawn_at, expires: o.fields.expires,
    attachments: o.attachments.map((a) => ({ name: a.name, size: a.size })),
    events: o.events, letter: o.final_letter, terms: o.final_terms,
  };
}
export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function OfferEditor() {
  const { id = '', offerId = '' } = useParams();
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  const [job, setJob] = useState<Job | null>(null);
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined);

  const load = useCallback(async () => {
    const { data } = await supabase.from('hiring_offers').select('*').eq('id', offerId).maybeSingle();
    setOffer((data as Offer) || null);
  }, [offerId]);
  useEffect(() => {
    getApplication(id).then((a) => { setApp(a); if (a) getJob(a.job_id).then(setJob); });
    load();
  }, [id, load]);

  if (app === undefined || offer === undefined) return <Loading />;
  if (!app || !offer || offer.application_id !== app.id) {
    return <p className="py-10 text-muted">This offer wasn’t found. <Link className="underline" to={`/admin/candidates/${id}`}>Back to the candidate</Link></p>;
  }
  return (
    <div className="rise">
      <div className="flex items-center gap-2 text-sm text-muted mb-3 min-w-0">
        <Link to="/admin/candidates" className="hover:text-ink">Candidates</Link><span>/</span>
        <Link to={`/admin/candidates/${app.id}`} className="hover:text-ink truncate">{app.name}</Link><span>/</span>
        <span>Offer</span>
      </div>
      {offer.status === 'draft'
        ? <Draft app={app} job={job} offer={offer} setOffer={setOffer} />
        : <SentOffer app={app} offer={offer} reload={load} />}
    </div>
  );
}

/* ── Writing the offer ── */
function Draft({ app, job, offer, setOffer }: { app: Application; job: Job | null; offer: Offer; setOffer: (o: Offer) => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState<OfferFields>(offer.fields || {});
  const [letter, setLetter] = useState(offer.letter);
  const [terms, setTerms] = useState(offer.terms);
  const [files, setFiles] = useState<OfferFile[]>(offer.attachments || []);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const role = useRole();
  const first = app.name.split(' ')[0];
  const [company, setCompany] = useState<OfferDefaults>({});
  useEffect(() => { loadCompanyDefaults().then(setCompany); }, []);
  // The folded details start open when something there still needs filling in.
  const [detailsOpen, setDetailsOpen] = useState(() => {
    const ff = offer.fields || {};
    return !(ff.company && ff.position && ff.employment_type && ff.manager_name && ff.manager_email);
  });
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [sendOpen, setSendOpen] = useState(false);
  const focused = useRef<'letter' | 'terms'>('letter');
  const areas = { letter: useRef<HTMLTextAreaElement>(null), terms: useRef<HTMLTextAreaElement>(null) };

  // Saves a moment after each change, and straight away when leaving.
  const latest = useRef({ fields: f, letter, terms, attachments: files });
  latest.current = { fields: f, letter, terms, attachments: files };
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    setSaved('saving');
    const { error } = await supabase.from('hiring_offers').update(latest.current).eq('id', offer.id);
    setSaved(error ? 'error' : 'saved');
    if (error) toast(error.message, 'bad');
    return !error;
  }, [offer.id, toast]);
  const touch = () => { dirty.current = true; setSaved('saving'); clearTimeout(timer.current); timer.current = setTimeout(flush, 800); };
  useEffect(() => () => { flush(); }, [flush]);

  const set = (k: keyof OfferFields, v: string) => { setF((x) => ({ ...x, [k]: v })); touch(); };
  const vars = useMemo(() => offerVars(f, app), [f, app]);
  const filledLetter = fillOffer(letter, vars), filledTerms = fillOffer(terms, vars);
  const missing = missingForSend(f, letter, terms);
  const notes = [...new Set([...placeholdersIn(letter), ...placeholdersIn(terms)])];

  const insert = (token: string) => {
    const el = areas[focused.current].current;
    const text = `{${token}}`;
    const cur = focused.current === 'letter' ? letter : terms;
    const at = el ? el.selectionStart : cur.length;
    const next = cur.slice(0, at) + text + cur.slice(el ? el.selectionEnd : at);
    (focused.current === 'letter' ? setLetter : setTerms)(next);
    touch();
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + text.length, at + text.length); });
  };

  const discard = async () => {
    if (!confirm('Delete this draft offer?')) return;
    clearTimeout(timer.current); dirty.current = false;
    const { error } = await supabase.from('hiring_offers').delete().eq('id', offer.id);
    if (error) toast(error.message, 'bad'); else nav(`/admin/candidates/${app.id}`);
  };

  const preview = (
    <OfferDocument highlight title={offerTitle(f)} company={f.company || ''} address={f.company_address} position={f.position || ''} candidate={app.name}
      letter={filledLetter} terms={filledTerms} attachments={files} />
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl sm:text-5xl leading-none">Offer for {app.name}</h1>
            <Pill>Draft</Pill>
          </div>
          <p className="text-sm text-muted mt-2">
            {saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved. Check your connection.' : 'Draft saved. Only your hiring team can see it.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={discard}>Delete draft</Button>
          <Button variant="accent" onClick={async () => { await flush(); setSendOpen(true); }}>Review and send</Button>
        </div>
      </div>

      <div className="lg:hidden mb-4"><Segmented value={view} onChange={setView} options={[{ id: 'edit', label: 'Edit' }, { id: 'preview', label: 'Preview' }]} /></div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-start">
        <div className={cx('space-y-5 min-w-0', view === 'preview' && 'hidden lg:block')}>
          <Card>
            <SectionTitle sub="The only things that usually change from one offer to the next.">For {first}</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Start date"><Input type="date" value={f.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
              <Field label="Sign by" hint="They can sign until the end of this day (UTC)."><Input type="date" value={f.expires || ''} onChange={(e) => set('expires', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-[1fr_96px] sm:grid-cols-[1fr_96px_150px] gap-3 mt-3">
              <Field label="Pay"><Input inputMode="decimal" value={f.pay_amount || ''} onChange={(e) => set('pay_amount', e.target.value)} placeholder="e.g. 100.00" /></Field>
              <Field label="Currency">
                <Input list="offer-currency" value={f.pay_currency || ''} onChange={(e) => set('pay_currency', e.target.value.toUpperCase().slice(0, 3))} />
                <datalist id="offer-currency">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Counted" className="col-span-2 sm:col-span-1">
                <Select value={f.pay_period || ''} onChange={(e) => set('pay_period', e.target.value)}>
                  <option value="">Choose…</option>
                  {PAY_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          <details className="group rounded-2xl bg-card border border-line" open={detailsOpen} onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="list-none cursor-pointer px-5 py-4 flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold">Company, role and hiring manager</span>
                <span className="block text-[13px] text-muted mt-0.5 truncate">
                  {[f.company, f.position, f.employment_type, f.manager_name].filter(Boolean).join(' · ') || 'Not filled in yet'}
                </span>
                <span className="block text-[12px] text-muted mt-1">Filled in from your company and job offer details. Changes here apply to this offer only.</span>
              </span>
              <span className="text-sm text-muted shrink-0 group-open:hidden">Edit</span>
              <span className="text-sm text-muted shrink-0 hidden group-open:inline">Close</span>
            </summary>
            <div className="px-5 pb-5 space-y-5 border-t border-line pt-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Company name"><Input value={f.company || ''} onChange={(e) => set('company', e.target.value)} /></Field>
                <Field label="Address" hint="Optional. Shown under the name."><Input value={f.company_address || ''} onChange={(e) => set('company_address', e.target.value)} /></Field>
                <Field label="Position"><Input value={f.position || ''} onChange={(e) => set('position', e.target.value)} /></Field>
                <Field label="Engagement" hint="Pick one or type your own.">
                  <Input list="offer-employment" value={f.employment_type || ''} onChange={(e) => set('employment_type', e.target.value)} placeholder="e.g. Full-time employee" />
                  <datalist id="offer-employment">{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
                </Field>
                <Field label="Provisional period" hint="Optional, e.g. 90 days."><Input value={f.provisional_period || ''} onChange={(e) => set('provisional_period', e.target.value)} /></Field>
                <Field label="Location"><Input value={f.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Remote" /></Field>
                <Field label="Schedule"><Input value={f.schedule || ''} onChange={(e) => set('schedule', e.target.value)} placeholder="e.g. Monday to Friday, flexible hours" /></Field>
                <Field label="Paid" hint="e.g. every two weeks (bi-weekly)"><Input value={f.pay_schedule || ''} onChange={(e) => set('pay_schedule', e.target.value)} /></Field>
                <Field label="Benefits" hint="Optional."><Input value={f.benefits || ''} onChange={(e) => set('benefits', e.target.value)} placeholder="e.g. paid time off" /></Field>
              </div>
              <div>
                <p className="text-sm font-medium">Hiring manager</p>
                <p className="text-[12px] text-muted mb-2">The offer email comes from your company name through apply1234, and replies go to this person.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Name"><Input value={f.manager_name || ''} onChange={(e) => set('manager_name', e.target.value)} /></Field>
                  <Field label="Title"><Input value={f.manager_title || ''} onChange={(e) => set('manager_title', e.target.value)} placeholder="e.g. CEO" /></Field>
                  <Field label="Email"><Input type="email" value={f.manager_email || ''} onChange={(e) => set('manager_email', e.target.value.trim())} /></Field>
                  <Field label="Phone" hint="Optional."><Input type="tel" value={f.manager_phone || ''} onChange={(e) => set('manager_phone', e.target.value)} /></Field>
                </div>
              </div>
              {job && <p className="text-[13px] text-muted">To change these for every offer, edit <Link className="underline underline-offset-2 hover:text-ink" to={`/admin/jobs/${job.id}?tab=offer`}>the job’s offer details</Link>{role === 'admin' ? <> or <Link className="underline underline-offset-2 hover:text-ink" to="/admin/settings#offer-defaults">your company’s</Link></> : null}.</p>}
            </div>
          </details>

          <Card>
            <SectionTitle sub="Words in {braces} fill in from the fields above. Tap one to add it where you're typing."
              action={<Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => { if (confirm('Replace the letter with the standard one?')) { setLetter(DEFAULT_LETTER); touch(); } }}>Standard letter</Button>}>
              Letter
            </SectionTitle>
            <div className="flex flex-wrap gap-1 mb-2">
              {FILLINS.map((t) => (
                <button key={t} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(t)}
                  className="font-mono text-[11px] rounded bg-paper-2 hover:bg-line px-1.5 py-0.5">{`{${t}}`}</button>
              ))}
            </div>
            <Textarea ref={areas.letter} mono rows={14} className="text-[13px]" value={letter}
              onFocus={() => { focused.current = 'letter'; }} onChange={(e) => { setLetter(e.target.value); touch(); }} />
          </Card>

          <Card>
            <SectionTitle sub="Replace every [note in brackets] with your own wording before sending. Have the terms checked by someone who knows employment law where the candidate lives."
              action={<Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => { if (confirm('Replace the terms with the starter terms?')) { setTerms(DEFAULT_TERMS); touch(); } }}>Starter terms</Button>}>
              Terms and conditions
            </SectionTitle>
            <Textarea ref={areas.terms} mono rows={16} className="text-[13px]" value={terms}
              onFocus={() => { focused.current = 'terms'; }} onChange={(e) => { setTerms(e.target.value); touch(); }} />
            {notes.length > 0 && <p className="mt-2 text-sm text-warn">{notes.length} {notes.length === 1 ? 'note' : 'notes'} in [brackets] still to replace. They're highlighted in the preview.</p>}
          </Card>

          <Card>
            <SectionTitle sub="An NDA, handbook or anything else that's part of the offer. The candidate opens them before signing.">Attachments</SectionTitle>
            <AttachmentList files={files} onRemove={(i) => { setFiles((x) => x.filter((_, j) => j !== i)); touch(); }} />
            <AddFileButton folder={`${offerBase(offer)}/attachments`} onAdd={(added) => { setFiles((x) => [...x, ...added]); touch(); }} />
            <p className="text-xs text-muted mt-2">PDF, Word, text or image, up to 20 MB each.</p>
          </Card>
        </div>

        <div className={cx('lg:sticky lg:top-4 min-w-0', view === 'edit' && 'hidden lg:block')}>
          <p className="text-[12px] text-muted mb-2">Preview: what {app.name.split(' ')[0]} will see</p>
          <div className="lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto rounded-2xl">{preview}</div>
        </div>
      </div>

      <SendModal open={sendOpen} onClose={() => setSendOpen(false)} app={app} job={job} offer={{ ...offer, fields: f, letter, terms, attachments: files }}
        missing={missing} onSent={(o) => setOffer(o)} flush={flush} company={company} />
    </>
  );
}

function SendModal({ open, onClose, app, job, offer, missing, onSent, flush, company }:
  { open: boolean; onClose: () => void; app: Application; job: Job | null; offer: Offer; missing: string[]; onSent: (o: Offer) => void; flush: () => Promise<boolean>; company: OfferDefaults }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState('');
  const f = offer.fields;
  const mgr = (f.manager_email || '').trim().toLowerCase();
  const [ccMgr, setCcMgr] = useState(true);
  const [extra, setExtra] = useState('');
  const isEmail = (x: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);
  const badCc = extra.split(/[,;\s]+/).filter(Boolean).filter((x) => !isEmail(x));
  const cc = ccList([...(ccMgr && mgr ? [mgr] : []), ...extra.split(/[,;\s]+/)], app.email);
  const first = app.name.split(' ')[0];
  const send = async () => {
    setBusy(true); setErr('');
    if (!(await flush())) { setBusy(false); return; }
    const r = await offerCall<{ link: string; emailed: boolean }>({ action: 'send', offer_id: offer.id, cc });
    if (!r.ok) {
      setBusy(false);
      setErr(r.error === 'missing' ? `Still needed: ${(r.missing || []).join(', ')}.` : offerError(r.error));
      return;
    }
    if (remember && job) {
      const fresh = await getJob(job.id);   // the job's details may have changed since this page opened
      const settings = fresh?.settings || job.settings || {};
      await updateJob(job.id, { settings: { ...settings, offer_defaults: defaultsToKeep(f, offer.letter, offer.terms, offer.attachments, company, settings.offer_defaults || {}) } });
    }
    const { data } = await supabase.from('hiring_offers').select('*').eq('id', offer.id).single();
    setBusy(false); onClose();
    toast(r.emailed ? `Offer sent to ${app.name}` : 'The offer is ready, but the email didn’t go out. Copy the link and send it yourself.', r.emailed ? 'good' : 'bad');
    if (data) onSent(data as Offer);
  };
  return (
    <Modal open={open} onClose={onClose} title={missing.length ? 'Before you send' : `Send the offer to ${app.name}?`}>
      {missing.length > 0 ? (
        <>
          <p className="text-sm text-ink-2">Add these first:</p>
          <ul className="mt-2 space-y-1.5">{missing.map((m) => <li key={m} className="text-sm flex gap-2"><span className="text-warn">•</span>{m}</li>)}</ul>
          <div className="mt-5 flex justify-end"><Button variant="primary" onClick={onClose}>Back to the offer</Button></div>
        </>
      ) : (
        <>
          <dl className="text-sm grid grid-cols-[88px_1fr] gap-y-2">
            <dt className="text-muted">To</dt><dd className="break-all">{app.name} &lt;{app.email}&gt;</dd>
            <dt className="text-muted">From</dt><dd className="break-all">{f.company} via apply1234 &lt;hiring@apply1234.com&gt;</dd>
            <dt className="text-muted">Replies</dt><dd className="break-all">{f.manager_name} &lt;{f.manager_email}&gt;</dd>
            <dt className="text-muted">CC</dt><dd className="break-all">{cc.length ? cc.join(', ') : 'No one'}</dd>
            <dt className="text-muted">Sign by</dt><dd>{fmtDay(f.expires)}</dd>
          </dl>
          <div className="mt-4 rounded-xl bg-paper-2/60 p-3 space-y-3">
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={ccMgr} disabled={!mgr} onChange={(e) => setCcMgr(e.target.checked)} />
              <span>CC the hiring manager{mgr ? <>, <span className="break-all">{f.manager_name ? `${f.manager_name} (${mgr})` : mgr}</span></> : ''}</span>
            </label>
            <Field label="Also CC" hint={badCc.length ? <span className="text-bad">Check {badCc.join(', ')}. That doesn’t look like an email address.</span> : 'Optional. Separate addresses with commas.'}>
              <Input className="h-9 text-sm" type="email" multiple value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="name@company.com" />
            </Field>
            <p className="text-[12px] text-muted leading-relaxed">People you CC get a copy of the offer and, once it’s signed, the signed PDF. Their copy has no signing link, so only {first} can open and sign it.</p>
          </div>
          <p className="text-sm text-ink-2 mt-4 leading-relaxed">
            {first} gets a private link to read and sign. When they sign, the signed PDF (with the signature, time, IP address and a fingerprint of the document) is emailed to them, to {f.manager_email}, to you and to anyone you CC.
          </p>
          <p className="text-sm text-ink-2 mt-2">After sending, the offer can’t be changed. To change it, withdraw it and send a new one.</p>
          <label className="mt-4 flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Save the company, manager, terms and attachments as this job’s offer details, so the next offer starts from them</span>
          </label>
          {err && <p className="mt-4 rounded-xl bg-bad-soft text-bad text-sm px-4 py-3">{err}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="accent" disabled={busy || badCc.length > 0} onClick={send}>{busy ? <><Spinner /> Sending</> : 'Send offer'}</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── After sending ── */
function SentOffer({ app, offer, reload }: { app: Application; offer: Offer; reload: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState('');
  const st = OFFER_STATUS[offer.status];
  const link = offer.token ? `${location.origin}/offer/${offer.token}` : '';
  const open = offer.status === 'sent' || offer.status === 'viewed';
  const expired = open && !!offer.expires_at && new Date(offer.expires_at) < new Date();

  const act = async (action: 'resend' | 'withdraw' | 'rebuild_pdf', confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action);
    const r = await offerCall({ action, offer_id: offer.id });
    setBusy('');
    if (!r.ok) { toast(offerError(r.error), 'bad'); return; }
    toast(action === 'resend' ? 'Reminder sent' : action === 'withdraw' ? 'Offer withdrawn' : 'Signed PDF rebuilt', 'good');
    reload();
  };
  const fresh = async () => {
    const { data, error } = await supabase.from('hiring_offers').insert({
      application_id: offer.application_id, job_id: offer.job_id, fields: { ...offer.fields, cc: undefined },
      letter: offer.letter, terms: offer.terms, attachments: offer.attachments,
    }).select('id').single();
    if (error) toast(error.message, 'bad'); else nav(`/admin/candidates/${app.id}/offer/${data.id}`);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl sm:text-5xl leading-none">Offer for {app.name}</h1>
            <Pill tone={expired ? 'warn' : st.tone}>{expired ? 'Expired' : st.label}</Pill>
          </div>
          <p className="text-sm text-muted mt-2">{offer.fields.position} · sent {fmtStamp(offer.sent_at)}{offer.sent_by ? ` by ${offer.sent_by}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && link && <CopyButton size="md" text={link} label="Copy signing link" />}
          {open && !expired && <Button disabled={!!busy} onClick={() => act('resend')}>{busy === 'resend' ? <Spinner /> : null}Send a reminder</Button>}
          {open && <Button variant="danger" disabled={!!busy} onClick={() => act('withdraw', `Withdraw this offer? ${app.name.split(' ')[0]} won't be able to sign it.`)}>Withdraw</Button>}
          {(['declined', 'withdrawn'].includes(offer.status) || expired) && <Button variant="primary" onClick={fresh}>Prepare a new offer</Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
        <div className="min-w-0">
          <OfferDocument title={offerTitle(offer.fields)} company={offer.fields.company || ''} address={offer.fields.company_address} position={offer.fields.position || ''}
            candidate={app.name} date={offer.sent_at}
            letter={offer.final_letter || ''} terms={offer.final_terms || ''} attachments={offer.attachments}
            onFile={async (i) => window.open(await teamFileLink(offer.attachments[i].path), '_blank', 'noopener')} />
        </div>
        <div className="space-y-5 min-w-0 lg:sticky lg:top-4">
          <OfferRecord app={app} offer={offer} onRebuild={() => act('rebuild_pdf')} rebuilding={busy === 'rebuild_pdf'} />
        </div>
      </div>
    </>
  );
}

/** The files and audit trail of an offer: signed PDF, signature, attachments, event log. */
export function OfferRecord({ app, offer, onRebuild, rebuilding, compact }:
  { app: Pick<Application, 'name' | 'email'>; offer: Offer; onRebuild?: () => void; rebuilding?: boolean; compact?: boolean }) {
  const toast = useToast();
  const openPath = async (path: string, download?: string) => {
    try { window.open(await teamFileLink(path, download), '_blank', 'noopener'); }
    catch (e: any) { toast(e?.message || 'Couldn’t open the file', 'bad'); }
  };
  const base = `${app.name} - ${offer.fields.company || 'offer'}`.replace(/[^\w .-]+/g, '');
  const m = offer.signer_meta || {};
  const rows: [string, string][] = [
    ['Status', OFFER_STATUS[offer.status].label + (offer.signed_at ? `, ${fmtStamp(offer.signed_at)}` : offer.declined_at ? `, ${fmtStamp(offer.declined_at)}` : offer.withdrawn_at ? `, ${fmtStamp(offer.withdrawn_at)}` : '')],
    ['Opened', offer.views ? `${offer.views} ${offer.views === 1 ? 'time' : 'times'}, first ${fmtStamp(offer.viewed_at)}` : 'Not yet'],
    ...(offer.signed_at ? [
      ['Signed as', `${offer.signer_name} (${offer.signature?.kind === 'drawn' ? 'drawn' : 'typed'} signature)`],
      ['IP address', m.ip || '—'], ['Device', `${uaLabel(m.ua)}${m.tz ? `, ${m.tz}` : ''}`],
    ] as [string, string][] : []),
    ...(offer.fields.cc?.length ? [['CC', offer.fields.cc.join(', ')]] as [string, string][] : []),
    ...(offer.decline_reason ? [['Their note', offer.decline_reason]] as [string, string][] : []),
    ['Fingerprint', offer.doc_hash ? `${offer.doc_hash.slice(0, 16)}…` : '—'],
  ];
  return (
    <>
      <Card>
        <SectionTitle sub={compact ? undefined : 'Everything recorded for this offer.'}>Record</SectionTitle>
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className={cx('min-w-0 break-words', k === 'Fingerprint' && 'font-mono text-[12px]')} title={k === 'Fingerprint' ? offer.doc_hash || '' : undefined}>{v}</dd></Fragment>)}
        </dl>
        <div className="mt-4 pt-4 border-t border-line space-y-2">
          <p className="text-[12px] text-muted">Files</p>
          {offer.pdf_path && <FileRow kind="pdf" name="Signed offer (PDF)" note="Letter, terms, signatures and certificate" onOpen={() => openPath(offer.pdf_path!)} onDownload={() => openPath(offer.pdf_path!, `Signed offer - ${base}.pdf`)} />}
          {offer.status === 'signed' && !offer.pdf_path && onRebuild && (
            <div className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm flex items-center justify-between gap-2">
              <span className="text-warn">The signed PDF wasn’t saved.</span>
              <Button size="sm" disabled={rebuilding} onClick={onRebuild}>{rebuilding ? <Spinner /> : 'Make it again'}</Button>
            </div>
          )}
          {offer.signature?.kind === 'drawn' && offer.signature.path && <FileRow kind="png" name="Signature image" note="As drawn on their screen" onOpen={() => openPath(offer.signature!.path!)} onDownload={() => openPath(offer.signature!.path!, `Signature - ${base}.png`)} />}
          {offer.attachments.map((a) => <FileRow key={a.path} kind={a.name.split('.').pop() || 'file'} name={a.name} note={`Attachment · ${fmtSize(a.size || 0)}`} onOpen={() => openPath(a.path)} onDownload={() => openPath(a.path, a.name)} />)}
          <FileRow kind="json" name="Audit trail" note="Every event with time, IP address and device" onDownload={() => downloadJson(`Offer audit trail - ${base}.json`, auditTrail(offer, app))} />
        </div>
      </Card>
      {!compact && (
        <Card>
          <SectionTitle>Event log</SectionTitle>
          <ol className="space-y-2.5 border-l border-line pl-4">
            {offer.events.map((e, i) => (
              <li key={i} className="text-[13px]">
                <span className="text-muted font-mono text-[11px] block">{fmtStamp(e.at)}</span>
                {EVENT_LABELS[e.type] || e.type}
                <span className="text-muted">{[e.by, e.ip && `IP ${e.ip}`, e.ua && uaLabel(e.ua), e.note].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}

function FileRow({ kind, name, note, onOpen, onDownload }: { kind: string; name: string; note: string; onOpen?: () => void; onDownload: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
      <span className="grid place-items-center h-8 w-7 rounded bg-accent-soft text-accent text-[9px] font-bold uppercase shrink-0">{kind.slice(0, 4)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{name}</span>
        <span className="block text-[12px] text-muted truncate">{note}</span>
      </span>
      {onOpen && <Button size="sm" variant="ghost" onClick={onOpen}>Open</Button>}
      <Button size="sm" variant="ghost" onClick={onDownload}>Download</Button>
    </div>
  );
}
