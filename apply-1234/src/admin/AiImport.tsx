import { useMemo, useState } from 'react';
import type { Fragment, Job } from '../lib/types';
import { ensureCodeWord, insertMissingTokens, mdToHtml, parseAiJob, placedParts, type ParsedJob } from '../lib/posting';
import { newQuestionId } from './data';
import { Button, Modal, Pill, Textarea, Toggle, cx } from '../ui';
import type { Patch } from './JobEditor';

/** What the app understood from a pasted AI reply, with problems called out. */
export function ParsedSummary({ parsed, parts, fragments, hintFormat, codeWord }:
  { parsed: ParsedJob; parts: number; fragments: Fragment[]; hintFormat: string; codeWord?: string }) {
  const [showPosting, setShowPosting] = useState(false);
  const { missing } = placedParts(parsed.posting, parts);
  const codeMissing = !!codeWord && !parsed.posting.toLowerCase().includes(codeWord.toLowerCase());
  const Row = ({ ok, label, children }: { ok: boolean; label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5">
      <span className={cx('mt-0.5 h-5 w-5 shrink-0 rounded-full text-[11px] flex items-center justify-center font-semibold',
        ok ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn')}>{ok ? '✓' : '!'}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <div className="text-[13px] text-muted mt-0.5">{children}</div>
      </div>
    </div>
  );
  return (
    <div className="divide-y divide-line">
      <Row ok={!!parsed.title} label="Title">{parsed.title || 'Not found. You can type one on the next step.'}</Row>
      <Row ok={!!parsed.posting && !missing.length && !codeMissing} label="Posting">
        {parsed.posting ? `${parsed.posting.split(/\s+/).length} words` : 'Not found.'}
        {missing.length > 0 && <span className="text-warn"> · link piece{missing.length > 1 ? 's' : ''} {missing.join(', ')} missing (added automatically before “How to apply”)</span>}
        {codeMissing && <span className="text-warn"> · code-word sentence missing (added automatically)</span>}
        {parsed.posting && (
          <button className="block mt-1 underline underline-offset-2" onClick={() => setShowPosting(!showPosting)}>{showPosting ? 'Hide preview' : 'Preview posting'}</button>
        )}
        {showPosting && (
          <div className="prose-posting mt-2 rounded-xl border border-line bg-paper/50 p-4 text-ink"
            dangerouslySetInnerHTML={{ __html: mdToHtml(ensureCodeWord(insertMissingTokens(parsed.posting, parts), codeWord), 'hint', fragments, hintFormat) }} />
        )}
      </Row>
      <Row ok={parsed.questions.length > 0} label={`Screening questions (${parsed.questions.length})`}>
        {parsed.questions.length ? (
          <ol className="list-decimal pl-4 space-y-1 text-ink-2">{parsed.questions.map((q, i) => <li key={i}>{q.text}</li>)}</ol>
        ) : 'None found. You can add them later on the Questions tab.'}
      </Row>
      <Row ok={parsed.interview.length > 0} label={`Interview questions (${parsed.interview.length})`}>
        {parsed.interview.length ? `${parsed.interview.filter((q) => q.kind === 'custom').length} custom, ${parsed.interview.filter((q) => q.kind === 'general').length} general` : 'None found. You can add them later.'}
      </Row>
      <Row ok={parsed.rubric.length > 0} label="Rubric">
        {parsed.rubric.length ? parsed.rubric.join(' · ') : 'None found. The default rubric will be used.'}
      </Row>
    </div>
  );
}

/** Applies a pasted AI reply to an existing job (Posting tab). */
export function ImportAiModal({ open, onClose, job, patch }: { open: boolean; onClose: () => void; job: Job; patch: Patch }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseAiJob(text), [text]);
  const parts = job.fragments.length || 3;
  const code = job.activity?.hidden_code || '';
  const [use, setUse] = useState({ title: true, posting: true, questions: true, interview: true, rubric: true });

  const apply = () => {
    const p: Partial<Job> = {};
    if (use.title && parsed.title) p.title = parsed.title;
    if (use.posting && parsed.posting) p.posting = ensureCodeWord(insertMissingTokens(parsed.posting, parts), code);
    if (use.questions && parsed.questions.length) p.questions = parsed.questions.map((q) => ({ id: newQuestionId(), text: q.text, guidance: q.guidance }));
    if (use.interview && parsed.interview.length) p.interview_questions = parsed.interview.map((q) => ({ id: newQuestionId(), text: q.text, kind: q.kind }));
    if (use.rubric && parsed.rubric.length) p.rubric = parsed.rubric;
    patch(p);
    setText('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Paste the AI's reply" wide>
      <p className="text-sm text-muted leading-relaxed">Paste the whole reply. The sections you tick replace what this job has now. Save a posting version first if you want to keep the current one.</p>
      <Textarea rows={8} autoGrow={false} className="mt-3 font-mono text-[13px]" placeholder="# TITLE&#10;…&#10;# POSTING&#10;…" value={text} onChange={(e) => setText(e.target.value)} />
      {text.trim() && (
        <>
          {parsed.sections.length === 0 && (
            <p className="mt-3 rounded-xl bg-warn-soft text-warn text-sm px-4 py-3">No section headings found, so this will be treated as posting text only. For the full import, the reply should use the headings # TITLE, # POSTING, # SCREENING QUESTIONS, # INTERVIEW QUESTIONS and # RUBRIC.</p>
          )}
          <div className="mt-4">
            <ParsedSummary parsed={parsed} parts={parts} fragments={job.fragments} hintFormat={job.hint_format} codeWord={code} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([['title', 'Replace title', !!parsed.title], ['posting', 'Replace posting', !!parsed.posting],
              ['questions', 'Replace screening questions', parsed.questions.length > 0], ['interview', 'Replace interview questions', parsed.interview.length > 0],
              ['rubric', 'Replace rubric', parsed.rubric.length > 0]] as const).filter(([, , has]) => has).map(([k, label]) => (
              <Toggle key={k} checked={use[k]} onChange={(v) => setUse((u) => ({ ...u, [k]: v }))} label={label} />
            ))}
          </div>
          {job.status === 'published' && use.questions && parsed.questions.length > 0 && (
            <div className="mt-3"><Pill tone="warn">This job is live. Candidates mid-application will see the new questions.</Pill></div>
          )}
        </>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!text.trim()} onClick={apply}>Apply to this job</Button>
      </div>
    </Modal>
  );
}
