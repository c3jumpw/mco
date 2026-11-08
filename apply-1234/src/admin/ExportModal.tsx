import { useState } from 'react';
import type { Job, Stage } from '../lib/types';
import { STAGES } from '../lib/types';
import { exportMarkdown, htmlDocument, type ExportOpts } from '../lib/export';
import { download, slugify } from '../lib/util';
import { eventsFor, groupBy, listApplications, notesFor, reviewsFor } from './data';
import { Button, Modal, Spinner, Toggle, cx, useToast } from '../ui';
import { copyText } from '../lib/util';

export default function ExportModal({ open, onClose, job, appIds }: { open: boolean; onClose: () => void; job: Job; appIds?: string[] }) {
  const [opts, setOpts] = useState<ExportOpts>({ anonymize: false, transcripts: true, signals: true, notes: true });
  const [stages, setStages] = useState<Stage[]>(['new', 'reviewed', 'shortlisted', 'interview', 'offer', 'hired']);
  const [includeTests, setIncludeTests] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const build = async () => {
    let apps = await listApplications(job.id);
    if (appIds) apps = apps.filter((a) => appIds.includes(a.id));
    else {
      apps = apps.filter((a) => stages.includes(a.stage));
      if (!includeTests) apps = apps.filter((a) => !(a.metrics as any)?.preview);
    }
    const ids = apps.map((a) => a.id);
    const [rv, nt, ev] = await Promise.all([reviewsFor(ids), notesFor(ids), eventsFor(ids)]);
    const R = groupBy(rv, (r) => r.application_id), N = groupBy(nt, (n) => n.application_id), E = groupBy(ev, (e) => e.application_id);
    const md = exportMarkdown(job, apps.map((app) => ({ app, reviews: R[app.id] || [], notes: N[app.id] || [], events: E[app.id] || [] })), opts);
    const base = appIds?.length === 1 && apps[0] && !opts.anonymize ? `${slugify(job.title)}-${slugify(apps[0].name)}` : `${slugify(job.title)}-candidates`;
    return { md, base, count: apps.length };
  };

  const run = async (kind: 'md' | 'html' | 'copy') => {
    setBusy(true);
    try {
      const { md, base, count } = await build();
      if (!count) { toast('No candidates match these filters', 'bad'); return; }
      if (kind === 'md') download(`${base}.md`, md, 'text/markdown');
      if (kind === 'html') download(`${base}.html`, htmlDocument(`${job.title}: candidates`, md), 'text/html');
      if (kind === 'copy') { const ok = await copyText(md); toast(ok ? `Copied ${count} candidate${count === 1 ? '' : 's'} as Markdown` : 'Copy failed', ok ? 'good' : 'bad'); }
    } finally { setBusy(false); }
  };

  const set = (p: Partial<ExportOpts>) => setOpts((o) => ({ ...o, ...p }));

  return (
    <Modal open={open} onClose={onClose} title={appIds?.length === 1 ? 'Export candidate' : 'Export candidates'}>
      <p className="text-sm text-muted leading-relaxed">
        Builds one document with the role, questions, rubric and every candidate’s answers, process signals, scores and notes. It opens with instructions for an AI reviewer, so you can paste it straight into Claude or another model.
      </p>
      {!appIds && (
        <div className="mt-5">
          <p className="text-sm font-medium mb-2">Include stages</p>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button key={s.id} onClick={() => setStages((st) => (st.includes(s.id) ? st.filter((x) => x !== s.id) : [...st, s.id]))}
                className={cx('h-8 px-3 rounded-full text-[13px] border', stages.includes(s.id) ? 'bg-ink text-white border-ink' : 'bg-card border-line')}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 space-y-4">
        <Toggle checked={opts.transcripts} onChange={(v) => set({ transcripts: v })} label="Transcripts" hint="Without them, an AI can only read your notes and scores, not what the candidate said." />
        <Toggle checked={opts.signals} onChange={(v) => set({ signals: v })} label="Process signals" hint="Wrong link tries, timing, tab switches and auto-checks." />
        <Toggle checked={opts.notes} onChange={(v) => set({ notes: v })} label="Team notes" />
        <Toggle checked={opts.anonymize} onChange={(v) => set({ anonymize: v })} label="Hide names and emails" hint="Replaces names with “Candidate 1, 2…”. Names typed inside notes or transcripts aren’t removed." />
        {!appIds && <Toggle checked={includeTests} onChange={setIncludeTests} label="Include test submissions" />}
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-6">
        {busy && <Spinner className="self-center mr-2 text-muted" />}
        <Button disabled={busy} onClick={() => run('copy')}>Copy Markdown</Button>
        <Button disabled={busy} onClick={() => run('html')}>Download HTML</Button>
        <Button disabled={busy} variant="primary" onClick={() => run('md')}>Download .md</Button>
      </div>
    </Modal>
  );
}
