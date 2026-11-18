import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { TRACKS, cx, money, plural } from '../../lib/util';
import type { Module, Placement, Tier, Track } from '../../lib/types';
import { Button, Card, Checkbox, Chip, EmptyState, ErrorBox, Field, IconButton, Input, Notice, PageHeader, Sheet, Skeleton, Textarea, useConfirm, useToast } from '../../ui';
import { FormError, focusInvalid } from '../parts/ops-common';
import { AGENCY_BACK, EYEBROW, MoneyInput, econ, num, parseNum, pctText, scoreText, sortTiers } from './parts/core-common';

type Mod = Pick<Module, 'id' | 'title' | 'track' | 'status' | 'sort'>;
interface Data { tiers: Tier[]; placements: Pick<Placement, 'tier_id' | 'status'>[]; modules: Mod[] }

export default function Tiers() {
  useTitle('Tiers');
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const res = useAsync<Data>(async () => {
    const [tiers, placements, modules] = await Promise.all([
      q<Tier[]>(supabase.from('ramp_tiers').select('*').order('level')),
      q<Data['placements']>(supabase.from('ramp_placements').select('tier_id, status')),
      q<Mod[]>(supabase.from('ramp_modules').select('id, title, track, status, sort').order('sort')),
    ]);
    return { tiers: sortTiers(tiers), placements, modules };
  }, []);
  const [editing, setEditing] = useState<Tier | 'new' | null>(null);
  const [busy, setBusy] = useState('');

  const countAt = (id: string) => (res.data?.placements || []).filter((p) => p.tier_id === id && p.status !== 'ended').length;
  const noTier = (res.data?.placements || []).filter((p) => !p.tier_id && p.status !== 'ended').length;
  const titleOf = (id: string) => res.data?.modules.find((m) => m.id === id)?.title || 'Removed module';

  async function move(i: number, dir: -1 | 1) {
    const list = res.data!.tiers;
    const a = list[i]!, b = list[i + dir];
    if (!b) return;
    // Swap places on the ladder. Equal levels get renumbered so the order sticks.
    const next = list.slice();
    next[i] = b;
    next[i + dir] = a;
    const levels = new Set(list.map((t) => t.level)).size === list.length ? list.map((t) => t.level) : list.map((_, k) => k + 1);
    const updates = next.map((t, k) => ({ id: t.id, level: levels[k]! })).filter((u) => list.find((t) => t.id === u.id)!.level !== u.level);
    setBusy(a.id);
    const results = await Promise.all(updates.map((u) => supabase.from('ramp_tiers').update({ level: u.level }).eq('id', u.id)));
    setBusy('');
    const bad = results.find((r) => r.error);
    if (bad) toast(errText(bad.error), 'bad');
    res.reload();
  }

  async function remove(t: Tier) {
    const n = countAt(t.id);
    const ok = await confirm({
      title: `Delete ${t.name}?`,
      body: (n ? `${plural(n, 'open placement')} at this tier will have no tier. Their rates don’t change. ` : '') + 'The rate history keeps its numbers but shows the tier as removed. This can’t be undone.',
      action: 'Delete tier', danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('ramp_tiers').delete().eq('id', t.id);
    if (error) { toast(errText(error), 'bad'); return; }
    toast(`${t.name} deleted.`);
    res.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Tiers"
        subtitle="Skill levels on the way up, with default rates and what it takes to reach each one. RAMP flags team members who are ready to move up."
        actions={<Button variant="primary" icon="plus" onClick={() => setEditing('new')} disabled={!res.data}>Add tier</Button>} />

      <Notice tone="brand" icon="info">
        Default rates fill in new placements. Changing them doesn’t change anyone already placed. To move someone up, use Change rate or tier on their placement, or Promote on the dashboard.
      </Notice>

      {res.error && !res.data && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Skeleton rows={4} />}

      {res.data && res.data.tiers.length === 0 && (
        <Card><EmptyState icon="star" title="No tiers yet" body="Start with an entry tier for newly trained team members, then add the levels they can grow into."
          action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add tier</Button>} /></Card>
      )}

      {res.data && res.data.tiers.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label="Tier ladder, lowest first">
          {res.data.tiers.map((t, i, all) => {
            const e = econ(1, t.bill_rate, t.pay_rate);
            const n = countAt(t.id);
            return (
              <li key={t.id}>
                <Card className="flex gap-4">
                  <span className="w-10 h-10 rounded-full bg-brand text-white font-bold flex items-center justify-center shrink-0 tabular-nums" aria-hidden="true">{i + 1}</span>
                  <div className="min-w-0 flex-1 flex flex-col gap-2">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                      <div className="min-w-0 flex-1 basis-48">
                        <h2 className="font-display text-lg font-semibold leading-snug">{t.name} <span className="sr-only">, step {i + 1}</span></h2>
                        {t.description && <p className="text-[15px] text-ink-2 leading-relaxed">{t.description}</p>}
                      </div>
                      <Link to={`/admin/placements?tier=${t.id}`} className="no-underline"><Chip tone={n ? 'brand' : 'neutral'} icon="users">{plural(n, 'placement')}</Chip></Link>
                    </div>
                    <p className="text-sm tabular-nums">
                      <span className="text-muted">Default rates </span>
                      <span className="font-semibold">{money(t.bill_rate)}</span> bill · <span className="font-semibold">{money(t.pay_rate)}</span> pay ·{' '}
                      <span className={cx('font-semibold', e.margin < 0 ? 'text-bad' : 'text-good')}>{money(e.margin)}/h margin ({pctText(e.pct)})</span>
                    </p>
                    <ul className="flex flex-wrap gap-1.5" aria-label="What it takes">
                      <li><Chip icon="calendar">{t.min_days ? `${plural(t.min_days, 'day')} in` : 'No wait'}</Chip></li>
                      <li><Chip icon="book">{t.required_modules.length ? plural(t.required_modules.length, 'required module') : 'No modules'}</Chip></li>
                      <li><Chip icon="star">{num(t.min_checkin_score) > 0 ? `Check-ins ${scoreText(num(t.min_checkin_score))}+` : 'No score needed'}</Chip></li>
                    </ul>
                    {t.required_modules.length > 0 && (
                      <p className="text-[13px] text-muted break-words">{t.required_modules.map(titleOf).join(', ')}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1 -ml-2">
                      <Button size="sm" variant="ghost" icon="pen" onClick={() => setEditing(t)}>Edit</Button>
                      <IconButton icon="chevronUp" label={i > 0 ? `Move ${t.name} before ${all[i - 1]!.name}` : `${t.name} is the first tier`} disabled={i === 0 || !!busy} onClick={() => move(i, -1)} />
                      <IconButton icon="chevronDown" label={i < all.length - 1 ? `Move ${t.name} after ${all[i + 1]!.name}` : `${t.name} is the top tier`} disabled={i === all.length - 1 || !!busy} onClick={() => move(i, 1)} />
                      <IconButton icon="trash" label={`Delete ${t.name}`} onClick={() => remove(t)} className="text-bad" />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      {res.data && noTier > 0 && <p className="text-sm text-muted px-1">{plural(noTier, 'open placement has', 'open placements have')} no tier yet.</p>}

      {editing && res.data && (
        <TierSheet tier={editing === 'new' ? null : editing} tiers={res.data.tiers} modules={res.data.modules}
          onClose={() => setEditing(null)} onDone={res.reload} />
      )}
      {dialog}
    </div>
  );
}

const TRACK_ORDER: Track[] = ['company', 'role', 'continued'];

function TierSheet({ tier, tiers, modules, onClose, onDone }: { tier: Tier | null; tiers: Tier[]; modules: Mod[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const top = tiers.reduce((m, t) => Math.max(m, t.level), 0);
  const [name, setName] = useState(tier?.name || '');
  const [level, setLevel] = useState(String(tier?.level ?? Math.min(20, top + 1)));
  const [desc, setDesc] = useState(tier?.description || '');
  const [bill, setBill] = useState(tier ? String(num(tier.bill_rate)) : '');
  const [pay, setPay] = useState(tier ? String(num(tier.pay_rate)) : '');
  const [req, setReq] = useState<string[]>(tier?.required_modules || []);
  const [days, setDays] = useState(String(tier?.min_days ?? 0));
  const [score, setScore] = useState(String(num(tier?.min_checkin_score ?? 0)));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const billN = parseNum(bill), payN = parseNum(pay);
  const e = econ(1, billN ?? 0, payN ?? 0);
  const published = modules.filter((m) => m.status === 'published' || req.includes(m.id));

  async function save(ev?: FormEvent) {
    ev?.preventDefault();
    setError('');
    const x: Record<string, string> = {};
    const lv = Number(level), d = Number(days), sc = Number(score);
    if (!name.trim()) x.name = 'Name the tier, like Skilled specialist.';
    if (!Number.isInteger(lv) || lv < 1 || lv > 20) x.level = 'Use a whole number from 1 to 20.';
    if (billN === null || billN < 0) x.bill = 'Enter the default bill rate.';
    if (payN === null || payN < 0) x.pay = 'Enter the default pay rate.';
    if (!Number.isInteger(d) || d < 0 || d > 3650) x.days = 'Enter 0 or more days.';
    if (!Number.isFinite(sc) || sc < 0 || sc > 5) x.score = 'Enter 0 to 5. Use 0 for no minimum.';
    setErrs(x);
    if (Object.keys(x).length) { focusInvalid('core-tier-form'); return; }
    setBusy(true);
    const row = {
      name: name.trim().slice(0, 60), level: lv, description: desc.trim(), bill_rate: billN, pay_rate: payN,
      required_modules: req, min_days: d, min_checkin_score: Math.round(sc * 100) / 100,
    };
    const { error: err } = tier ? await supabase.from('ramp_tiers').update(row).eq('id', tier.id) : await supabase.from('ramp_tiers').insert(row);
    if (err) { setError(errText(err)); setBusy(false); return; }
    toast(tier ? `${row.name} saved.` : `${row.name} added.`);
    onDone();
    onClose();
  }

  return (
    <Sheet open wide onClose={() => (busy ? undefined : onClose())} title={tier ? `Edit ${tier.name}` : 'Add a tier'}
      subtitle="Default rates fill in new placements at this tier. Requirements decide when someone is flagged as ready to move up to it."
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="core-tier-form" loading={busy} icon="check">{tier ? 'Save tier' : 'Add tier'}</Button></>}>
      <form id="core-tier-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Field label="Name" required error={errs.name}><Input value={name} maxLength={60} onChange={(ev) => setName(ev.target.value)} aria-invalid={!!errs.name} placeholder="Skilled specialist" /></Field>
          <Field label="Level" required error={errs.level} hint="Higher is more senior.">
            <Input type="number" inputMode="numeric" min={1} max={20} step={1} value={level} onChange={(ev) => setLevel(ev.target.value)} aria-invalid={!!errs.level} className="tabular-nums" />
          </Field>
        </div>
        <Field label="Description" hint="What someone at this tier can do. Clients see it on their portal; team members see it on My work.">
          <Textarea rows={2} value={desc} maxLength={500} onChange={(ev) => setDesc(ev.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default bill rate" required error={errs.bill} hint="Per hour, to the client."><MoneyInput value={bill} onChange={setBill} aria-invalid={!!errs.bill} /></Field>
          <Field label="Default pay rate" required error={errs.pay} hint="Per hour, to the team member."><MoneyInput value={pay} onChange={setPay} aria-invalid={!!errs.pay} /></Field>
        </div>
        <p className={cx('text-sm font-semibold tabular-nums -mt-1', e.margin < 0 ? 'text-bad' : 'text-good')} aria-live="polite">
          {money(e.margin)}/h margin ({pctText(e.pct)} of the bill rate){e.margin < 0 ? '. The pay rate is higher than the bill rate.' : ''}
        </p>

        <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted mt-1">To reach this tier</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Days since starting" error={errs.days} hint="0 for no wait.">
            <Input type="number" inputMode="numeric" min={0} max={3650} step={1} value={days} onChange={(ev) => setDays(ev.target.value)} aria-invalid={!!errs.days} className="tabular-nums" />
          </Field>
          <Field label="Check-in average" error={errs.score} hint="Last 3 scores, 1 to 5. 0 for none.">
            <Input type="number" inputMode="decimal" min={0} max={5} step={0.1} value={score} onChange={(ev) => setScore(ev.target.value)} aria-invalid={!!errs.score} className="tabular-nums" />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[13px] font-semibold text-ink-2 mb-1">Required modules {req.length > 0 && <span className="text-muted font-normal">· {req.length} picked</span>}</legend>
          {published.length === 0 && <p className="text-sm text-muted">No published modules yet.</p>}
          {TRACK_ORDER.map((track) => {
            const list = published.filter((m) => m.track === track);
            if (!list.length) return null;
            return (
              <div key={track} className="flex flex-col">
                <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted mt-2">{TRACKS[track].label}</p>
                {list.map((m) => (
                  <Checkbox key={m.id} checked={req.includes(m.id)} onChange={(on) => setReq((r) => (on ? [...r, m.id] : r.filter((x) => x !== m.id)))}
                    label={m.title} hint={m.status !== 'published' ? 'Draft: nobody can complete it until it’s published.' : undefined} />
                ))}
              </div>
            );
          })}
        </fieldset>
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
