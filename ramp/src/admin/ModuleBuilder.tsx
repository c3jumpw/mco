import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { BLOCKS, TRACKS, cx, plural, uid } from '../lib/util';
import { stepCount } from '../lib/plan';
import type { Block, BlockType, Module, Track } from '../lib/types';
import { Button, Card, EmptyState, ErrorBox, Field, Icon, Input, LinkButton, Notice, PageHeader, Pills, Select, Skeleton, Switch, Textarea, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, ListEditor, SaveBar, SectionHead, StatusChip, move, moduleTexts, placeholdersIn, same, useLeaveGuard } from './parts/setup-kit';
import { BLOCK_ICON, BlockCard, blockIssues, newBlock, tidyBlock, type BlockItem, type Tpl } from './parts/setup-block-editors';

interface Data { m: Module | null; templates: Tpl[]; roleTracks: number }

interface Draft {
  title: string; track: Track; summary: string; minutes: string; objectives: string[]; items: BlockItem[];
  pass_score: number; mentor_review: boolean; due_days: string; required: boolean; guest_visible: boolean;
}

type Row = Pick<Module, 'title' | 'track' | 'summary' | 'minutes' | 'objectives' | 'blocks' | 'pass_score' | 'mentor_review' | 'due_days' | 'required' | 'guest_visible'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASS = [0, 50, 60, 70, 75, 80, 90, 100];
const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[];

const toDraft = (m: Module): Draft => ({
  title: m.title, track: m.track, summary: m.summary || '', minutes: String(m.minutes ?? 10), objectives: m.objectives || [],
  items: (m.blocks || []).map((b) => ({ id: uid(), b })), pass_score: m.pass_score || 0, mentor_review: !!m.mentor_review,
  due_days: m.due_days == null ? '' : String(m.due_days), required: !!m.required, guest_visible: !!m.guest_visible,
});

const intOr = (s: string, fallback: number) => (/^\d+$/.test(s.trim()) ? parseInt(s.trim(), 10) : fallback);

function toRow(d: Draft): Row {
  return {
    title: d.title.trim(),
    track: d.track,
    summary: d.summary.trim(),
    minutes: intOr(d.minutes, 0),
    objectives: d.objectives.map((o) => o.trim()).filter(Boolean),
    blocks: d.items.map((i) => tidyBlock(i.b)),
    pass_score: d.pass_score,
    mentor_review: d.mentor_review,
    due_days: d.due_days.trim() === '' ? null : intOr(d.due_days, -1),
    required: d.track === 'company' && d.required,
    guest_visible: d.guest_visible,
  };
}

/** Problems with the basic fields that stop any save. */
function basicErrors(d: Draft) {
  const e: { title?: string; minutes?: string; due_days?: string } = {};
  if (!d.title.trim()) e.title = 'Give the module a title.';
  else if (d.title.trim().length > 120) e.title = 'Keep the title to 120 characters or fewer.';
  const min = intOr(d.minutes, 0);
  if (min < 1 || min > 10000) e.minutes = 'Enter the minutes it takes, from 1 to 10,000.';
  if (d.due_days.trim() !== '') {
    const dd = intOr(d.due_days, -1);
    if (dd < 0 || dd > 365) e.due_days = 'Use a number of days from 0 to 365, or leave it empty.';
  }
  return e;
}

