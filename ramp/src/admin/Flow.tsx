import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { q, useAsync, useTitle } from '../lib/hooks';
import { cx, plural } from '../lib/util';
import type { FlowStep, FlowStepId, Org, Template } from '../lib/types';
import { Button, Card, Chip, Icon, LinkButton, Notice, PageHeader, Switch, useToast } from '../ui';
import { ADMIN_BACK, MoveButtons, SaveBar, SectionHead, move, same, useLeaveGuard } from './parts/setup-kit';

const MIDDLE: FlowStepId[] = ['profile', 'practice', 'documents', 'mentor'];

const STEP_INFO: Record<FlowStepId, { label: string; desc: string; icon: string }> = {
  welcome: { label: 'Welcome', icon: 'sparkle', desc: 'They read your welcome message, watch your video if you added one, and see what the next days look like.' },
  profile: { label: 'Your profile', icon: 'users', desc: 'They confirm their name, add a preferred name and phone number, and set their time zone.' },
  practice: { label: 'Practice the platform', icon: 'play', desc: 'A five-minute hands-on sandbox where they try Training, Tasks, Notes and Chat without touching real work.' },
  documents: { label: 'Documents and forms', icon: 'fileText', desc: 'They fill out, upload and sign the onboarding documents you’ve published.' },
  mentor: { label: 'Meet your mentor', icon: 'chat', desc: 'They see who their mentor is and send a first hello.' },
  done: { label: 'All set', icon: 'check', desc: 'A summary of their first modules and due dates. First-week documents become tasks on their list.' },
};

/** Welcome first, done last, every middle step exactly once (missing ones added switched off). */
function normalize(flow: FlowStep[] | null | undefined): FlowStep[] {
  const list = Array.isArray(flow) ? flow : [];
  const middle: FlowStep[] = [];
  for (const s of list) {
    if (MIDDLE.includes(s.id) && !middle.some((m) => m.id === s.id)) middle.push({ id: s.id, on: s.on !== false });
  }
  for (const id of MIDDLE) if (!middle.some((m) => m.id === id)) middle.push({ id, on: !list.length });
  return [{ id: 'welcome', on: true }, ...middle, { id: 'done', on: true }];
}

