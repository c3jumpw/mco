import { useState } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { stepsOf } from '../../lib/plan';
import { ago, fmtDateTime } from '../../lib/util';
import type { Module, Progress } from '../../lib/types';
import { useBadges } from '../../shell/AppShell';
import { Button, Chip, Field, Notice, Sheet, Textarea, useToast } from '../../ui';

export interface ReviewTarget { progress: Progress; module: Module | null; personName: string }

/**
 * Review one piece of submitted training: see the score and written answer, then approve it
 * or return it with feedback (feedback is required to return).
 */
export function ReviewSheet({ target, onClose, onDone, tz }: { target: ReviewTarget | null; onClose: () => void; onDone: (approved: boolean) => void; tz?: string }) {
  if (!target) return null;
  return <ReviewBody key={`${target.progress.member_id}:${target.progress.module_id}`} target={target} onClose={onClose} onDone={onDone} tz={tz} />;
}

function ReviewBody({ target, onClose, onDone, tz }: { target: ReviewTarget; onClose: () => void; onDone: (approved: boolean) => void; tz?: string }) {
  const { progress: p, module, personName } = target;
  const toast = useToast();
  const badges = useBadges();
  const [feedback, setFeedback] = useState('');
  const [fbErr, setFbErr] = useState('');
  const [busy, setBusy] = useState<'' | 'approve' | 'return'>('');
  const [fail, setFail] = useState('');
  const first = personName.split(' ')[0] || personName;
  const prompts = module ? stepsOf(module.blocks).flatMap((s) => (s.kind === 'assignment' ? [s.prompt] : [])) : [];
  const title = module?.title || 'Training module';

  async function decide(approve: boolean) {
    const fb = feedback.trim();
    if (!approve && !fb) { setFbErr(`Tell ${first} what to change before you return it.`); return; }
    setBusy(approve ? 'approve' : 'return');
    setFail('');
    try {
      const { error } = await supabase.rpc('ramp_review', { p_member: p.member_id, p_module: p.module_id, p_approve: approve, p_feedback: fb });
      if (error) throw error;
      toast(approve ? `Approved “${title}” for ${first}.` : `Sent “${title}” back to ${first} with your feedback.`);
      badges.refresh();
      onDone(approve);
    } catch (e) {
      setFail(errText(e));
      setBusy('');
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={title} wide
      subtitle={<>{personName} sent this for review {p.submitted_at ? <span title={fmtDateTime(p.submitted_at, tz)}>{ago(p.submitted_at)}</span> : ''}</>}
      footer={
        <>
          <Button onClick={() => decide(false)} loading={busy === 'return'} disabled={!!busy} icon="replay">Return with feedback</Button>
          <Button variant="success" onClick={() => decide(true)} loading={busy === 'approve'} disabled={!!busy} icon="check">Approve</Button>
        </>
      }>
      {p.score != null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-2">Quiz score</span>
          <Chip tone={module && module.pass_score > 0 && p.score < module.pass_score ? 'bad' : 'good'}>{p.score}%</Chip>
          {module && module.pass_score > 0 && <span className="text-sm text-muted">Pass mark {module.pass_score}%</span>}
        </div>
      )}
      {prompts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-ink-2">The assignment</p>
          {prompts.map((t, i) => <p key={i} className="text-[15px] text-ink-2 leading-relaxed whitespace-pre-wrap bg-bg rounded-xl px-3.5 py-3">{t}</p>)}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-ink-2">{first}’s answer</p>
        {p.answer?.trim()
          ? <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words border border-line rounded-xl px-3.5 py-3">{p.answer}</div>
          : <p className="text-[15px] text-muted">No written answer. This module only needed the steps to be finished.</p>}
      </div>
      <Field label="Feedback" hint={`Required if you return it. ${first} sees this with the result.`} error={fbErr}>
        <Textarea value={feedback} rows={4} maxLength={4000} placeholder="What went well, and what to change"
          onChange={(e) => { setFeedback(e.target.value); setFbErr(''); }} />
      </Field>
      {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
    </Sheet>
  );
}