export default function ModuleBuilder() {
  const { id = '' } = useParams();
  const { data, error, loading, reload, setData } = useAsync<Data>(async () => {
    if (!UUID.test(id)) return { m: null, templates: [], roleTracks: 0 };
    const [m, templates, links] = await Promise.all([
      q<Module | null>(supabase.from('ramp_modules').select('*').eq('id', id).maybeSingle()),
      q<Tpl[]>(supabase.from('ramp_templates').select('id, title, status, kind').order('sort')),
      supabase.from('ramp_role_modules').select('module_id', { count: 'exact', head: true }).eq('module_id', id),
    ]);
    if (links.error) throw links.error;
    return { m, templates, roleTracks: links.count || 0 };
  }, [id]);
  useTitle(data?.m ? `${data.m.title} · Training` : 'Module');

  const header = (title: string) => <PageHeader back={ADMIN_BACK} eyebrow={<Eyebrow />} title={title} />;
  if (loading && !data) return <div className="flex flex-col gap-6">{header('Module')}<Skeleton rows={6} /></div>;
  if (error && !data) return <div className="flex flex-col gap-6">{header('Module')}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data?.m) {
    return (
      <div className="flex flex-col gap-6">
        {header('Module not found')}
        <Card><EmptyState icon="book" title="This module doesn’t exist" body="It may have been deleted. Go back to your modules to pick another one or start a new one."
          action={<LinkButton to="/admin/training" variant="primary">All modules</LinkButton>} /></Card>
      </div>
    );
  }
  return <Builder key={data.m.id} data={data as Data & { m: Module }} onSaved={(m) => setData((d) => ({ ...(d as Data), m }))} />;
}

function Eyebrow() {
  return <>Set up · <Link to="/admin/training" className="text-brand-ink underline-offset-2">Training modules</Link></>;
}

