import { useState } from 'react';
import type { Job, Question } from '../../lib/types';
import { aiQuestionsPrompt } from '../../lib/posting';
import { newQuestionId } from '../data';
import { Button, Card, CopyButton, Empty, Field, Input, Modal, SectionTitle, Textarea } from '../../ui';
import type { Patch } from '../JobEditor';

export default function QuestionsTab({ job, patch }: { job: Job; patch: Patch }) {
  const qs = job.questions || [];
  const setQs = (questions: Question[]) => patch({ questions });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= qs.length) return;
    const next = [...qs];
    [next[i], next[j]] = [next[j], next[i]];
    setQs(next);
  };

  const addParsed = () => {
    const lines = paste.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter((l) => l.length > 3);
    setQs([...qs, ...lines.map((text) => ({ id: newQuestionId(), text }))]);
    setPaste('');
    setPasteOpen(false);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3 min-w-0">
        {qs.length === 0 && (
          <Empty title="No questions yet." action={<div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => setQs([{ id: newQuestionId(), text: '' }])}>Add a question</Button>
            <Button onClick={() => setPasteOpen(true)}>Paste a list</Button>
          </div>}>
            Write questions that someone who thrives in this role could explain well on video. Each becomes a Loom answer box on the activity page.
          </Empty>
        )}
        {qs.map((q, i) => (
          <Card key={q.id}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[12px] text-muted">QUESTION {i + 1}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
                <Button size="sm" variant="ghost" disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
                <Button size="sm" variant="ghost" onClick={() => confirm('Remove this question?') && setQs(qs.filter((x) => x.id !== q.id))}>Remove</Button>
              </div>
            </div>
            <Textarea rows={2} placeholder="e.g. Tell us about a time you had to figure something out with no instructions." value={q.text}
              onChange={(e) => setQs(qs.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)))} />
            <Input className="mt-2 text-sm" placeholder="Guidance for the candidate (optional)" value={q.guidance || ''}
              onChange={(e) => setQs(qs.map((x) => (x.id === q.id ? { ...x, guidance: e.target.value } : x)))} />
          </Card>
        ))}
        {qs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setQs([...qs, { id: newQuestionId(), text: '' }])}>+ Add question</Button>
            <Button variant="ghost" onClick={() => setPasteOpen(true)}>Paste a list</Button>
          </div>
        )}
      </div>
      <div className="space-y-5">
        <Card>
          <SectionTitle sub="Uses your notes and posting.">Draft with AI</SectionTitle>
          <CopyButton className="w-full" size="md" label="Copy prompt for 5 questions" done="Prompt copied. Paste the AI's answer with “Paste a list”."
            text={() => aiQuestionsPrompt(job.title, job.notes, job.posting, 5)} />
          <Button className="w-full mt-2" variant="ghost" onClick={() => setPasteOpen(true)}>Paste the AI's list</Button>
        </Card>
        <Card>
          <SectionTitle>Good questions</SectionTitle>
          <ul className="text-sm text-ink-2 space-y-2 leading-relaxed list-disc pl-4">
            <li>Ask for a specific past situation, not opinions.</li>
            <li>Include one realistic task from the role: “How would you handle…”.</li>
            <li>3–5 questions keeps the activity to about half an hour.</li>
            {job.status === 'published' && <li className="text-warn">This job is live. Submitted answers keep the question wording they were given.</li>}
          </ul>
        </Card>
      </div>
      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste questions">
        <Field label="One question per line" hint="Numbering and bullets are removed automatically.">
          <Textarea rows={8} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setPasteOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={addParsed} disabled={!paste.trim()}>Add questions</Button>
        </div>
      </Modal>
    </div>
  );
}
