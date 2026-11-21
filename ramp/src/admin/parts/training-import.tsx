// Import modules from a RAMP module package: the JSON the RAMP Assistant writes, or a file someone shares.
// Everything comes in as drafts. Pictures in the package are saved privately in RAMP first.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { useMe } from '../../lib/session';
import { q, useAsync } from '../../lib/hooks';
import { stepCount } from '../../lib/plan';
import { TRACKS, cx, plural } from '../../lib/util';
import type { Block, Track } from '../../lib/types';
import { Button, Chip, Field, Icon, Notice, Select, Sheet, Textarea, useToast } from '../../ui';
import { isInteractive } from '../../learn';
import { validateInteractive } from '../../learn/schema';

interface PkgModule {
  title: string; track?: Track; summary?: string; minutes?: number; objectives?: string[]; blocks: Block[];
  pass_score?: number; mentor_review?: boolean; due_days?: number | null; required?: boolean; sort?: number;
}
interface Pkg { format?: number; role?: string; modules: PkgModule[]; media?: Record<string, { mime: string; data: string; width?: number; height?: number; name?: string }> }

/** Accepts the package object, a bare list of modules, one module, or the Assistant's whole reply with a ```json block. */
export function parsePackage(text: string): Pkg {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1]!.trim();
  const v = JSON.parse(t) as unknown;
  if (Array.isArray(v)) return { modules: v as PkgModule[] };
  const o = v as Pkg & PkgModule;
  if (Array.isArray(o.modules)) return o;
  if (Array.isArray(o.blocks)) return { modules: [o] };
  throw new Error('No modules found. Expected {"modules": [...]}.');
}

export function moduleProblems(m: PkgModule, media: Pkg['media']): string[] {
  const p: string[] = [];
  if (!m.title?.trim()) p.push('Missing a title.');
  if (m.title && m.title.length > 120) p.push('Title is longer than 120 characters.');
  if (m.track && !['company', 'role', 'continued'].includes(m.track)) p.push(`Unknown track “${m.track}”.`);
  if (!Array.isArray(m.blocks) || !m.blocks.length) p.push('No blocks.');
  (m.blocks || []).forEach((b, i) => {
    const at = `Step block ${i + 1} (${b?.type})`;
    if (!b || typeof b !== 'object') { p.push(`${at}: not a block.`); return; }
    if (isInteractive(b)) {
      const resolved = resolveRefs(b, media, true);
      for (const e of validateInteractive(resolved)) p.push(`${at}: ${e}`);
    } else if (b.type === 'slides') { if (!Array.isArray(b.slides) || !b.slides.length) p.push(`${at}: no slides.`); }
    else if (b.type === 'quiz') { if (!b.questions?.every((x) => x.q && x.options?.length >= 2 && x.answer >= 0 && x.answer < x.options.length)) p.push(`${at}: a question is incomplete.`); }
    else if (b.type === 'reading') { if (!b.body) p.push(`${at}: no text.`); }
    else if (b.type === 'assignment') { if (!b.prompt) p.push(`${at}: no prompt.`); }
    else if (b.type === 'video') { if (!b.url) p.push(`${at}: no link.`); }
    else if (b.type !== 'form' && b.type !== 'practice') p.push(`${at}: unknown block type.`);
  });
  return p;
}

/** Swap "img:<name>" for uploaded media. With `dry`, just check the picture exists in the package. */
function resolveRefs<T>(v: T, media: Pkg['media'], dry: boolean, ids?: Record<string, string>): T {
  return JSON.parse(JSON.stringify(v).replace(/"img:([\w.-]+)"/g, (_, n: string) => {
    if (dry) return media?.[n] ? '"media:pending"' : '""';
    return ids?.[n] ? `"media:${ids[n]}"` : '""';
  })) as T;
}

