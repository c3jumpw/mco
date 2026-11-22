// The details every offer starts from, set company-wide (Settings) or for one job (the job's Offer tab).
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CURRENCIES, DEFAULT_LETTER, DEFAULT_TERMS, EMPLOYMENT_TYPES, PAY_PERIODS, TEAM_BUCKET, slugName, teamFileLink, type OfferDefaults } from '../lib/offers';
import type { OfferFile } from '../lib/offers';
import { fmtSize } from '../lib/files';
import { Button, Card, Field, Input, SectionTitle, Select, Spinner, Textarea, cx, useToast } from '../ui';

export const OFFER_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

/** Uploads offer attachments into the hiring team's private storage under `folder`. */
export async function uploadOfferFiles(list: FileList | File[], folder: string, toast: (m: string, t?: 'good' | 'bad') => void): Promise<OfferFile[]> {
  const added: OfferFile[] = [];
  for (const file of Array.from(list)) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!OFFER_FILE_TYPES[ext]) { toast(`${file.name}: choose a PDF, Word, text or image file.`, 'bad'); continue; }
    if (file.size > 20 * 1024 * 1024) { toast(`${file.name} is over 20 MB.`, 'bad'); continue; }
    const path = `${folder}/${Date.now().toString(36)}-${slugName(file.name)}.${ext}`;
    const { error } = await supabase.storage.from(TEAM_BUCKET).upload(path, file, { contentType: OFFER_FILE_TYPES[ext], upsert: false });
    if (error) toast(`${file.name}: ${error.message}`, 'bad');
    else added.push({ path, name: file.name.slice(0, 160), size: file.size, type: OFFER_FILE_TYPES[ext] });
  }
  return added;
}

export function AttachmentList({ files, onRemove, inherited = [] }: { files: OfferFile[]; onRemove?: (i: number) => void; inherited?: OfferFile[] }) {
  const toast = useToast();
  const open = async (path: string) => {
    try { window.open(await teamFileLink(path), '_blank', 'noopener'); } catch (e: any) { toast(e?.message || 'Couldn’t open the file', 'bad'); }
  };
  const row = (a: OfferFile, note: string, remove?: () => void) => (
    <li key={a.path} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
      <span className="grid place-items-center h-8 w-7 rounded bg-accent-soft text-accent text-[9px] font-bold uppercase shrink-0">{a.name.split('.').pop()}</span>
      <span className="min-w-0 flex-1 text-sm"><span className="block truncate">{a.name}</span><span className="block text-[12px] text-muted">{note}</span></span>
      <Button size="sm" variant="ghost" onClick={() => open(a.path)}>Open</Button>
      {remove && <Button size="sm" variant="ghost" onClick={remove}>Remove</Button>}
    </li>
  );
  if (!files.length && !inherited.length) return null;
  return (
    <ul className="space-y-2 mb-3">
      {inherited.map((a) => row(a, `From company settings · ${fmtSize(a.size || 0)}`))}
      {files.map((a, i) => row(a, fmtSize(a.size || 0), onRemove ? () => onRemove(i) : undefined))}
    </ul>
  );
}

export function AddFileButton({ folder, onAdd, label = '+ Add a file' }: { folder: string; onAdd: (f: OfferFile[]) => void; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={cx('inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border border-dashed border-line text-sm cursor-pointer hover:border-ink/30 bg-card', busy && 'opacity-50 pointer-events-none')}>
      {busy ? <><Spinner /> Uploading</> : label}
      <input type="file" multiple className="sr-only" accept={Object.keys(OFFER_FILE_TYPES).map((x) => `.${x}`).join(',')}
        onChange={async (e) => {
          const list = Array.from(e.target.files || []); e.target.value = '';   // copy before clearing the input
          if (!list.length) return;
          setBusy(true);
          const added = await uploadOfferFiles(list, folder, toast);
          setBusy(false);
          if (added.length) onAdd(added);
        }} />
    </label>
  );
}

type Section = 'company' | 'manager' | 'role' | 'pay' | 'letter' | 'attachments';

/** A titled block: a card on full pages, a plain group inside another card. Defined here, not inside the
 *  form, so typing doesn't remount the fields. */