function Builder({ data, onSaved }: { data: Data & { m: Module }; onSaved: (m: Module) => void }) {
  const m = data.m;
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const savedRow = useMemo(() => toRow(toDraft(m)), [m]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(m));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'' | 'save' | 'publish' | 'unpublish' | 'preview'>('');
  const [checked, setChecked] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const issuesRef = useRef<HTMLDivElement>(null);
  const row = toRow(draft);
  const dirty = !same(row, savedRow);
  const { dialog: leaveDialog, allowLeave } = useLeaveGuard(dirty);
  const basic = basicErrors(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setIssues([]); };
  const setItems = (items: BlockItem[]) => set('items', items);
  const locked = m.builtin === 'practice';
  const hasQuiz = draft.items.some((i) => i.b.type === 'quiz');
  const hasPractice = draft.items.some((i) => i.b.type === 'practice');
  const hasAssignment = draft.items.some((i) => i.b.type === 'assignment');
  const steps = stepCount(row.blocks);

  function review() {
    const errors: string[] = [];
    const warnings: string[] = [];
    Object.values(basic).forEach((e) => e && errors.push(e));
    if (!draft.items.length) errors.push('Add at least one block, like slides or a reading.');
    draft.items.forEach((it, i) => {
      const r = blockIssues(it.b, data.templates);
      const name = `Block ${i + 1} (${BLOCKS[it.b.type].label})`;
      r.errors.forEach((e) => errors.push(`${name}: ${e}`));
      r.warnings.forEach((w) => warnings.push(`${name}: ${w}`));
    });
    const ph = placeholdersIn(moduleTexts(row));
    if (ph.length) warnings.push(`It still has ${plural(ph.length, 'placeholder')} in [brackets], like ${ph[0]}.`);
    if (draft.pass_score > 0 && !hasQuiz) warnings.push('There’s a passing score but no quiz, so the score won’t be checked.');
    if (draft.mentor_review && !hasAssignment && !locked) warnings.push('Mentor review is on, but there’s no assignment for the mentor to look at.');
    return { errors, warnings };
  }

  function showIssues(list: string[]) {
    setIssues(list);
    setChecked(true);
    requestAnimationFrame(() => issuesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function write(extra: Partial<Module> = {}, withDraft = true) {
    const body = withDraft ? { ...row, ...extra } : extra;
    const { data: saved, error } = await supabase.from('ramp_modules').update(body).eq('id', m.id).select().single();
    if (error) throw error;
    const next = saved as Module;
    onSaved(next);
    if (withDraft) {
      // Keep block ids (and so collapsed state) when the saved blocks match what's on screen.
      setDraft((d) => {
        const fresh = toDraft(next);
        return same(fresh.items.map((i) => tidyBlock(i.b)), d.items.map((i) => tidyBlock(i.b))) ? { ...fresh, items: d.items } : fresh;
      });
    }
    return next;
  }

  async function save(): Promise<boolean> {
    const b = Object.values(basic).filter(Boolean) as string[];
    if (b.length) { showIssues(b); return false; }
    if (m.status === 'published') {
      const { errors } = review();
      if (errors.length) { showIssues(errors); return false; }
    }
    setBusy('save');
    try {
      await write();
      toast('Module saved.');
      return true;
    } catch (e) {
      toast(errText(e), 'bad');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function publish() {
    const { errors, warnings } = review();
    if (errors.length) { showIssues(errors); return; }
    const who = row.track === 'company'
      ? (row.required ? `It’s assigned to everyone right away${row.due_days != null ? `, due ${plural(row.due_days, 'day')} after each person’s start date` : ''}.` : 'It shows in the optional library for all staff.')
      : row.track === 'role'
        ? (data.roleTracks ? `People in ${plural(data.roleTracks, 'role track')} get it.` : 'Nobody gets it until you add it to a role’s track on Assign training.')
        : 'Everyone who has graduated gets it.';
    const guests = row.guest_visible ? ' Guests can see it too.' : '';
    const ok = await confirm(warnings.length
      ? { title: 'Publish with warnings?', body: `${warnings.join(' ')} ${who}${guests}`, action: 'Publish anyway' }
      : { title: `Publish ${row.title}?`, body: who + guests, action: 'Publish' });
    if (!ok) return;
    setBusy('publish');
    try {
      await write({ status: 'published' });
      toast(`${row.title} published.`);
      setChecked(false);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  async function unpublish() {
    const ok = await confirm({
      title: `Unpublish ${m.title}?`,
      body: 'People who haven’t finished it won’t see it anymore. Progress and completions so far are kept.',
      action: 'Unpublish',
    });
    if (!ok) return;
    setBusy('unpublish');
    try {
      await write({ status: 'draft' }, false);
      toast(`${m.title} is a draft again.`);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  async function preview() {
    if (dirty) {
      setBusy('preview');
      const b = Object.values(basic).filter(Boolean) as string[];
      if (b.length) { setBusy(''); showIssues(b); return; }
      try {
        await write();
      } catch (e) {
        setBusy('');
        toast(errText(e), 'bad');
        return;
      }
    }
    allowLeave();
    navigate(`/training/${m.id}?preview=1`);
  }

  async function removeBlock(i: number) {
    const it = draft.items[i]!;
    const empty = same(tidyBlock(it.b), tidyBlock(newBlock(it.b.type)));
    if (!empty) {
      const ok = await confirm({ title: `Remove this ${BLOCKS[it.b.type].label.toLowerCase()} block?`, body: 'Its content is removed when you save. Until then you can discard your changes to get it back.', action: 'Remove block', danger: true });
      if (!ok) return;
    }
    setItems(draft.items.filter((_, j) => j !== i));
  }

  function addBlock(type: BlockType) {
    const it = { id: uid(), b: newBlock(type) };
    setItems([...draft.items, it]);
    requestAnimationFrame(() => document.getElementById(`block-${it.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  const allCollapsed = draft.items.length > 0 && draft.items.every((i) => collapsed[i.id]);
  const busyAny = !!busy;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={<Eyebrow />} title={draft.title.trim() || 'Untitled module'}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusChip status={m.status} /><span>{TRACKS[draft.track].label} · {plural(steps, 'step')} · {intOr(draft.minutes, 0)} min</span></span>}
        actions={<>
          <Button icon="eye" onClick={preview} loading={busy === 'preview'} disabled={busyAny}>{dirty ? 'Save and preview' : 'Preview'}</Button>
          {m.status === 'published' && <Button onClick={unpublish} loading={busy === 'unpublish'} disabled={busyAny}>Unpublish</Button>}
        </>} />

      <Card className="flex flex-col gap-5">
        <SectionHead title="Details" />
        <Field label="Title" required error={checked ? basic.title : undefined}>
          <Input value={draft.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder="For example, Client onboarding basics" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Track</span>
          <Pills label="Track" value={draft.track} onChange={(v: Track) => set('track', v)} options={(Object.keys(TRACKS) as Track[]).map((t) => ({ value: t, label: TRACKS[t].label }))} />
          <span className="text-xs text-muted">{TRACKS[draft.track].desc}.{draft.track === 'role' && ' Add it to a role on Assign training.'}</span>
          {m.required && m.track === 'company' && draft.track !== 'company' && (
            <Notice tone="warn" icon="info">Only company-wide modules can be required, so it won’t be assigned to everyone anymore.</Notice>
          )}
        </div>
        <Field label="Summary" hint="One sentence on what it covers. Shown on the training list.">
          <Textarea rows={2} value={draft.summary} maxLength={400} onChange={(e) => set('summary', e.target.value)} />
        </Field>
        <Field label="Minutes to complete" required error={checked ? basic.minutes : undefined} className="max-w-[220px]">
          <Input type="number" inputMode="numeric" min={1} max={10000} value={draft.minutes} onChange={(e) => set('minutes', e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Learning objectives</span>
          <span className="text-xs text-muted -mt-1">What will someone be able to do afterwards? Start each one with a verb.</span>
          <ListEditor items={draft.objectives} onChange={(o) => set('objectives', o)} label="Objective" placeholder="For example, Create and assign a task" empty="No objectives yet." maxLength={200} />
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="blocks-title">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h2 id="blocks-title" className="font-display text-lg font-semibold">Lessons, in order</h2>
            <p className="text-sm text-muted">{draft.items.length ? `${plural(draft.items.length, 'block')}, ${plural(steps, 'step')} for the learner. Each slide is its own step.` : 'Add blocks below. People go through them one step at a time.'}</p>
          </div>
          {draft.items.length > 1 && (
            <Button variant="ghost" icon={allCollapsed ? 'chevronDown' : 'chevronUp'}
              onClick={() => setCollapsed(Object.fromEntries(draft.items.map((i) => [i.id, !allCollapsed])))}>
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
          )}
        </div>
        {locked && <Notice icon="lock">This built-in module runs the interactive practice. You can change its title, summary and settings, but not its lessons.</Notice>}
        {draft.items.length === 0 ? (
          <Card><p className="text-sm text-muted text-center py-4">No lessons yet. Pick a block type below to add the first one.</p></Card>
        ) : (
          <ol className="flex flex-col gap-3">
            {draft.items.map((it, i) => (
              <BlockCard key={it.id} item={it} index={i} count={draft.items.length} collapsed={!!collapsed[it.id]} templates={data.templates}
                locked={locked} showErrors={checked}
                onToggle={() => setCollapsed((c) => ({ ...c, [it.id]: !c[it.id] }))}
                onChange={(b: Block) => setItems(draft.items.map((x) => (x.id === it.id ? { ...x, b } : x)))}
                onMove={(d) => setItems(move(draft.items, i, d))}
                onRemove={() => removeBlock(i)} />
            ))}
          </ol>
        )}
        {!locked && (
          <Card className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Add a block</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {BLOCK_TYPES.map((t) => {
                const off = t === 'practice' && hasPractice;
                return (
                  <button key={t} type="button" onClick={() => addBlock(t)} disabled={off}
                    className="flex items-center gap-3 min-h-14 px-3 py-2 rounded-xl border border-dashed border-[#C9CED6] bg-white text-left hover:bg-brand-soft hover:border-brand cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white">
                    <span className="w-9 h-9 rounded-lg bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={BLOCK_ICON[t]} size={18} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{BLOCKS[t].label}</span>
                      <span className="block text-xs text-muted">{off ? 'Already in this module' : BLOCKS[t].desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </section>

      <Card className="flex flex-col gap-1">
        <SectionHead title="Settings" />
        <SettingRow title="Passing score" desc={hasQuiz ? 'The quiz score needed to finish. Below it, they review and try again.' : 'Only used when the module has a quiz.'}>
          <Select value={String(draft.pass_score)} onChange={(e) => set('pass_score', parseInt(e.target.value, 10))} aria-label="Passing score" style={{ width: 190 }}>
            {[...new Set([...PASS, draft.pass_score])].sort((a, b) => a - b).map((p) => <option key={p} value={p}>{p === 0 ? 'No passing score' : `${p}%`}</option>)}
          </Select>
        </SettingRow>
        <SettingRow title="Mentor review" desc="A mentor or lead approves the work before the module counts as complete.">
          <Switch checked={draft.mentor_review} onChange={(v) => set('mentor_review', v)} label="Mentor review" />
        </SettingRow>
        <SettingRow title="Due date" desc="Days after each person’s start date. Leave empty for no due date." error={checked ? basic.due_days : undefined}>
          <span className="flex items-center gap-2">
            <Input type="number" inputMode="numeric" min={0} max={365} value={draft.due_days} onChange={(e) => set('due_days', e.target.value)}
              placeholder="None" aria-label="Due days after start" style={{ width: 96 }} />
            <span className="text-sm text-muted">days</span>
          </span>
        </SettingRow>
        {draft.track === 'company' ? (
          <SettingRow title="Required for everyone" desc="Assigned automatically to every team member, including people who joined earlier. Turn off to keep it in the optional library.">
            <Switch checked={draft.required} onChange={(v) => set('required', v)} label="Required for everyone" />
          </SettingRow>
        ) : (
          <SettingRow title="Required for everyone" desc={<>Only company-wide modules can be required. {draft.track === 'role' ? <>Assign role modules on <Link to="/admin/assign" className="font-semibold text-brand-ink">Assign training</Link>.</> : 'Continued training goes to everyone who has graduated.'}</>}>
            <Switch checked={false} onChange={() => {}} label="Required for everyone" disabled />
          </SettingRow>
        )}
        <SettingRow title="Visible to guests" desc="Guests, like contractors and candidates, can see and take it." last>
          <Switch checked={draft.guest_visible} onChange={(v) => set('guest_visible', v)} label="Visible to guests" />
        </SettingRow>
      </Card>

      {issues.length > 0 && (
        <div ref={issuesRef}>
          <Notice tone="bad" icon="alert">
            <p className="font-semibold">Fix {issues.length === 1 ? 'this' : 'these'} first:</p>
            <ul className="list-disc pl-5 mt-1">{issues.map((x) => <li key={x}>{x}</li>)}</ul>
          </Notice>
        </div>
      )}

      <SaveBar dirty={dirty} saving={busy === 'save' || busy === 'publish' || busy === 'preview'} note={m.status === 'published' ? 'Published and saved' : 'Draft saved'}>
        {dirty && <Button variant="ghost" onClick={() => { setDraft(toDraft(m)); setIssues([]); setChecked(false); }} disabled={busyAny}>Discard</Button>}
        {(dirty || m.status === 'published') && (
          <Button variant={m.status === 'published' ? 'primary' : 'secondary'} icon="check" onClick={save} loading={busy === 'save'} disabled={!dirty || busyAny}>Save</Button>
        )}
        {m.status === 'draft' && (
          <Button variant="primary" icon="send" onClick={publish} loading={busy === 'publish'} disabled={busyAny}>{dirty ? 'Save and publish' : 'Publish'}</Button>
        )}
      </SaveBar>
      {confirmDialog}
      {leaveDialog}
    </div>
  );
}

function SettingRow({ title, desc, children, error, last }: { title: string; desc: ReactNode; children: ReactNode; error?: string; last?: boolean }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5', !last && 'border-b border-line-2')}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-semibold text-[15px]">{title}</p>
        <p className="text-sm text-muted leading-relaxed">{desc}</p>
        {error && <p className="text-xs font-semibold text-bad mt-1">{error}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