export default function Flow() {
  useTitle('Welcome flow');
  const { org, setOrg } = useMe();
  const toast = useToast();
  const saved = useMemo(() => normalize(org.flow), [org.flow]);
  const [steps, setSteps] = useState<FlowStep[]>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = !same(steps, saved);
  const { dialog } = useLeaveGuard(dirty);

  const docs = useAsync(() => q<Pick<Template, 'id' | 'status' | 'stage' | 'audience'>[]>(
    supabase.from('ramp_templates').select('id, status, stage, audience').eq('stage', 'onboarding')), []);
  const published = (docs.data || []).filter((t) => t.status === 'published');
  const drafts = (docs.data || []).filter((t) => t.status !== 'published');

  const middle = steps.slice(1, -1);
  const setMiddle = (m: FlowStep[]) => setSteps([steps[0]!, ...m, steps[steps.length - 1]!]);
  const onCount = steps.filter((s) => s.on).length;

  async function save() {
    setSaving(true);
    try {
      const { data, error } = await supabase.from('ramp_org').update({ flow: steps, flow_reviewed: true }).eq('id', true).select().single();
      if (error) throw error;
      setOrg(data as Org);
      setSteps(normalize((data as Org).flow));
      toast(org.flow_reviewed ? 'Welcome flow saved.' : 'Welcome flow saved and marked as reviewed.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setSaving(false);
    }
  }

  let n = 0;
  const row = (s: FlowStep, fixed: boolean, mi = -1) => {
    const info = STEP_INFO[s.id];
    if (s.on) n += 1;
    return (
      <li key={s.id} className={cx('flex items-start gap-3 px-4 sm:px-5 py-4 border-b border-line-2 last:border-b-0', !s.on && 'bg-[#FAFBFC]')}>
        <span className={cx('w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm shrink-0 mt-0.5', s.on ? 'bg-brand text-white' : 'bg-chip text-muted')}
          aria-label={s.on ? `Step ${n}` : 'Off'}>
          {s.on ? n : '–'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={cx('font-semibold text-[15px]', !s.on && 'text-muted')}>{info.label}</span>
            {fixed && <Chip icon="lock">Always on</Chip>}
            {!s.on && <Chip>Skipped</Chip>}
          </p>
          <p className={cx('text-sm leading-relaxed mt-0.5', s.on ? 'text-ink-2' : 'text-muted')}>{info.desc}</p>
          {s.id === 'documents' && (
            <p className="text-sm mt-1.5">
              {docs.loading && !docs.data ? <span className="text-muted">Counting documents…</span>
                : docs.error ? <span className="text-bad">Couldn’t count documents. <button type="button" className="underline cursor-pointer font-semibold" onClick={docs.reload}>Try again</button></span>
                : <Link to="/admin/documents" className={cx('font-semibold no-underline', published.length ? 'text-brand-ink' : 'text-warn')}>
                    {published.length ? `${plural(published.length, 'onboarding document')} published` : 'No onboarding documents published yet'}
                    {drafts.length > 0 && `, ${drafts.length} in draft`}
                    <Icon name="chevronRight" size={14} className="inline ml-0.5 -mt-0.5" strokeWidth={2.2} />
                  </Link>}
            </p>
          )}
          {s.id === 'welcome' && (
            <p className="text-sm mt-1.5"><Link to="/admin/org" className="font-semibold text-brand-ink no-underline">Edit the welcome message<Icon name="chevronRight" size={14} className="inline ml-0.5 -mt-0.5" strokeWidth={2.2} /></Link></p>
          )}
        </div>
        {!fixed && (
          <div className="flex flex-col sm:flex-row items-center gap-0 shrink-0 -my-1">
            <Switch checked={s.on} label={`${info.label}: ${s.on ? 'on' : 'off'}`} onChange={(v) => setMiddle(middle.map((m) => (m.id === s.id ? { ...m, on: v } : m)))} />
            <span className="flex">
              <MoveButtons index={mi} count={middle.length} what={info.label} onMove={(d) => setMiddle(move(middle, mi, d))} />
            </span>
          </div>
        )}
      </li>
    );
  };

  const docsOnButEmpty = steps.find((s) => s.id === 'documents')?.on && docs.data && published.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow="Set up" title="Welcome flow"
        subtitle="The steps every new person goes through the first time they sign in, before they reach their training."
        actions={<LinkButton to="/welcome" icon="eye">Preview as a new hire</LinkButton>} />

      {!org.flow_reviewed && (
        <Notice tone="warn" icon="info">Check each step and its order, then save. Saving marks the welcome flow as reviewed on your setup checklist.</Notice>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="px-4 sm:px-5 pt-5 pb-3">
          <SectionHead title="Steps" subtitle={`${plural(onCount, 'step')} turned on. Welcome and All set always stay first and last. Turn the others on or off and change their order.`} />
        </div>
        <ol className="border-t border-line-2">
          {row(steps[0]!, true)}
          {middle.map((s, i) => row(s, false, i))}
          {row(steps[steps.length - 1]!, true)}
        </ol>
      </Card>

      {docsOnButEmpty && (
        <Notice tone="warn" icon="alert">
          The documents step is on, but no onboarding documents are published, so there’s nothing for new people to do there. <Link to="/admin/documents" className="font-semibold underline">Publish a document</Link> or switch the step off.
        </Notice>
      )}
      {steps.find((s) => s.id === 'practice')?.on === false && (
        <Notice icon="info">With practice switched off, new people can still open the platform sandbox later from Training.</Notice>
      )}

      <SaveBar dirty={dirty} saving={saving} note={org.flow_reviewed ? 'Saved and reviewed' : 'Not reviewed yet'}>
        {dirty && <Button variant="ghost" onClick={() => setSteps(saved)} disabled={saving}>Discard</Button>}
        <Button variant="primary" icon="check" onClick={save} loading={saving} disabled={!dirty && org.flow_reviewed}>
          {!dirty && !org.flow_reviewed ? 'Mark as reviewed' : 'Save flow'}
        </Button>
      </SaveBar>
      {dialog}
    </div>
  );
}
