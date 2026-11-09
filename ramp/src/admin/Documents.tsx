import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { KINDS, STAGES, cx, plural } from '../lib/util';
import type { JobRole, Template, TemplateKind, TemplateStage } from '../lib/types';
import { Button, Card, Chip, EmptyState, ErrorBox, Icon, Notice, PageHeader, Pills, Sheet, Skeleton, useToast } from '../ui';
import { ADMIN_BACK, MetaLine, StatusChip, placeholdersIn, templateTexts } from './parts/setup-kit';
import { DOC_PRESETS, type DocPreset } from './parts/setup-presets';

interface Data { templates: Template[]; roles: Pick<JobRole, 'id' | 'title'>[]; counts: Record<string, number> }

const STAGE_ORDER: TemplateStage[] = ['before', 'onboarding', 'first_week'];
const KIND_TONE: Record<TemplateKind, 'brand' | 'warn' | 'good' | 'neutral'> = { form: 'brand', upload: 'warn', esign: 'good', checklist: 'neutral' };
const KIND_ICON: Record<TemplateKind, string> = { form: 'fileText', upload: 'upload', esign: 'pen', checklist: 'tasks' };

function audienceText(t: Pick<Template, 'audience' | 'job_role_id'>, roles: Pick<JobRole, 'id' | 'title'>[]) {
  if (t.audience === 'candidates') return 'Candidates and guests';
  if (t.audience === 'role') {
    const r = roles.find((x) => x.id === t.job_role_id);
    return r ? `Role: ${r.title}` : 'Role: none picked';
  }
  return 'Everyone';
}

