// Admin › Training › RAMP Assistant: start a Claude chat set up for training builds, compile a build packet from a
// client's input and our own modules, and import what the Assistant writes.
import { useEffect, useMemo, useState } from 'react';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { q, useAsync, useTitle } from '../lib/hooks';
import { stepCount } from '../lib/plan';
import { TRACKS, cx, plural } from '../lib/util';
import type { LaunchGet, Module, Track } from '../lib/types';
import { Button, Card, Checkbox, Field, Icon, Notice, PageHeader, Select, Skeleton, Textarea, useToast } from '../ui';
import { ImportSheet } from './parts/training-import';
import { PROMPT_VERSION, buildPacket, setupPrompt } from '../learn/assistant';
import { FORMAT_VERSION } from '../learn/schema';

interface PlacementRow { id: string; title: string; status: string; client_name: string; member_name: string }

const DEFAULT_GOAL = 'Build a client track of 4–6 interactive modules for this new hire: the client’s business and objectives, the tools they use, their daily routines and checklists, how they communicate, and what great looks like in the first 30, 60 and 90 days. Build on our standard modules below; don’t repeat them.';

export default function Assistant() {
  useTitle('RAMP Assistant');
  const { org, agencyOn, setOrg } = useMe();
  const toast = useToast();
  const data = useAsync(async () => {
    const [modules, placements] = await Promise.all([
      q<Module[]>(supabase.from('ramp_modules').select('*').is('builtin', null).order('track').order('sort')),
      agencyOn ? supabase.from('ramp_placements').select('id,title,status,client:ramp_clients(name),member:ramp_members(full_name,preferred_name)').neq('status', 'ended').order('created_at', { ascending: false })
        .then(({ data: d }) => ((d || []) as unknown as { id: string; title: string; status: string; client: { name: string } | null; member: { full_name: string; preferred_name: string } | null }[])
          .map((p) => ({ id: p.id, title: p.title, status: p.status, client_name: p.client?.name || 'Client', member_name: p.member?.preferred_name || p.member?.full_name || '' })))
        : Promise.resolve([] as PlacementRow[]),
    ]);
    return { modules, placements };
  }, [agencyOn]);

  // Workspace additions to the setup prompt.
  const saved = ((org as unknown as { assistant?: { additions?: string } }).assistant?.additions) || '';
  const [additions, setAdditions] = useState(saved);
  const [savingAdd, setSavingAdd] = useState(false);
  useEffect(() => setAdditions(saved), [saved]);
  const prompt = useMemo(() => setupPrompt(additions), [additions]);

  const [placement, setPlacement] = useState('');
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [full, setFull] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); } catch { toast('Couldn’t copy. Select the text and copy it instead.', 'bad'); }
  }

  async function saveAdditions() {
    setSavingAdd(true);
    try {
      const next = { ...((org as unknown as { assistant?: object }).assistant || {}), additions: additions.trim(), updated_at: new Date().toISOString() };
      const { data: row, error } = await supabase.from('ramp_org').update({ assistant: next }).eq('id', true).select('*').single();
      if (error) throw error;
      setOrg(row as typeof org);
      toast('Saved. New Assistant chats will include your additions.');
    } catch (e) { toast(errText(e), 'bad'); } finally { setSavingAdd(false); }
  }

  async function packet(kind: 'download' | 'copy') {
    setBusy(true);
    try {
      const launch = placement ? await q<LaunchGet>(supabase.rpc('ramp_launch_get', { p_placement: placement })) : null;
      const mods = (data.data?.modules || []).filter((m) => picked.has(m.id));
      const roleText = role.trim() || (launch ? `${launch.placement.title} for ${launch.placement.client.name}` : '');
      const p = buildPacket({ org: org.name, role: roleText, goal, notes, launch, modules: mods, full });
      if (kind === 'copy') { await copy(p.text, 'Packet'); return; }
      const blob = new Blob([p.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const name = `ramp-build-packet-${(launch?.placement.client.name || roleText || 'training').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.html`;
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Packet downloaded. Attach it or paste its text into your Assistant chat.');
    } catch (e) { toast(errText(e), 'bad'); } finally { setBusy(false); }
  }

  const byTrack = (t: Track) => (data.data?.modules || []).filter((m) => m.track === t);
  const ready = !!(notes.trim() || placement || picked.size);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ to: '/admin/training', label: 'Training modules' }} eyebrow="Set up" title="RAMP Assistant"
        subtitle="Turn a client’s notes and your own standard training into interactive modules: build a packet, paste it into an Assistant chat, then import what it writes." />

      <ol className="grid gap-3 md:grid-cols-4">
        {[
          ['sparkle', 'Start the Assistant', 'Copy the setup prompt into a new Claude chat or project.'],
          ['fileText', 'Build a packet', 'The client’s input, your notes and the modules to build on.'],
          ['send', 'Paste it in', 'The Assistant asks a few questions, then writes the modules.'],
          ['download', 'Import', 'Paste the reply into Import. Everything arrives as drafts.'],
        ].map(([icon, t, b], i) => (
          <li key={t} className="rounded-2xl bg-card border border-line p-4 flex flex-col gap-2">
            <span className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-brand text-white font-bold flex items-center justify-center text-sm">{i + 1}</span><Icon name={icon!} size={18} className="text-brand-ink" /></span>
            <p className="font-display font-semibold text-[16px]">{t}</p>
            <p className="text-[14px] text-ink-2 leading-snug">{b}</p>
          </li>
        ))}
      </ol>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">1. Start the Assistant</h2>
            <p className="text-sm text-muted">Setup prompt {PROMPT_VERSION} · module format {FORMAT_VERSION}. It updates with RAMP, so copy it fresh when you start a new Assistant.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="copy" onClick={() => copy(prompt, 'Setup prompt')}>Copy setup prompt</Button>
            <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border border-[#C9CED6] bg-white text-ink text-sm font-semibold no-underline hover:bg-chip"><Icon name="link" size={16} />Open Claude</a>
          </div>
        </div>
        <Notice icon="info">Tip: create a Claude Project called “RAMP Assistant” and paste the prompt as its instructions. Every new chat in it starts set up.</Notice>
        <details className="rounded-xl border border-line">
          <summary className="cursor-pointer px-4 min-h-11 flex items-center font-semibold text-brand-ink">See the full prompt</summary>
          <pre className="px-4 pb-4 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2 max-h-96 overflow-auto">{prompt}</pre>
        </details>
        <Field label="Your additions" hint="Optional instructions for your workspace, added to the prompt: tone, words to use or avoid, standards your team follows.">
          <Textarea rows={3} value={additions} onChange={(e) => setAdditions(e.target.value)} placeholder="For example: We call new hires “team members”. Always include a teach-back at the end of a client track." />
        </Field>
        <div><Button onClick={saveAdditions} loading={savingAdd} disabled={additions.trim() === saved.trim()}>Save additions</Button></div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">2. Build a packet</h2>
          <p className="text-sm text-muted">Everything the Assistant needs in one file. Download it to keep, or copy it to paste.</p>
        </div>
        {data.loading && !data.data ? <Skeleton rows={4} /> : (
          <>
            {agencyOn && (
              <Field label="Placement" hint="Pulls in what the client filled in on their launch plan: company, values, projects, checklists, tools, milestones and schedules.">
                <Select value={placement} onChange={(e) => setPlacement(e.target.value)}>
                  <option value="">No placement</option>
                  {(data.data?.placements || []).map((p) => <option key={p.id} value={p.id}>{p.client_name} · {p.title}{p.member_name ? ` · ${p.member_name}` : ''}</option>)}
                </Select>
              </Field>
            )}
            <Field label="The role and new hire" hint="Paste the job posting or describe the role.">
              <Textarea rows={3} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Executive assistant to the CEO of …" />
            </Field>
            <Field label="Notes, SOPs and goals" hint="Anything from the client or you: call notes, SOPs, their tools and routines, priorities, what great looks like.">
              <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Field label="What to build"><Textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink-2">Our modules to build on {picked.size ? `· ${picked.size} picked` : ''}</span>
                <Checkbox checked={full} onChange={setFull} label="Include their full content" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {(['company', 'role', 'continued'] as Track[]).map((t) => (
                  <div key={t} className="rounded-xl border border-line p-3 flex flex-col gap-1">
                    <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">{TRACKS[t].label}</span>
                    {byTrack(t).length === 0 && <span className="text-sm text-muted">None</span>}
                    {byTrack(t).map((m) => (
                      <label key={m.id} className="flex items-start gap-2 py-1 cursor-pointer">
                        <input type="checkbox" className="mt-1 w-4 h-4 accent-[var(--color-brand)]" checked={picked.has(m.id)}
                          onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} />
                        <span className="text-[14px] leading-snug">{m.title}<span className={cx('block text-[12px]', m.status === 'published' ? 'text-muted' : 'text-warn')}>{plural(stepCount(m.blocks), 'step')}{m.status !== 'published' ? ' · draft' : ''}</span></span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="download" loading={busy} disabled={!ready} onClick={() => packet('download')}>Download packet</Button>
              <Button icon="copy" disabled={!ready || busy} onClick={() => packet('copy')}>Copy packet text</Button>
              {!ready && <span className="self-center text-sm text-muted">Add notes, pick a placement or pick modules first.</span>}
            </div>
          </>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">3. Import what it writes</h2>
          <p className="text-sm text-muted">Paste the Assistant’s whole reply. RAMP checks it, then adds the modules as drafts for you to preview and publish.</p>
        </div>
        <Button variant="primary" icon="upload" onClick={() => setImportOpen(true)}>Import modules</Button>
      </Card>
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} onDone={() => data.reload()} />
    </div>
  );
}
