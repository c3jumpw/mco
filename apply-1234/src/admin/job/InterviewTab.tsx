import { useState } from 'react';
import type { InterviewQuestion, Job } from '../../lib/types';
import { aiInterviewPrompt, GENERAL_INTERVIEW_QUESTIONS } from '../../lib/posting';
import { DEFAULT_CONFIRM, DEFAULT_SETTINGS, newQuestionId } from '../data';
import { Button, Card, CopyButton, Field, Input, Modal, Pill, SectionTitle, Segmented, Textarea, Toggle } from '../../ui';
import type { Patch } from '../JobEditor';

export default function InterviewTab({ job, patch }: { job: Job; patch: Patch }) {
  const iq = job.interview_questions || [];
  const setIq = (interview_questions: InterviewQuestion[]) => patch({ interview_questions });
  const s = { ...DEFAULT_SETTINGS, ...(job.settings || {}) };
  const setS = (p: Partial<typeof s>) => patch({ settings: { ...s, ...p } });
  const [newKind, setNewKind] = useState<'general' | 'custom'>('custom');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [rubricDraft, setRubricDraft] = useState('');

  const addGeneral = () => {
    const have = new Set(iq.map((q) => q.text));
    setIq([...iq, ...GENERAL_INTERVIEW_QUESTIONS.filter((t) => !have.has(t)).map((text) => ({ id: newQuestionId(), text, kind: 'general' as const }))]);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5 min-w-0">
        <Card>
          <SectionTitle sub="General questions work for any role. Custom ones are written for this job. Mix both for a hybrid interview.">Interview questions</SectionTitle>
          <div className="space-y-2">
            {iq.map((q, i) => (
              <div key={q.id} className="flex items-start gap-2">
                <span className="font-mono text-[12px] text-muted pt-3 w-6">{i + 1}</span>
                <Textarea rows={1} className="flex-1" value={q.text} onChange={(e) => setIq(iq.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)))} />
                <button className="pt-2" onClick={() => setIq(iq.map((x) => (x.id === q.id ? { ...x, kind: x.kind === 'general' ? 'custom' : 'general' } : x)))}>
                  <Pill tone={q.kind === 'general' ? 'neutral' : 'accent'}>{q.kind}</Pill>
                </button>
                <button className="pt-2.5 text-muted hover:text-bad text-lg leading-none" aria-label="Remove" onClick={() => setIq(iq.filter((x) => x.id !== q.id))}>×</button>
              </div>
            ))}
            {iq.length === 0 && <p className="text-sm text-muted">No interview questions yet.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Segmented size="sm" value={newKind} onChange={setNewKind} options={[{ id: 'custom', label: 'Custom' }, { id: 'general', label: 'General' }]} />
            <Button size="sm" onClick={() => setIq([...iq, { id: newQuestionId(), text: '', kind: newKind }])}>+ Add</Button>
            <Button size="sm" variant="ghost" onClick={addGeneral}>Add the general set</Button>
            <Button size="sm" variant="ghost" onClick={() => setPasteOpen(true)}>Paste a list</Button>
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Sent automatically from hiring@apply1234.com the moment someone submits. {first}, {name} and {role} are filled in.">Confirmation email</SectionTitle>
          <div className="space-y-4">
            <Toggle checked={!s.confirm_off} onChange={(v) => setS({ confirm_off: !v })}
              label="Email candidates when they submit" hint="Tells them their answers arrived and what happens next. Admin test runs are marked [Test]." />
            {!s.confirm_off && (
              <>
                <Field label="Subject"><Input value={s.confirm_subject ?? DEFAULT_CONFIRM.confirm_subject} onChange={(e) => setS({ confirm_subject: e.target.value })} /></Field>
                <Field label="Message"><Textarea rows={7} value={s.confirm_body ?? DEFAULT_CONFIRM.confirm_body} onChange={(e) => setS({ confirm_body: e.target.value })} /></Field>
                <Field label="Replies go to" hint="Leave blank to use the first person on the hiring team.">
                  <Input type="email" placeholder="you@company.com" value={s.reply_to || ''} onChange={(e) => setS({ reply_to: e.target.value.trim() })} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Opened in your email app from a candidate’s page. {first}, {name}, {role} and {link} are filled in.">Emails</SectionTitle>
          <div className="space-y-4">
            <Field label="Interview invite: subject"><Input value={s.invite_subject} onChange={(e) => setS({ invite_subject: e.target.value })} /></Field>
            <Field label="Interview invite: message"><Textarea rows={6} value={s.invite_body} onChange={(e) => setS({ invite_body: e.target.value })} /></Field>
            <Field label="Rejection: subject"><Input value={s.reject_subject} onChange={(e) => setS({ reject_subject: e.target.value })} /></Field>
            <Field label="Rejection: message"><Textarea rows={5} value={s.reject_body} onChange={(e) => setS({ reject_body: e.target.value })} /></Field>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <SectionTitle sub="Calendly, Cal.com, Google Calendar booking page, etc.">Scheduling link</SectionTitle>
          <Input type="url" placeholder="https://calendly.com/you/interview" value={job.booking_url} onChange={(e) => patch({ booking_url: e.target.value.trim() })} />
          <p className="text-xs text-muted mt-2 leading-relaxed">Goes into the invite email as {'{link}'}. When you send an invite, the candidate moves to “Interview”.</p>
        </Card>
        <Card>
          <SectionTitle sub="Reviewers score each candidate 1–5 on these.">Rubric</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {(job.rubric || []).map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded-full bg-paper-2 pl-3 pr-1.5 py-1 text-sm">
                {r}
                <button className="h-5 w-5 rounded-full hover:bg-line text-muted" onClick={() => patch({ rubric: job.rubric.filter((x) => x !== r) })}>×</button>
              </span>
            ))}
          </div>
          <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); const v = rubricDraft.trim(); if (v && !job.rubric.includes(v)) patch({ rubric: [...job.rubric, v] }); setRubricDraft(''); }}>
            <Input placeholder="Add a criterion" value={rubricDraft} onChange={(e) => setRubricDraft(e.target.value)} />
            <Button type="submit">Add</Button>
          </form>
        </Card>
        <Card>
          <SectionTitle>Draft with AI</SectionTitle>
          <CopyButton className="w-full" size="md" label="Copy prompt for interview questions" done="Prompt copied"
            text={() => aiInterviewPrompt(job.title, job.notes, job.questions.map((q) => q.text))} />
        </Card>
      </div>

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste interview questions">
        <Field label="One per line"><Textarea rows={8} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setPasteOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!paste.trim()} onClick={() => {
            const lines = paste.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter((l) => l.length > 3);
            setIq([...iq, ...lines.map((text) => ({ id: newQuestionId(), text, kind: newKind }))]);
            setPaste(''); setPasteOpen(false);
          }}>Add</Button>
        </div>
      </Modal>
    </div>
  );
}
