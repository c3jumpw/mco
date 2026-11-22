// Settings › Offer defaults: what every offer starts from, for every job.
import { useEffect, useState } from 'react';
import { loadCompanyDefaults, saveCompanyDefaults, type OfferDefaults } from '../lib/offers';
import { Button, Card, SectionTitle, Spinner, useToast } from '../ui';
import { OfferDefaultsForm } from './OfferDefaultsForm';

export function CompanyOfferCard() {
  const toast = useToast();
  const [saved, setSaved] = useState<OfferDefaults | null>(null);
  const [draft, setDraft] = useState<OfferDefaults>({});
  const [open, setOpen] = useState(() => location.hash === '#offer-defaults');
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadCompanyDefaults().then((d) => { setSaved(d); setDraft(d); }); }, []);
  useEffect(() => { if (open && location.hash === '#offer-defaults') document.getElementById('offer-defaults')?.scrollIntoView(); }, [open, saved]);

  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(draft);
  const save = async () => {
    setBusy(true);
    const err = await saveCompanyDefaults(draft);
    setBusy(false);
    if (err) { toast(err.message, 'bad'); return; }
    setSaved(draft); toast('Offer defaults saved', 'good');
  };
  const summary = saved && [saved.company, saved.manager_name && `signed off by ${saved.manager_name}`, saved.employment_type,
    saved.attachments?.length ? `${saved.attachments.length} attachment${saved.attachments.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');

  return (
    <Card>
      <div id="offer-defaults" className="scroll-mt-4" />
      <SectionTitle sub="What every offer starts from. Each job can change any of it on its Offer tab, and each offer only needs the person’s start date, pay and deadline."
        action={!open && <Button size="sm" onClick={() => setOpen(true)}>Edit</Button>}>
        Offer defaults
      </SectionTitle>
      {saved === null ? <Spinner /> : !open ? (
        <p className="text-sm text-ink-2">{summary || 'Not set yet. Add your company, hiring manager, letter, terms and an NDA once, and every offer starts from them.'}</p>
      ) : (
        <>
          <OfferDefaultsForm scope="company" cards={false} folder="company/offer" value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
          <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 mt-5 px-4 sm:px-5 py-3 bg-card/95 backdrop-blur border-t border-line rounded-b-2xl flex items-center justify-end gap-2">
            {dirty && <span className="text-[13px] text-muted mr-auto">Unsaved changes</span>}
            <Button variant="ghost" onClick={() => { setDraft(saved); setOpen(false); }}>{dirty ? 'Cancel' : 'Close'}</Button>
            <Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner /> : 'Save offer defaults'}</Button>
          </div>
        </>
      )}
    </Card>
  );
}
