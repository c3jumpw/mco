// The offer on a candidate's profile: prepare one, or see where it stands and its signed files.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Application, Job } from '../lib/types';
import { OFFER_STATUS, fmtDay, fmtStamp, offerDefaults, payText, type Offer } from '../lib/offers';
import { Button, Card, Pill, SectionTitle, Spinner, useToast } from '../ui';
import { OfferRecord } from './OfferEditor';

export function OfferCard({ app, job }: { app: Application; job: Job | null }) {
  const toast = useToast();
  const nav = useNavigate();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('hiring_offers').select('*').eq('application_id', app.id).order('created_at', { ascending: false })
      .then(({ data, error }) => setOffers(error ? [] : (data || []) as Offer[]));
  }, [app.id]);

  const prepare = async () => {
    if (!job) return;
    setBusy(true);
    const d = offerDefaults(job);
    const { data, error } = await supabase.from('hiring_offers')
      .insert({ application_id: app.id, job_id: app.job_id, fields: d.fields, letter: d.letter, terms: d.terms, attachments: [] })
      .select('id').single();
    setBusy(false);
    if (error) toast(error.message, 'bad'); else nav(`/admin/candidates/${app.id}/offer/${data.id}`);
  };

  if (offers === null) return <Card><SectionTitle>Offer</SectionTitle><Spinner /></Card>;
  const [o, ...older] = offers;
  const first = app.name.split(' ')[0];
  if (!o) {
    return (
      <Card>
        <SectionTitle>Offer</SectionTitle>
        <p className="text-sm text-ink-2 leading-relaxed">Write the offer with pay, start date and terms, preview it, then send it. {first} signs online, and you both get the signed PDF by email.</p>
        <Button variant="primary" className="mt-3 w-full" disabled={busy || !job} onClick={prepare}>{busy ? <Spinner /> : 'Prepare an offer'}</Button>
      </Card>
    );
  }
  const open = o.status === 'sent' || o.status === 'viewed';
  const expired = open && !!o.expires_at && new Date(o.expires_at) < new Date();
  const st = OFFER_STATUS[o.status];
  return (
    <>
      <Card>
        <SectionTitle action={<Pill tone={expired ? 'warn' : st.tone}>{expired ? 'Expired' : st.label}</Pill>}>Offer</SectionTitle>
        <p className="text-sm font-medium">{o.fields.position || job?.title}</p>
        <p className="text-sm text-muted mt-0.5">
          {[payText(o.fields), o.fields.start_date && `starts ${fmtDay(o.fields.start_date)}`].filter(Boolean).join(' · ') || 'Not filled in yet'}
        </p>
        <p className="text-[12px] text-muted mt-2">
          {o.status === 'draft' ? `Draft, last changed ${fmtStamp(o.updated_at)}`
            : o.status === 'signed' ? `Signed by ${o.signer_name}, ${fmtStamp(o.signed_at)}`
            : o.status === 'declined' ? `Declined ${fmtStamp(o.declined_at)}${o.decline_reason ? `: “${o.decline_reason}”` : ''}`
            : o.status === 'withdrawn' ? `Withdrawn ${fmtStamp(o.withdrawn_at)}`
            : `Sent ${fmtStamp(o.sent_at)} · ${o.views ? `opened ${o.views}×` : 'not opened yet'} · ${expired ? 'expired' : `sign by ${fmtDay(o.fields.expires)}`}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/admin/candidates/${app.id}/offer/${o.id}`} className="flex-1">
            <Button variant={o.status === 'draft' ? 'primary' : 'secondary'} className="w-full">{o.status === 'draft' ? 'Continue the offer' : 'Open the offer'}</Button>
          </Link>
          {(['declined', 'withdrawn'].includes(o.status) || expired) && <Button onClick={prepare} disabled={busy}>New offer</Button>}
        </div>
        {older.length > 0 && (
          <details className="mt-3">
            <summary className="text-[13px] text-muted cursor-pointer hover:text-ink">Earlier offers ({older.length})</summary>
            <ul className="mt-2 space-y-1">
              {older.map((x) => (
                <li key={x.id}><Link className="text-sm flex justify-between gap-2 hover:underline" to={`/admin/candidates/${app.id}/offer/${x.id}`}>
                  <span>{fmtStamp(x.sent_at || x.created_at)}</span><span className="text-muted">{OFFER_STATUS[x.status].label}</span>
                </Link></li>
              ))}
            </ul>
          </details>
        )}
      </Card>
      {o.status !== 'draft' && <OfferRecord app={app} offer={o} compact />}
    </>
  );
}