export function ImportSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const roles = useAsync(() => q<{ id: string; title: string }[]>(supabase.from('ramp_job_roles').select('id,title').order('title')), [open]);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [role, setRole] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ id: string; title: string }[] | null>(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try { const pkg = parsePackage(text); return { pkg, error: '' }; } catch (e) { return { pkg: null, error: (e as Error).message }; }
  }, [text]);
  const pkg = parsed?.pkg || null;
  const checks = useMemo(() => (pkg ? pkg.modules.map((m) => moduleProblems(m, pkg.media)) : []), [pkg]);
  const ok = !!pkg && checks.every((c) => c.length === 0);
  const hasRole = !!pkg?.modules.some((m) => (m.track || 'role') === 'role');
  const suggested = pkg?.role ? roles.data?.find((r) => r.title.toLowerCase() === pkg.role!.toLowerCase())?.id : undefined;
  const roleId = role || suggested || '';

  async function readFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    setText(await f.text());
    setMade(null);
  }

  async function run() {
    if (!pkg || !ok) return;
    setBusy(true);
    try {
      // 1. pictures
      const ids: Record<string, string> = {};
      for (const [name, m] of Object.entries(pkg.media || {})) {
        const { data, error } = await supabase.from('ramp_media').insert({ name: m.name || name, mime: m.mime || 'image/webp', data: m.data, width: m.width ?? null, height: m.height ?? null }).select('id').single();
        if (error) throw error;
        ids[name] = (data as { id: string }).id;
      }
      // 2. modules, as drafts
      const rows = pkg.modules.map((m, i) => ({
        title: m.title.slice(0, 120), track: m.track || 'role', summary: (m.summary || '').slice(0, 400), minutes: Math.max(1, Math.min(10000, Math.round(m.minutes || 10))),
        objectives: (m.objectives || []).slice(0, 10), blocks: resolveRefs(m.blocks, pkg.media, false, ids), pass_score: Math.max(0, Math.min(100, m.pass_score || 0)),
        mentor_review: !!m.mentor_review, due_days: m.due_days ?? null, required: !!m.required && (m.track || 'role') === 'company',
        guest_visible: false, status: 'draft', sort: m.sort ?? 500 + i, created_by: me.id,
      }));
      const created = await q<{ id: string; title: string; track: Track; sort: number }[]>(supabase.from('ramp_modules').insert(rows).select('id,title,track,sort'));
      // 3. role-track modules onto the chosen role
      if (roleId) {
        const links = created.filter((c) => c.track === 'role').map((c) => ({ job_role_id: roleId, module_id: c.id, sort: c.sort }));
        if (links.length) { const { error } = await supabase.from('ramp_role_modules').insert(links); if (error) throw error; }
      }
      setMade(created);
      toast(`Imported ${plural(created.length, 'module')} as drafts.`);
      onDone();
    } catch (e) {
      toast(errText(e), 'bad');
    } finally { setBusy(false); }
  }

  const close = () => { setText(''); setFileName(''); setMade(null); setRole(''); onClose(); };

  return (
    <Sheet open={open} onClose={close} wide title="Import modules"
      subtitle="Load a RAMP module package: the file the RAMP Assistant writes, or one you were sent. Everything comes in as a draft for you to review."
      footer={made
        ? <Button variant="primary" onClick={close}>Done</Button>
        : <><Button onClick={close}>Cancel</Button><Button variant="primary" icon="download" disabled={!ok} loading={busy} onClick={run}>{pkg ? `Import ${plural(pkg.modules.length, 'module')}` : 'Import'}</Button></>}>
      {made ? (
        <div className="flex flex-col gap-3">
          <Notice tone="good" icon="check">Imported {plural(made.length, 'module')} as drafts. Open each one to preview, adjust and publish.</Notice>
          <ul className="flex flex-col divide-y divide-line-2 rounded-2xl border border-line">
            {made.map((m) => <li key={m.id}><Link to={`/admin/training/${m.id}`} className="flex items-center gap-2 px-4 py-3 no-underline text-ink font-semibold hover:bg-[#FAFBFC]">{m.title}<Icon name="chevronRight" size={16} className="ml-auto text-muted" /></Link></li>)}
          </ul>
        </div>
      ) : (
        <>
          <label className="block">
            <input type="file" accept=".json,application/json,text/plain" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
            <span className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#C9CED6] bg-bg p-4 cursor-pointer hover:border-brand hover:bg-brand-soft">
              <span className="w-10 h-10 rounded-xl bg-white border border-line flex items-center justify-center text-brand-ink"><Icon name="upload" size={20} /></span>
              <span className="min-w-0">
                <span className="block font-semibold">{fileName || 'Choose a package file'}</span>
                <span className="block text-sm text-muted">A .json file. Or paste the Assistant’s reply below.</span>
              </span>
            </span>
          </label>
          <Field label="Or paste it here" error={parsed?.error || undefined}>
            <Textarea rows={5} value={fileName ? '' : text} placeholder='Paste the whole reply, or the JSON starting with {"format": 1, "modules": [ … ] }'
              onChange={(e) => { setFileName(''); setText(e.target.value); setMade(null); }} className="font-mono text-[13px]" />
          </Field>
          {pkg && (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-ink-2">{plural(pkg.modules.length, 'module')}{pkg.media ? ` · ${plural(Object.keys(pkg.media).length, 'picture')}` : ''}</p>
              <ul className="flex flex-col gap-2">
                {pkg.modules.map((m, i) => (
                  <li key={i} className={cx('rounded-2xl border p-3', checks[i]!.length ? 'border-bad/50 bg-bad-soft' : 'border-line bg-white')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.title || 'Untitled'}</span>
                      <Chip>{TRACKS[(m.track || 'role') as Track]?.label || m.track}</Chip>
                      <span className="text-[13px] text-muted">{plural(stepCount(m.blocks || []), 'step')} · {m.minutes || 10} min</span>
                      {checks[i]!.length ? <Chip tone="bad">Needs fixing</Chip> : <Chip tone="good" icon="check">Ready</Chip>}
                    </div>
                    {checks[i]!.length > 0 && <ul className="mt-2 text-[13px] text-bad list-disc pl-4">{checks[i]!.slice(0, 6).map((p) => <li key={p}>{p}</li>)}</ul>}
                  </li>
                ))}
              </ul>
              {!ok && <Notice tone="bad" icon="alert">Fix the problems above (or ask the Assistant to) before importing.</Notice>}
            </div>
          )}
          {hasRole && (
            <Field label="Add the role-track modules to a role" hint="Optional. You can also do this later on Assign training.">
              <Select value={roleId} onChange={(e) => setRole(e.target.value)}>
                <option value="">Don’t add to a role yet</option>
                {(roles.data || []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </Select>
            </Field>
          )}
        </>
      )}
    </Sheet>
  );
}
