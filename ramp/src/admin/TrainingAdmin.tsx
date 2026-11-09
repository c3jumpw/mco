import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { q, useAsync, useTitle } from '../lib/hooks';
import { TRACKS, plural } from '../lib/util';
import { stepCount } from '../lib/plan';
import type { Module, RoleModule, Track } from '../lib/types';
import { Button, Card, Chip, EmptyState, ErrorBox, Icon, IconButton, PageHeader, Sheet, Skeleton, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, MetaLine, StatusChip, moduleTexts, placeholdersIn } from './parts/setup-kit';
import { MODULE_PRESETS, type ModulePreset } from './parts/setup-presets';

interface Data { modules: Module[]; done: Record<string, number>; started: Record<string, number>; links: RoleModule[] }

const TRACK_ORDER: Track[] = ['company', 'role', 'continued'];

export default function TrainingAdmin() {
  useTitle('Training modules');
  const { me } = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState('');
  const [busyId, setBusyId] = useState('');

  const { data, error, loading, reload, setData } = useAsync<Data>(async () => {
    const [modules, progress, links] = await Promise.all([
      q<Module[]>(supabase.from('ramp_modules').select('*').order('sort').order('created_at')),
      q<{ module_id: string; status: string }[]>(supabase.from('ramp_progress').select('module_id, status')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
    ]);
    const done: Record<string, number> = {};
    const started: Record<string, number> = {};
    for (const p of progress) {
      if (p.status === 'completed') done[p.module_id] = (done[p.module_id] || 0) + 1;
      started[p.module_id] = (started[p.module_id] || 0) + 1;
    }
    return { modules, done, started, links };
  }, []);

  const nextSort = (track: Track) => (data?.modules || []).filter((m) => m.track === track).reduce((mx, m) => Math.max(mx, m.sort), 0) + 1;

  async function create(p: ModulePreset) {
    setCreating(p.key);
    try {
      const { data: row, error: e } = await supabase.from('ramp_modules').insert({
        ...p.m, required: false, guest_visible: false, status: 'draft', sort: nextSort(p.m.track), created_by: me.id,
      }).select('id').single();
      if (e) throw e;
      toast(`${p.label} added as a draft.`);
      navigate(`/admin/training/${(row as { id: string }).id}`);
    } catch (e) {
      toast(errText(e), 'bad');
      setCreating('');
    }
  }

  async function duplicate(m: Module) {
    setBusyId(m.id);
    try {
      const title = `Copy of ${m.title}`.slice(0, 120);
      const { data: row, error: e } = await supabase.from('ramp_modules').insert({
        title, track: m.track, summary: m.summary, minutes: m.minutes, objectives: m.objectives, blocks: m.blocks,
        pass_score: m.pass_score, mentor_review: m.mentor_review, due_days: m.due_days, required: false,
        guest_visible: m.guest_visible, status: 'draft', sort: m.sort + 1, created_by: me.id,
      }).select().single();
      if (e) throw e;
      setData((d) => ({ ...(d as Data), modules: [...(d as Data).modules, row as Module].sort((a, b) => a.sort - b.sort) }));
      toast(`Made a draft copy: ${title}`);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusyId('');
    }
  }

  async function remove(m: Module) {
    if (!data) return;
    const done = data.done[m.id] || 0;
    const started = data.started[m.id] || 0;
    const roles = data.links.filter((l) => l.module_id === m.id).length;
    const body = [
      started ? `${plural(started, 'person’s', 'people’s')} progress on it, including ${plural(done, 'completion')}, will be deleted with it.` : 'Nobody has started it yet.',
      roles ? `It’s removed from ${plural(roles, 'role track')}.` : '',
      m.status === 'published' && started ? 'To keep the history, unpublish it instead.' : '',
      'This can’t be undone.',
    ].filter(Boolean).join(' ');
    const ok = await confirm({ title: `Delete ${m.title}?`, body, action: 'Delete module', danger: true });
    if (!ok) return;
    const before = data;
    setData((d) => ({ ...(d as Data), modules: (d as Data).modules.filter((x) => x.id !== m.id), links: (d as Data).links.filter((l) => l.module_id !== m.id) }));
    const { error: e } = await supabase.from('ramp_modules').delete().eq('id', m.id);
    if (e) { setData(before); toast(errText(e), 'bad'); return; }
    toast(`${m.title} deleted.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow="Set up" title="Training modules"
        subtitle="Build lessons with slides, readings, videos, quizzes and assignments. Pick who gets them on Assign training."
        actions={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)} disabled={!data}>New module</Button>} />

      {loading && !data && <Skeleton rows={6} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}

      {data && data.modules.length === 0 && (
        <Card>
          <EmptyState icon="book" title="No modules yet" body="Start from a template, like a policy reading with a quiz, and fill in what’s specific to your company."
            action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New module</Button>} />
        </Card>
      )}

      {data && data.modules.length > 0 && TRACK_ORDER.map((track) => {
        const rows = data.modules.filter((m) => m.track === track);
        return (
          <section key={track} className="flex flex-col gap-2" aria-labelledby={`track-${track}`}>
            <div className="px-1">
              <h2 id={`track-${track}`} className="font-display text-lg font-semibold">{TRACKS[track].label}</h2>
              <p className="text-sm text-muted">
                {track === 'company' ? 'For everyone. Required modules are assigned automatically; the rest are an optional library.'
                  : track === 'role' ? 'Added to a job role’s track on Assign training.'
                  : 'Ongoing training for everyone who has graduated.'}
              </p>
            </div>
            {rows.length === 0 ? (
              <Card><p className="text-sm text-muted text-center py-2">No {TRACKS[track].label.toLowerCase()} modules yet.</p></Card>
            ) : (
              <Card padded={false} className="overflow-hidden">
                {rows.map((m) => {
                  const steps = stepCount(m.blocks || []);
                  const ph = placeholdersIn(moduleTexts(m)).length > 0;
                  const roles = data.links.filter((l) => l.module_id === m.id).length;
                  return (
                    <div key={m.id} className="flex items-center gap-1 pr-1 border-t border-line-2 first:border-t-0 hover:bg-[#FAFBFC]">
                      <Link to={`/admin/training/${m.id}`} className="flex-1 min-w-0 flex flex-col gap-1 pl-4 py-3.5 no-underline text-ink min-h-16">
                        <span className="font-semibold text-[15px] leading-snug">{m.title}</span>
                        <MetaLine parts={[
                          `${m.minutes} min`,
                          plural(steps, 'step'),
                          plural(data.done[m.id] || 0, 'completion'),
                          track === 'role' && (roles ? `In ${plural(roles, 'role track')}` : <span className="text-warn font-semibold">Not in any role track</span>),
                        ]} />
                        <span className="flex flex-wrap gap-1.5 mt-0.5">
                          <StatusChip status={m.status} />
                          {m.track === 'company' && m.required && <Chip tone="warn">Required</Chip>}
                          {m.mentor_review && <Chip tone="brand">Mentor review</Chip>}
                          {m.guest_visible && <Chip>Guests can see</Chip>}
                          {m.builtin && <Chip icon="lock">Built in</Chip>}
                          {ph && <Chip tone="warn">Has [placeholders]</Chip>}
                        </span>
                      </Link>
                      {!m.builtin && (
                        <>
                          <IconButton icon="copy" label={`Duplicate ${m.title}`} onClick={() => duplicate(m)} disabled={busyId === m.id} />
                          <IconButton icon="trash" label={`Delete ${m.title}`} onClick={() => remove(m)} className="text-bad" />
                        </>
                      )}
                      {m.builtin && <span className="w-11 h-11 flex items-center justify-center text-muted" title="Built-in modules can’t be deleted"><Icon name="lock" size={18} /><span className="sr-only">Built-in module, can’t be deleted</span></span>}
                    </div>
                  );
                })}
              </Card>
            )}
          </section>
        );
      })}

      <Sheet open={newOpen} onClose={() => (creating ? undefined : setNewOpen(false))} title="New module"
        subtitle="Start from a template so you only fill in what’s specific to your company. It’s saved as a draft until you publish.">
        <ul className="flex flex-col gap-2">
          {MODULE_PRESETS.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => create(p)} disabled={!!creating}
                className="w-full flex items-start gap-3 text-left rounded-2xl border border-line px-4 py-3.5 bg-white hover:bg-[#FAFBFC] hover:border-[#C9CED6] cursor-pointer disabled:opacity-60 disabled:cursor-wait min-h-16">
                <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0">
                  {creating === p.key ? <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" /> : <Icon name={p.icon} size={20} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[15px]">{p.label}</span>
                  <span className="block text-[13px] text-muted leading-snug mt-0.5">{p.desc}</span>
                  <span className="block text-xs text-muted mt-1">{TRACKS[p.m.track].label} · about {p.m.minutes} min{p.m.mentor_review && ' · mentor review'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      {dialog}
    </div>
  );
}
