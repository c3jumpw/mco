import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMe } from '../lib/session';
import { q, useAsync, useTitle } from '../lib/hooks';
import { cx, plural } from '../lib/util';
import type { Member, Module, Template } from '../lib/types';
import { ADMIN_SECTIONS, type AdminSection } from '../shell/AppShell';
import { Card, Chip, ErrorBox, Icon, LinkButton, PageHeader, Progress, Skeleton, Stat } from '../ui';
import { moduleTexts, placeholdersIn, templateTexts } from './parts/setup-kit';

type Tpl = Pick<Template, 'id' | 'title' | 'status' | 'stage' | 'description' | 'fields' | 'legal_review'>;
type Mod = Pick<Module, 'id' | 'title' | 'status' | 'track' | 'required' | 'summary' | 'objectives' | 'blocks'>;
type Person = Pick<Member, 'id' | 'status' | 'level' | 'onboarded_at'>;

interface Data {
  roles: number;
  depts: number;
  templates: Tpl[];
  modules: Mod[];
  people: Person[];
  requests: number;
  waiting: number;
  orgSaved: boolean;
}

interface Check { key: string; label: string; done: boolean; note: string; to: string }

const names = (list: { title: string }[]) => {
  const t = list.map((x) => x.title);
  return t.length <= 2 ? t.join(' and ') : `${t.slice(0, 2).join(', ')} and ${t.length - 2} more`;
};

