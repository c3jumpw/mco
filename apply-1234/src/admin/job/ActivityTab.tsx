import { useEffect, useState } from 'react';
import type { Activity, Job, Template } from '../../lib/types';
import { fromLocalInput, minutesLabel, toLocalInput } from '../../lib/util';
import { listTemplates, saveTemplate } from '../data';
import { useRole } from '../role';
import { Button, Card, Field, Input, SectionTitle, Segmented, Select, Textarea, Toggle, useToast } from '../../ui';
import { AI_NONE, AI_WELCOME, needsLoomSetup, stepType, usesLoom } from '../../lib/steps';
import { activityLinks, type Patch } from '../JobEditor';

export default function ActivityTab({ job, patch }: { job: Job; patch: Patch }) {
  const a = job.activity || {};
  const set = (p: Partial<Activity>) => patch({ activity: { ...a, ...p } });
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const admin = useRole() === 'admin';
  useEffect(() => { if (admin) listTemplates('activity').then(setTemplates); }, [admin]);
  const links = activityLinks(job);

  const toSec = (v: string) => (v === '' ? null : Math.round(Number(v) * 60));
  const loomSetup = needsLoomSetup(job.questions);
  const anyVideo = job.questions.some(usesLoom);
  const hasVideoStep = job.questions.some((q) => stepType(q) === 'video');
  const policy = a.ai_policy || 'welcome';

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5 min-w-0">
        <Card>
          <SectionTitle sub="What candidates see when they reach the page.">Welcome</SectionTitle>
          <div className="space-y-4">
            <Field label="Headline"><Input value={a.headline || ''} onChange={(e) => set({ headline: e.target.value })} placeholder="You found it." /></Field>
            <Field label="Introduction" hint="Acknowledge how they got here and say what comes next.">
              <Textarea rows={4} value={a.intro || ''} onChange={(e) => set({ intro: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Candidates see this on the welcome screen and answer it before they submit.">AI</SectionTitle>
          <div className="space-y-4">
            <Segmented value={policy} onChange={(ai_policy) => set({ ai_policy, ai_message: '' })}
              options={[{ id: 'welcome', label: 'Welcome, tell us how' }, { id: 'none', label: 'Ask them not to' }, { id: 'off', label: 'Don’t mention it' }]} />
            {policy !== 'off' && (
              <Field label="What candidates read" hint="Before submitting, each candidate says whether they used AI and how. It shows on their answers.">
                <Textarea rows={2} value={a.ai_message ?? ''} placeholder={policy === 'none' ? AI_NONE : AI_WELCOME} onChange={(e) => set({ ai_message: e.target.value })} />
              </Field>
            )}
            <Toggle checked={!!a.pledge} onChange={(pledge) => set({ pledge })}
              label="Ask candidates to confirm the work is their own"
              hint="A required tick box on the Submit step. A small, honest commitment makes people less likely to cut corners." />
          </div>
        </Card>

        <Card>
          <SectionTitle sub={loomSetup ? 'One step per line. Shown as a numbered list.' : anyVideo ? 'No step requires a video, so this screen is skipped. Candidates who choose to record see a short Loom tip instead.' : 'None of your steps use video, so this screen is skipped.'}>Loom setup steps</SectionTitle>
          <Textarea rows={5} value={a.loom_steps || ''} onChange={(e) => set({ loom_steps: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <Field label="Shortest answer (minutes)">
              <MinutesInput sec={a.answer_min} onCommit={(v) => set({ answer_min: toSec(v) })} />
            </Field>
            <Field label="Longest answer (minutes)" hint={(a.answer_max || 0) > 300 ? <span className="text-warn">Loom’s free plan stops recordings at 5 minutes.</span> : undefined}>
              <MinutesInput sec={a.answer_max} onCommit={(v) => set({ answer_max: toSec(v) })} />
            </Field>
          </div>
          <Field className="mt-4" label="Extra instructions (optional)" hint="Markdown. Use it for format rules, e.g. “Title each Loom ‘Q1 – Your Name’.”">
            <Textarea rows={3} value={a.extra || ''} onChange={(e) => set({ extra: e.target.value })} />
          </Field>
        </Card>

        <Card>
          <SectionTitle sub="Optional checks that test how closely people follow instructions.">Instruction checks</SectionTitle>
          <div className="space-y-5">
            <Field label="Hidden code word" hint={hasVideoStep
              ? 'Tell candidates somewhere (in the posting or the extra instructions) to put this word in their Loom video titles. Submissions are checked for it automatically.'
              : 'Tell candidates in the posting to use this word in one of their written answers. Submissions are checked for it automatically.'}>
              <Input mono value={a.hidden_code || ''} onChange={(e) => set({ hidden_code: e.target.value.trim() })} placeholder="e.g. lantern" />
            </Field>
            <Toggle checked={!!a.require_transcript} onChange={(v) => set({ require_transcript: v })}
              label="Ask for each video’s transcript"
              hint="Candidates paste Loom’s auto-transcript under each answer. It makes exports far more useful for AI analysis, since a model can’t watch a Loom link." />
          </div>
        </Card>

        <Card>
          <SectionTitle>Deadline, consent and accommodations</SectionTitle>
          <div className="space-y-4">
            <Field label="Deadline (optional)" hint="After this, the page shows a “closed” message.">
              <Input type="datetime-local" value={toLocalInput(a.deadline)} onChange={(e) => set({ deadline: fromLocalInput(e.target.value) })} />
            </Field>
            <Field label="Consent checkbox text" hint="Leave empty to skip the checkbox. If you’ll use AI on candidate videos, say so here. Some places (like Illinois) require notice and consent first.">
              <Textarea rows={3} value={a.consent_text || ''} onChange={(e) => set({ consent_text: e.target.value })} />
            </Field>
            <Field label="Accommodations email" hint="Shown at the bottom of the page so candidates can ask for another way to complete the activity.">
              <Input type="email" value={a.accommodations_email || ''} onChange={(e) => set({ accommodations_email: e.target.value.trim() })} placeholder="hiring@yourcompany.com" />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <SectionTitle>Preview</SectionTitle>
          <a href={links.test} target="_blank" rel="noreferrer"><Button variant="primary" className="w-full">Open the activity page ↗</Button></a>
          <p className="text-xs text-muted mt-2 leading-relaxed">Drafts open only for signed-in admins. Visits from this browser are marked as tests.</p>
        </Card>
        {admin && (<Card>
          <SectionTitle sub="Reuse this page setup for future jobs.">Templates</SectionTitle>
          <Select defaultValue="" onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value);
            if (t && confirm(`Replace this job’s activity page with “${t.name}”?`)) patch({ activity: { ...(t.content as Activity), deadline: a.deadline } });
            e.target.value = '';
          }}>
            <option value="" disabled>Load a template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Button className="w-full mt-2" onClick={async () => {
            const name = prompt('Template name', `${job.title} activity`);
            if (!name) return;
            const { deadline: _d, ...rest } = a;
            const { error } = await saveTemplate('activity', name, rest);
            if (error) toast(error.message, 'bad');
            else { toast('Template saved'); listTemplates('activity').then(setTemplates); }
          }}>Save as template</Button>
        </Card>)}
      </div>
    </div>
  );
}

function MinutesInput({ sec, onCommit }: { sec?: number | null; onCommit: (v: string) => void }) {
  const [v, setV] = useState(minutesLabel(sec));
  useEffect(() => {
    if (Math.round(Number(v || 0) * 60) !== (sec ?? 0)) setV(minutesLabel(sec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);
  return <Input type="number" inputMode="decimal" min={0} step={0.5} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v.trim())} />;
}
