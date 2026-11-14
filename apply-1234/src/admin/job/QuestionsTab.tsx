import { useState } from 'react';
import type { Job, Question, StepType } from '../../lib/types';
import { aiStepsPrompt, parseSteps } from '../../lib/posting';
import { applyAiSteps, newStep } from '../../lib/steps';
import { Button, Card, CopyButton, Field, Modal, SectionTitle, Segmented, Textarea } from '../../ui';
import type { Patch } from '../JobEditor';
import StepsEditor from './StepsEditor';

export default function QuestionsTab({ job, patch }: { job: Job; patch: Patch }) {
  const qs = job.questions || [];
  const setQs = (questions: Question[]) => patch({ questions });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteType, setPasteType] = useState<StepType>('video');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const aiSteps = parseSteps(aiText.split('\n'));

  const addParsed = () => {
    const lines = paste.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter((l) => l.length > 3);
    setQs([...qs, ...lines.map((text) => newStep(pasteType, text))]);
    setPaste('');
    setPasteOpen(false);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <StepsEditor steps={qs} onChange={setQs} activity={job.activity} jobId={job.id} title={job.title} notes={job.notes}
          live={job.status === 'published'} compact={qs.length > 3} />
      </div>
      <div className="space-y-5">
        <Card>
          <SectionTitle sub="Fills in the steps above from your notes and posting, keeping each step’s type.">Write with AI</SectionTitle>
          <CopyButton className="w-full" size="md" label={`Copy prompt for these ${qs.length || ''} steps`.replace('  ', ' ')} done="Prompt copied. Paste the AI’s reply below."
            text={() => aiStepsPrompt(job.title, job.notes, job.posting, qs)} />
          <Button className="w-full mt-2" variant="ghost" disabled={!qs.length} onClick={() => setAiOpen(true)}>Paste the AI’s reply</Button>
          <Button className="w-full mt-1" variant="ghost" onClick={() => setPasteOpen(true)}>Paste a list of questions</Button>
        </Card>
        <Card>
          <SectionTitle>Steps that are hard to fake</SectionTitle>
          <ul className="text-sm text-ink-2 space-y-2 leading-relaxed list-disc pl-4">
            <li>Use your real material: your page, your numbers, a real customer email. AI can’t know it.</li>
            <li>Ask about their own experience: “a time you…”, “your role and the result”.</li>
            <li>A timed quick scenario leaves no time to look things up.</li>
            <li>Pair written work with a short walkthrough video. People who did the work explain it easily.</li>
            <li>Keep it to 2 videos and under an hour; 30–45 minutes is best. Longer activities lose strong candidates.</li>
          </ul>
        </Card>
      </div>

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste questions">
        <Field label="One question per line" hint="Numbering and bullets are removed automatically.">
          <Textarea rows={8} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} />
        </Field>
        <div className="mt-3 flex items-center gap-3 text-sm">
          Add them as
          <Segmented size="sm" value={pasteType} onChange={setPasteType}
            options={[{ id: 'video', label: 'Video answers' }, { id: 'written', label: 'Written answers' }, { id: 'choice', label: 'Their choice' }]} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setPasteOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={addParsed} disabled={!paste.trim()}>Add questions</Button>
        </div>
      </Modal>

      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="Paste the AI’s reply">
        <Field label="The AI’s reply" hint="It should have “## Step 1”, “## Step 2” and so on. Step types and settings stay as they are; only the wording and options change.">
          <Textarea rows={10} mono autoFocus value={aiText} onChange={(e) => setAiText(e.target.value)} />
        </Field>
        {aiText.trim() && (
          <p className={aiSteps.length ? 'text-sm text-good mt-2' : 'text-sm text-warn mt-2'}>
            {aiSteps.length ? `Found ${aiSteps.length} step${aiSteps.length === 1 ? '' : 's'}${aiSteps.length !== qs.length ? ` (you have ${qs.length}; extra ones are ignored)` : ''}.` : 'No “## Step 1” blocks found yet.'}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!aiSteps.length} onClick={() => { setQs(applyAiSteps(qs, aiSteps)); setAiText(''); setAiOpen(false); }}>Update steps</Button>
        </div>
      </Modal>
    </div>
  );
}