function Wrap({ cards, title, sub, children }: { cards: boolean; title: string; sub?: string; children: React.ReactNode }) {
  return cards
    ? <Card><SectionTitle sub={sub}>{title}</SectionTitle>{children}</Card>
    : <div><p className="text-sm font-medium">{title}</p>{sub && <p className="text-[12px] text-muted mb-2">{sub}</p>}<div className={cx(!sub && 'mt-2')}>{children}</div></div>;
}

/** `scope` company: the defaults for every job. `scope` job: this job's choices, with the company's shown as
 *  placeholders; anything left blank uses the company setting. */
export function OfferDefaultsForm({ value, onChange, scope, inherit = {}, folder, sections = ['company', 'manager', 'role', 'pay', 'letter', 'attachments'], cards = true }:
  { value: OfferDefaults; onChange: (patch: Partial<OfferDefaults>) => void; scope: 'company' | 'job'; inherit?: OfferDefaults; folder: string; sections?: Section[]; cards?: boolean }) {
  const job = scope === 'job';
  const v = value as Record<string, string | undefined>;
  const from = inherit as Record<string, string | undefined>;
  const ph = (k: string, fallback = '') => (job && from[k] ? from[k] : fallback);
  const text = (k: keyof OfferDefaults, label: string, opts: { hint?: string; placeholder?: string; type?: string; list?: string; mode?: 'decimal' } = {}) => (
    <Field label={label} hint={opts.hint || (job && from[k as string] ? 'Blank uses the company setting.' : undefined)}>
      <Input type={opts.type} inputMode={opts.mode} list={opts.list} value={v[k as string] || ''} placeholder={ph(k as string, opts.placeholder)}
        onChange={(e) => onChange({ [k]: e.target.value } as Partial<OfferDefaults>)} />
    </Field>
  );

  return (
    <div className="space-y-5">
      <datalist id="od-employment">{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="od-currency">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>

      {sections.includes('company') && (
        <Wrap cards={cards} title="Company" sub="Shown at the top of the offer.">
          <div className="grid sm:grid-cols-2 gap-3">
            {text('company', 'Company name')}
            {text('company_address', 'Address', { hint: 'Optional.' })}
          </div>
        </Wrap>
      )}

      {sections.includes('manager') && (
        <Wrap cards={cards} title="Hiring manager" sub="Offers are signed off by this person, and candidates’ replies go to them.">
          <div className="grid sm:grid-cols-2 gap-3">
            {text('manager_name', 'Name')}
            {text('manager_title', 'Title', { placeholder: 'e.g. CEO' })}
            {text('manager_email', 'Email', { type: 'email' })}
            {text('manager_phone', 'Phone', { type: 'tel', hint: 'Optional.' })}
          </div>
        </Wrap>
      )}

      {sections.includes('role') && (
        <Wrap cards={cards} title="The role" sub={job ? 'How this job is offered.' : 'Used for every job unless the job says otherwise.'}>
          <div className="grid sm:grid-cols-2 gap-3">
            {text('employment_type', 'Engagement', { list: 'od-employment', placeholder: 'e.g. Independent contractor' })}
            {text('provisional_period', 'Provisional period', { placeholder: 'e.g. 90 days', hint: 'Optional. Shown as “your first 90 days”.' })}
            {text('location', 'Location', { placeholder: 'e.g. Remote' })}
            {text('schedule', 'Schedule', { placeholder: 'e.g. Monday to Friday, flexible hours' })}
            <Field label="Days to sign" hint={job && inherit.sign_days ? `Blank uses the company setting (${inherit.sign_days}).` : 'How long candidates have to sign. 7 if blank.'}>
              <Input type="number" min={1} max={60} value={value.sign_days ?? ''} placeholder={job && inherit.sign_days ? String(inherit.sign_days) : '7'}
                onChange={(e) => onChange({ sign_days: e.target.value ? Math.max(1, Math.min(60, Number(e.target.value))) : undefined })} />
            </Field>
          </div>
        </Wrap>
      )}

      {sections.includes('pay') && (
        <Wrap cards={cards} title="Pay" sub={job ? 'Kept private: pay is never shown on the public posting. The starting pay fills in each new offer and can be changed per person.' : 'How pay is counted and paid. Amounts are set per job and per person.'}>
          <div className={cx('grid gap-3', job ? 'grid-cols-[1fr_96px] sm:grid-cols-[1fr_96px_150px]' : 'grid-cols-[96px_1fr]')}>
            {job && text('pay_amount', 'Starting pay', { mode: 'decimal', placeholder: 'e.g. 100.00', hint: 'Internal.' })}
            <Field label="Currency">
              <Input list="od-currency" value={v.pay_currency || ''} placeholder={ph('pay_currency', 'USD')} onChange={(e) => onChange({ pay_currency: e.target.value.toUpperCase().slice(0, 3) })} />
            </Field>
            <Field label="Counted" className={job ? 'col-span-2 sm:col-span-1' : ''}>
              <Select value={v.pay_period || ''} onChange={(e) => onChange({ pay_period: e.target.value })}>
                <option value="">{job && from.pay_period ? `Company: ${from.pay_period}` : 'Choose…'}</option>
                {PAY_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            {text('pay_schedule', 'Paid', { placeholder: 'e.g. every two weeks (bi-weekly)' })}
            {text('benefits', 'Benefits', { placeholder: 'e.g. paid time off', hint: 'Optional.' })}
          </div>
        </Wrap>
      )}

      {sections.includes('letter') && <LetterAndTerms value={value} onChange={onChange} job={job} inherit={inherit} cards={cards} />}

      {sections.includes('attachments') && (
        <Wrap cards={cards} title="Attachments" sub={job ? 'Added to every offer for this job, after the company’s.' : 'Added to every offer, such as an NDA or handbook. Each sent offer keeps its own copy.'}>
          <AttachmentList files={value.attachments || []} inherited={job ? inherit.attachments || [] : []}
            onRemove={(i) => onChange({ attachments: (value.attachments || []).filter((_, j) => j !== i) })} />
          <AddFileButton folder={folder} onAdd={(f) => onChange({ attachments: [...(value.attachments || []), ...f] })} />
          <p className="text-xs text-muted mt-2">PDF, Word, text or image, up to 20 MB each.</p>
        </Wrap>
      )}
    </div>
  );
}

function LetterAndTerms({ value, onChange, job, inherit, cards }:
  { value: OfferDefaults; onChange: (p: Partial<OfferDefaults>) => void; job: boolean; inherit: OfferDefaults; cards: boolean }) {
  const base = { letter: inherit.letter || DEFAULT_LETTER, terms: inherit.terms || DEFAULT_TERMS };
  const part = (k: 'letter' | 'terms', title: string, std: string, stdLabel: string) => {
    const own = value[k] !== undefined && value[k] !== '';
    if (job && !own) {
      return (
        <Wrap cards={cards} title={title}>
          <p className="text-sm text-muted">{inherit[k] ? 'Uses the company’s.' : `Uses the standard ${k === 'letter' ? 'letter' : 'starter terms'}.`}</p>
          <Button size="sm" className="mt-2" onClick={() => onChange({ [k]: base[k] })}>Use a different {k === 'letter' ? 'letter' : 'set of terms'} for this job</Button>
        </Wrap>
      );
    }
    return (
      <Wrap cards={cards} title={title} sub={k === 'letter' ? 'Words in {braces} fill in from the offer, such as {first}, {position}, {pay} and {start_date}.' : 'Replace every [note in brackets] with your own wording. Have the terms checked by someone who knows employment law.'}>
        <Textarea mono rows={k === 'letter' ? 12 : 14} className="text-[13px]" value={value[k] || ''} onChange={(e) => onChange({ [k]: e.target.value })} />
        <div className="mt-2 flex flex-wrap gap-2">
          {job
            ? <Button size="sm" variant="ghost" onClick={() => onChange({ [k]: undefined })}>Use the {inherit[k] ? 'company’s' : 'standard'} {k === 'letter' ? 'letter' : 'terms'}</Button>
            : <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Replace it with the ${stdLabel}?`)) onChange({ [k]: std }); }}>Use the {stdLabel}</Button>}
        </div>
      </Wrap>
    );
  };
  return (
    <>
      {part('letter', 'Letter', DEFAULT_LETTER, 'standard letter')}
      {part('terms', 'Terms and conditions', DEFAULT_TERMS, 'starter terms')}
    </>
  );
}