export default function AdminHome() {
  useTitle('Admin');
  const { me, org, rank } = useMe();

  const { data, error, loading, reload } = useAsync<Data>(async () => {
    const [roles, depts, templates, modules, people, requests, waiting, audit] = await Promise.all([
      supabase.from('ramp_job_roles').select('id', { count: 'exact', head: true }),
      supabase.from('ramp_departments').select('id', { count: 'exact', head: true }),
      q<Tpl[]>(supabase.from('ramp_templates').select('id, title, status, stage, description, fields, legal_review').order('sort')),
      q<Mod[]>(supabase.from('ramp_modules').select('id, title, status, track, required, summary, objectives, blocks').order('sort')),
      q<Person[]>(supabase.from('ramp_members').select('id, status, level, onboarded_at')),
      supabase.from('ramp_access_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('ramp_progress').select('member_id', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('ramp_audit').select('id').eq('action', 'updated org').limit(1),
    ]);
    for (const r of [roles, depts, requests, waiting, audit]) if (r.error) throw r.error;
    return {
      roles: roles.count || 0, depts: depts.count || 0, templates, modules, people,
      requests: requests.count || 0, waiting: waiting.count || 0, orgSaved: (audit.data || []).length > 0,
    };
  }, []);

  const sections = ADMIN_SECTIONS.filter((s) => !s.ownerOnly || rank === 1);
  const groups = sections.reduce<Record<string, AdminSection[]>>((acc, s) => { (acc[s.group] ||= []).push(s); return acc; }, {});

  let checks: Check[] = [];
  if (data) {
    const tplIssues = data.templates.filter((t) => placeholdersIn(templateTexts(t)).length > 0 || t.legal_review);
    const modIssues = data.modules.filter((m) => placeholdersIn(moduleTexts(m)).length > 0);
    const required = data.modules.filter((m) => m.track === 'company' && m.required);
    const requiredDrafts = required.filter((m) => m.status !== 'published');
    const onboardingPublished = data.templates.filter((t) => t.stage === 'onboarding' && t.status === 'published');
    const others = data.people.filter((p) => p.id !== me.id);
    const brandDone = org.brand_color.toUpperCase() !== '#4338CA' || data.orgSaved;
    const fixTo = (list: { id: string }[], one: string, all: string) => (list.length === 1 ? `${one}/${list[0]!.id}` : all);

    checks = [
      {
        key: 'welcome', label: 'Write your welcome message', to: '/admin/org',
        done: !!org.welcome_message.trim() && !!org.welcome_from.trim() && placeholdersIn([org.welcome_headline, org.welcome_message]).length === 0,
        note: org.welcome_from.trim() ? `Signed by ${org.welcome_from.trim()}` : 'Say who it’s from and make the message your own.',
      },
      {
        key: 'brand', label: 'Choose your brand color', to: '/admin/org', done: brandDone,
        note: brandDone ? 'Your color is on every screen.' : 'Pick a color, then save the organization page.',
      },
      {
        key: 'roles', label: 'Add your job roles', to: '/admin/roles', done: data.roles > 0,
        note: `${plural(data.roles, 'role')} across ${plural(data.depts, 'department')}`,
      },
      {
        key: 'flow', label: 'Review the welcome flow', to: '/admin/flow', done: !!org.flow_reviewed,
        note: org.flow_reviewed ? `${plural((org.flow || []).filter((s) => s.on).length, 'step')} turned on` : 'Check the steps and their order, then save.',
      },
      {
        key: 'docs', label: 'Publish an onboarding document', to: '/admin/documents', done: onboardingPublished.length > 0,
        note: onboardingPublished.length ? `${plural(onboardingPublished.length, 'document')} in the welcome flow` : 'Nothing for new people to fill in or sign yet.',
      },
      {
        key: 'doc_text', label: 'Finish the starter documents', to: fixTo(tplIssues, '/admin/documents', '/admin/documents'), done: tplIssues.length === 0,
        note: tplIssues.length ? `${names(tplIssues)} still ${tplIssues.length === 1 ? 'has' : 'have'} [placeholders] or ${tplIssues.length === 1 ? 'needs' : 'need'} legal review.` : 'No placeholders left.',
      },
      {
        key: 'mod_text', label: 'Finish the starter training', to: fixTo(modIssues, '/admin/training', '/admin/training'), done: modIssues.length === 0,
        note: modIssues.length ? `${names(modIssues)} still ${modIssues.length === 1 ? 'has' : 'have'} [placeholders].` : 'No placeholders left.',
      },
      {
        key: 'required', label: 'Publish the required modules', to: !required.length ? '/admin/assign' : fixTo(requiredDrafts, '/admin/training', '/admin/training'), done: required.length > 0 && requiredDrafts.length === 0,
        note: !required.length ? 'Mark at least one company-wide module as required.' : requiredDrafts.length ? `${names(requiredDrafts)} ${requiredDrafts.length === 1 ? 'is' : 'are'} still a draft, so nobody sees ${requiredDrafts.length === 1 ? 'it' : 'them'}.` : `${plural(required.length, 'module')} assigned to everyone`,
      },
      {
        key: 'invite', label: 'Invite your team', to: '/admin/people', done: others.length > 0,
        note: others.length ? `${plural(others.length, 'person', 'people')} besides you` : 'Invite someone besides yourself.',
      },
    ];
  }
  const doneCount = checks.filter((c) => c.done).length;
  const pct = checks.length ? Math.round((doneCount / checks.length) * 100) : 0;
  const allDone = checks.length > 0 && doneCount === checks.length;

  const active = data?.people.filter((p) => p.status === 'active') || [];
  const inTraining = active.filter((p) => p.level === 'trainee');
  const inWelcome = inTraining.filter((p) => !p.onboarded_at).length;
  const invited = data?.people.filter((p) => p.status === 'invited').length || 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin portal" subtitle={`Set up RAMP for ${org.name}, bring people in and keep an eye on progress.`} />

      {loading && !data && <Skeleton rows={4} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}

      {data && (
        <>
          <Card className="flex flex-col gap-4 rise" as="section">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold leading-snug">{allDone ? 'RAMP is set up' : `Set up RAMP for ${org.name}`}</h2>
                <p className="text-sm text-muted mt-1">
                  {allDone ? 'Every setup step is done. You can change any of it later.' : `${doneCount} of ${checks.length} done. Finish these before your next hire starts.`}
                </p>
              </div>
              <span className={cx('font-display text-2xl font-bold shrink-0', allDone ? 'text-good' : 'text-brand-ink')}>{pct}%</span>
            </div>
            <Progress value={pct} tone={allDone ? 'good' : 'brand'} label="Setup progress" />
            <ul className="flex flex-col -mx-5 -mb-5 border-t border-line-2">
              {checks.map((c) => (
                <li key={c.key} className="flex items-center gap-3 px-5 py-3 border-b border-line-2 last:border-b-0 min-h-16">
                  <span className={cx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', c.done ? 'bg-good-soft text-good' : 'border-2 border-field')}>
                    {c.done && <Icon name="check" size={16} strokeWidth={2.6} />}
                    <span className="sr-only">{c.done ? 'Done:' : 'To do:'}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={cx('block text-[15px] font-semibold', c.done && 'text-ink-2')}>{c.label}</span>
                    <span className="block text-[13px] text-muted leading-snug">{c.note}</span>
                  </span>
                  {c.done
                    ? <Link to={c.to} className="text-sm font-semibold text-brand-ink no-underline min-h-11 px-2 inline-flex items-center shrink-0" aria-label={`Open: ${c.label}`}>Open</Link>
                    : <LinkButton to={c.to} variant="secondary" className="shrink-0">Fix<span className="sr-only">: {c.label}</span></LinkButton>}
                </li>
              ))}
            </ul>
          </Card>

          <section aria-label="Quick stats" className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatLink to="/admin/people" label="Active members" value={active.length} />
            <StatLink to="/admin/metrics" label="In onboarding" value={inTraining.length} hint={inWelcome ? `${inWelcome} in the welcome flow` : 'Trainees in training'} />
            <StatLink to="/admin/people" label="Invited, not joined" value={invited} tone={invited ? 'warn' : undefined} />
            <StatLink to="/admin/people" label="Access requests" value={data.requests} tone={data.requests ? 'warn' : undefined} hint={data.requests ? 'Waiting for you' : undefined} />
            <StatLink to="/team" label="Waiting for review" value={data.waiting} tone={data.waiting ? 'warn' : undefined} className="col-span-2 md:col-span-1" />
          </section>
        </>
      )}

      {Object.entries(groups).map(([group, items]) => (
        <section key={group} className="flex flex-col gap-3" aria-labelledby={`grp-${group}`}>
          <h2 id={`grp-${group}`} className="font-display text-lg font-semibold">{group}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((s) => (
              <Link key={s.to} to={s.to} className="group flex items-start gap-3.5 bg-card border border-line rounded-2xl p-4 no-underline text-ink hover:border-[#C9CED6] hover:bg-[#FAFBFC] min-h-20">
                <span className="w-11 h-11 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={s.icon} size={22} /></span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-[16px]">{s.label}{s.ownerOnly && <Chip>Owner</Chip>}</span>
                  <span className="block text-sm text-muted leading-snug mt-0.5">{s.desc}</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-muted mt-3" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StatLink({ to, className, ...stat }: { to: string; label: string; value: number; hint?: string; tone?: 'warn' | 'good'; className?: string }) {
  return (
    <Link to={to} className={cx('no-underline text-ink rounded-2xl hover:[&>div]:border-[#C9CED6]', className)}>
      <Stat {...stat} />
    </Link>
  );
}
