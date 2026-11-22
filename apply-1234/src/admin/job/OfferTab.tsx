// Job › Offer: what offers for this job start from. Blank fields use the company's offer defaults.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Job } from '../../lib/types';
import { loadCompanyDefaults, type OfferDefaults } from '../../lib/offers';
import { OfferDefaultsForm } from '../OfferDefaultsForm';
import { useRole } from '../role';

export default function OfferTab({ job, patch }: { job: Job; patch: (p: Partial<Job>) => void }) {
  const role = useRole();
  const [company, setCompany] = useState<OfferDefaults>({});
  useEffect(() => { loadCompanyDefaults().then(setCompany); }, []);
  const value = job.settings?.offer_defaults || {};
  const onChange = (p: Partial<OfferDefaults>) => {
    const next: OfferDefaults = { ...value, ...p };
    for (const k of Object.keys(next) as (keyof OfferDefaults)[]) if (next[k] === undefined || next[k] === '') delete next[k];
    patch({ settings: { ...(job.settings || {}), offer_defaults: next } });
  };
  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-sm text-ink-2 leading-relaxed">
        Offers for this job start from these details, so each offer only needs the person’s start date, pay and deadline.
        Anything left blank uses {role === 'admin' ? <Link className="underline underline-offset-2 hover:text-ink" to="/admin/settings#offer-defaults">your company’s offer defaults</Link> : 'your company’s offer defaults'}.
        Pay here is internal and never appears on the posting.
      </p>
      <OfferDefaultsForm scope="job" folder={`${job.id}/offer-template`} inherit={company} value={value} onChange={onChange} />
    </div>
  );
}
