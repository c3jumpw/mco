import { useEffect, useState } from 'react';
import type { Job } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { aiPostingPrompt, mdToHtml, placedParts } from '../../lib/posting';
import { fmtDate } from '../../lib/util';
import { Button, Card, CopyButton, Field, Input, Pill, SectionTitle, Segmented, Textarea, useToast } from '../../ui';
import type { Patch } from '../JobEditor';

interface Version { id: string; label: string; posting: string; created_at: string }

export default function PostingTab({ job, patch }: { job: Job; patch: Patch }) {
  const toast = useToast();
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [versions, setVersions] = useState<Version[]>([]);
  const [label, setLabel] = useState('');
  const [showVersion, setShowVersion] = useState<Version | null>(null);
  const total = job.fragments.length;
  const { placed, missing } = placedParts(job.posting, total);

  const loadVersions = () =>
    supabase.from('hiring_posting_versions').select('*').eq('job_id', job.id).order('created_at', { ascending: false })
      .then(({ data }) => setVersions((data || []) as Version[]));
  useEffect(() => { loadVersions(); }, [job.id]);

  const saveVersion = async () => {
    const { error } = await supabase.from('hiring_posting_versions').insert({ job_id: job.id, label: label.trim() || `Version ${versions.length + 1}`, posting: job.posting });
    if (error) toast(error.message, 'bad');
    else { setLabel(''); toast('Version saved'); loadVersions(); }
  };

  const insertToken = (n: number) => {
    const el = document.querySelector<HTMLTextAreaElement>('#posting-editor');
    const token = `{{part${n}}}`;
    if (!el) { patch({ posting: job.posting + `\n\n${token}\n` }); return; }
    const s = el.selectionStart ?? job.posting.length;
    const e = el.selectionEnd ?? s;
    const next = job.posting.slice(0, s) + token + job.posting.slice(e);
    patch({ posting: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5 min-w-0">
        <Card>
          <SectionTitle sub="Everything you know about the role. Only you see this. It feeds the AI prompts below.">Your notes</SectionTitle>
          <Textarea rows={6} value={job.notes} placeholder="What the person will own, must-haves, nice-to-haves, schedule, pay, team, what thriving looks like…"
            onChange={(e) => patch({ notes: e.target.value })} />
          <div className="flex flex-wrap gap-2 mt-3">
            <CopyButton label="Copy AI prompt: draft the posting" done="Prompt copied. Paste it into Claude, then paste the posting back below."
              text={() => aiPostingPrompt(job.title, job.notes, Math.max(total, 1), job.hint_format)} />
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[15px] font-semibold">Posting</h3>
              <p className="text-[13px] text-muted mt-0.5">Markdown. Place {'{{part1}}'}–{`{{part${total}}}`} where each link piece should appear.</p>
            </div>
            <Segmented value={view} onChange={setView} options={[{ id: 'edit', label: 'Edit' }, { id: 'preview', label: 'Preview' }]} />
          </div>
          {view === 'edit' ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-[12px] text-muted mr-1">Insert:</span>
                {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => insertToken(n)}
                    className="font-mono text-[12px] rounded-md border border-line px-2 py-1 hover:border-ink/40 bg-paper">
                    {`{{part${n}}}`} {placed.includes(n) ? <span className="text-good">✓</span> : <span className="text-warn">•</span>}
                  </button>
                ))}
              </div>
              <Textarea id="posting-editor" mono rows={18} value={job.posting} onChange={(e) => patch({ posting: e.target.value })} />
            </>
          ) : (
            <div className="rounded-xl border border-line p-5 bg-paper/50">
              <h1 className="font-display text-4xl leading-tight">{job.title}</h1>
              <div className="prose-posting" dangerouslySetInnerHTML={{ __html: mdToHtml(job.posting, 'hint', job.fragments, job.hint_format) }} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.length === 0
              ? <Pill tone="good">All {total} pieces placed</Pill>
              : <Pill tone="warn">Not placed yet: {missing.map((m) => `part${m}`).join(', ')}</Pill>}
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <SectionTitle sub="Snapshot the posting before you revise it.">Versions</SectionTitle>
          <div className="flex gap-2">
            <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button onClick={saveVersion}>Save</Button>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {versions.length === 0 && <li className="text-sm text-muted py-2">No versions yet.</li>}
            {versions.map((v) => (
              <li key={v.id} className="py-2.5 flex items-center justify-between gap-2">
                <button className="text-left min-w-0" onClick={() => setShowVersion(showVersion?.id === v.id ? null : v)}>
                  <p className="text-sm font-medium truncate">{v.label}</p>
                  <p className="text-[12px] text-muted">{fmtDate(v.created_at)}</p>
                </button>
                <Button size="sm" variant="ghost" onClick={() => {
                  if (confirm('Replace the current posting with this version? Save the current one first if you want to keep it.')) patch({ posting: v.posting });
                }}>Restore</Button>
              </li>
            ))}
          </ul>
          {showVersion && (
            <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-paper p-3 text-[12px] font-mono whitespace-pre-wrap">{showVersion.posting}</pre>
          )}
        </Card>
        <Card>
          <SectionTitle>Writing tips</SectionTitle>
          <ul className="text-sm text-ink-2 space-y-2 leading-relaxed list-disc pl-4">
            <li>Spread the pieces across sections so only someone who reads everything finds them all.</li>
            <li>Tell candidates the link is hidden, but not where. That keeps the test fair without giving it away.</li>
            <li>Save a version before each round of revisions so you can compare and roll back.</li>
          </ul>
        </Card>
        <Field label="Hint line format" hint="How each piece appears in the posting. Use {n}, {total} and {text}.">
          <Input mono value={job.hint_format} onChange={(e) => patch({ hint_format: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}