export default function Documents() {
  useTitle('Documents');
  const navigate = useNavigate();
  const toast = useToast();
  const [kind, setKind] = useState<'all' | TemplateKind>('all');
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState('');

  const { data, error, loading, reload } = useAsync<Data>(async () => {
    const [templates, roles, subs] = await Promise.all([
      q<Template[]>(supabase.from('ramp_templates').select('*').order('sort').order('created_at')),
      q<Pick<JobRole, 'id' | 'title'>[]>(supabase.from('ramp_job_roles').select('id, title').order('title')),
      q<{ template_id: string | null }[]>(supabase.from('ramp_submissions').select('template_id')),
    ]);
    const counts: Record<string, number> = {};
    for (const s of subs) if (s.template_id) counts[s.template_id] = (counts[s.template_id] || 0) + 1;
    return { templates, roles, counts };
  }, []);

  async function create(p: DocPreset) {
    if (!data) return;
    setCreating(p.key);
    try {
      const sort = data.templates.reduce((m, t) => Math.max(m, t.sort), 0) + 1;
      const { data: row, error: e } = await supabase.from('ramp_templates')
        .insert({ ...p.t, job_role_id: null, status: 'draft', sort }).select('id').single();
      if (e) throw e;
      toast(`${p.t.title} added as a draft.`);
      navigate(`/admin/documents/${(row as { id: string }).id}`);
    } catch (e) {
      toast(errText(e), 'bad');
      setCreating('');
    }
  }

  const list = (data?.templates || []).filter((t) => kind === 'all' || t.kind === kind);
  const kindsUsed = new Set((data?.templates || []).map((t) => t.kind));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow="Set up" title="Documents"
        subtitle="Forms, uploads, e-signatures and checklists that people complete before they start, during onboarding, or in their first week."
        actions={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)} disabled={!data}>New document</Button>} />

      <Notice icon="lock">Sensitive answers, like ID photos, date of birth and bank details, are encrypted. Only owners and admins can open them, and every view is logged.</Notice>

      {loading && !data && <Skeleton rows={6} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}

      {data && data.templates.length === 0 && (
        <Card>
          <EmptyState icon="fileText" title="No documents yet" body="Start from a ready-made template, like new employee information or payroll, and change what you need."
            action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New document</Button>} />
        </Card>
      )}

      {data && data.templates.length > 0 && (
        <>
          {kindsUsed.size > 1 && (
            <Pills label="Filter by type" value={kind} onChange={setKind} dark
              options={[{ value: 'all' as const, label: 'All' }, ...(Object.keys(KINDS) as TemplateKind[]).filter((k) => kindsUsed.has(k)).map((k) => ({ value: k, label: KINDS[k].label }))]} />
          )}
          {STAGE_ORDER.map((stage) => {
            const rows = list.filter((t) => t.stage === stage);
            if (!rows.length) return null;
            return (
              <section key={stage} className="flex flex-col gap-2" aria-labelledby={`stage-${stage}`}>
                <div className="px-1">
                  <h2 id={`stage-${stage}`} className="font-display text-lg font-semibold">{STAGES[stage].label}</h2>
                  <p className="text-sm text-muted">{STAGES[stage].desc}{stage === 'first_week' && ' when they finish the welcome flow'}.</p>
                </div>
                <Card padded={false} className="overflow-hidden">
                  {rows.map((t) => {
                    const n = data.counts[t.id] || 0;
                    const ph = placeholdersIn(templateTexts(t)).length > 0;
                    const secure = (t.fields || []).some((f) => f.type === 'secure' || f.secure);
                    const roleMissing = t.audience === 'role' && !data.roles.some((r) => r.id === t.job_role_id);
                    return (
                      <Link key={t.id} to={`/admin/documents/${t.id}`}
                        className="flex items-start gap-3 px-4 py-3.5 border-t border-line-2 first:border-t-0 no-underline text-ink hover:bg-[#FAFBFC] min-h-16">
                        <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                          { form: 'bg-brand-soft text-brand-ink', upload: 'bg-warn-soft text-warn', esign: 'bg-good-soft text-good', checklist: 'bg-chip text-ink-2' }[t.kind])}>
                          <Icon name={KIND_ICON[t.kind]} size={20} />
                        </span>
                        <span className="flex-1 min-w-0 flex flex-col gap-1">
                          <span className="font-semibold text-[15px] leading-snug">{t.title}</span>
                          <MetaLine parts={[
                            <span className={cx(roleMissing && 'text-warn font-semibold')}>{audienceText(t, data.roles)}</span>,
                            `Version ${t.version}`,
                            n ? `${plural(n, 'submission')}` : 'No submissions yet',
                          ]} />
                          <span className="flex flex-wrap gap-1.5 mt-0.5">
                            <Chip tone={KIND_TONE[t.kind]}>{KINDS[t.kind].label}</Chip>
                            <StatusChip status={t.status} />
                            {secure && <Chip icon="lock">Encrypted</Chip>}
                            {t.legal_review && <Chip tone="warn" icon="alert">Needs legal review</Chip>}
                            {ph && <Chip tone="warn">Has [placeholders]</Chip>}
                          </span>
                        </span>
                        <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted mt-3" />
                      </Link>
                    );
                  })}
                </Card>
              </section>
            );
          })}
          {list.length === 0 && <p className="text-sm text-muted text-center py-6">No documents of this type yet.</p>}
        </>
      )}

      <Sheet open={newOpen} onClose={() => (creating ? undefined : setNewOpen(false))} title="New document" wide
        subtitle="Start from a template. It’s saved as a draft, so nobody sees it until you publish.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {DOC_PRESETS.map((p) => {
            const have = data?.templates.filter((t) => t.title === p.t.title).length || 0;
            return (
              <li key={p.key}>
                <button type="button" onClick={() => create(p)} disabled={!!creating}
                  className="w-full h-full flex items-start gap-3 text-left rounded-2xl border border-line px-4 py-3.5 bg-white hover:bg-[#FAFBFC] hover:border-[#C9CED6] cursor-pointer disabled:opacity-60 disabled:cursor-wait min-h-16">
                  <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0">
                    {creating === p.key ? <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" /> : <Icon name={p.icon} size={20} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold text-[15px]">
                      {p.label}
                      {p.t.legal_review && <Chip tone="warn">Legal review</Chip>}
                    </span>
                    <span className="block text-[13px] text-muted leading-snug mt-0.5">{p.desc}</span>
                    {have > 0 && p.key !== 'blank' && <span className="block text-xs font-semibold text-warn mt-1">You already have {have === 1 ? 'one' : have}. This adds another copy.</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
