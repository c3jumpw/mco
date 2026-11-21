// Module builder editor for interactive blocks: a live preview, the content as JSON, and picture uploads.
// Most interactive blocks arrive from the RAMP Assistant; this is for checking them and fine-tuning.
import { useEffect, useState } from 'react';
import { errText } from '../lib/supabase';
import { cx } from '../lib/util';
import { Button, Field, Input, Notice, Pills, Segmented, Textarea, useToast } from '../ui';
import { InteractiveStep } from './index';
import { MediaImg, uploadMedia } from './media';
import { validateInteractive } from './schema';
import type { InteractiveBlock, SimBlock, StepResult } from './types';

type Tab = 'preview' | 'edit';

export function InteractiveEditor({ b, onChange }: { b: InteractiveBlock; onChange: (b: InteractiveBlock) => void }) {
  const [tab, setTab] = useState<Tab>('preview');
  const [text, setText] = useState(() => JSON.stringify(b, null, 2));
  const [parseErr, setParseErr] = useState('');
  const [result, setResult] = useState<StepResult | undefined>();
  const [nonce, setNonce] = useState(0);
  const problems = validateInteractive(b);

  // Keep the JSON in step when the block changes elsewhere (upload, tool switch).
  useEffect(() => { setText(JSON.stringify(b, null, 2)); setParseErr(''); }, [b]);

  function edit(v: string) {
    setText(v);
    try {
      const next = JSON.parse(v) as InteractiveBlock;
      if (!next || typeof next !== 'object' || next.type !== b.type) { setParseErr(`Keep "type": "${b.type}". To change the kind of block, add a new one.`); return; }
      setParseErr('');
      onChange(next);
    } catch (e) { setParseErr(`Not valid JSON yet: ${(e as Error).message}`); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'preview', label: 'Preview' }, { value: 'edit', label: 'Edit content' }]} />
        {tab === 'preview' && <Button size="sm" icon="replay" onClick={() => { setResult(undefined); setNonce((n) => n + 1); }}>Reset preview</Button>}
      </div>
      {b.type === 'sim' && <SimTool b={b} onChange={onChange} />}
      {(b.type === 'image' || b.type === 'hotspot') && <PictureFields b={b} onChange={onChange} />}
      {tab === 'preview' ? (
        <div className={cx('rounded-2xl border border-dashed border-[#C9CED6] bg-bg p-4 md:p-6', problems.length > 0 && 'opacity-90')}>
          {problems.length ? <Notice tone="warn" icon="alert" className="mb-4">Fix these to preview it properly: {problems.join(' ')}</Notice> : null}
          <InteractiveStep key={nonce} block={b} result={result} preview
            onResult={(score) => setResult((r) => ({ first: r ? r.first : score, best: Math.max(r?.best ?? 0, score), tries: (r?.tries || 0) + 1, done: true }))} />
        </div>
      ) : (
        <Field label="Content (JSON)" hint="The same format the RAMP Assistant writes. Changes apply as soon as the JSON is valid." error={parseErr || undefined}>
          <Textarea rows={18} value={text} onChange={(e) => edit(e.target.value)} spellCheck={false} className="font-mono text-[13px] leading-relaxed" />
        </Field>
      )}
    </div>
  );
}

function PictureFields({ b, onChange }: { b: Extract<InteractiveBlock, { type: 'image' | 'hotspot' }>; onChange: (b: InteractiveBlock) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const src = b.type === 'image' ? b.src : b.image;
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const m = await uploadMedia(f);
      onChange(b.type === 'image' ? { ...b, src: m } : { ...b, image: m });
    } catch (e) { toast(errText(e), 'bad'); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-2xl border border-line p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {src ? <MediaImg src={src} alt="" className="w-28 h-20 object-cover rounded-lg border border-line" /> : <span className="w-28 h-20 rounded-lg bg-chip flex items-center justify-center text-xs text-muted">No picture</span>}
        <label className="inline-flex">
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          <span className={cx('inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border border-[#C9CED6] bg-white text-sm font-semibold cursor-pointer hover:bg-chip', busy && 'opacity-60')}>
            {busy ? 'Uploading…' : src ? 'Replace picture' : 'Upload a picture'}
          </span>
        </label>
        <span className="text-xs text-muted">Saved privately in RAMP, shrunk to a web-friendly size.</span>
      </div>
      {b.type === 'image' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Describe the picture" hint="For people using screen readers."><Input value={b.alt} onChange={(e) => onChange({ ...b, alt: e.target.value })} /></Field>
          <Field label="Caption (optional)"><Input value={b.caption || ''} onChange={(e) => onChange({ ...b, caption: e.target.value })} /></Field>
        </div>
      )}
      {b.type === 'hotspot' && <p className="text-xs text-muted">Click-through boxes are percentages of the picture (x, y from the top left, then width and height). Edit them under Edit content, then try them in Preview.</p>}
    </div>
  );
}

function SimTool({ b, onChange }: { b: SimBlock; onChange: (b: InteractiveBlock) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[13px] font-semibold text-ink-2">Practice tool</span>
      <Pills size="sm" label="Practice tool" value={b.tool} onChange={(t) => { if (t !== b.tool) onChange(newSim(t)); }}
        options={[{ value: 'tasks', label: 'Task manager' }, { value: 'calendar', label: 'Calendar' }, { value: 'inbox', label: 'Inbox' }, { value: 'chat', label: 'Team chat' }]} />
    </div>
  );
}

/** Starter practice for each tool. */
export function newSim(tool: SimBlock['tool']): SimBlock {
  if (tool === 'calendar') return {
    type: 'sim', tool, title: 'Block out the day', brief: 'Place each block where it fits around the meetings.', day: 'Tuesday', start: 8, end: 17,
    events: [{ title: 'Daily sync', start: '09:00', end: '09:30', kind: 'meeting' }],
    blocks: [{ id: 'b1', title: 'Pre-sync prep', minutes: 30, before: '09:00', why: 'Prep happens before the sync.' }],
  };
  if (tool === 'inbox' || tool === 'chat') return {
    type: 'sim', tool, title: tool === 'inbox' ? 'Get to inbox zero' : 'Sort the dump channel', brief: 'Decide what to do with each message.',
    place: tool === 'inbox' ? 'support@business.com' : 'daily-dump',
    messages: [{ id: 'm1', from: 'A customer', subject: tool === 'inbox' ? 'Question about my order' : undefined, time: '8:05 AM', body: 'Hi, when will my order ship?', expect: ['reply'], why: 'A quick, clear reply closes the loop.', reply: { mustInclude: ['ship'] } }],
  };
  return {
    type: 'sim', tool: 'tasks', title: 'Log the owner’s requests', brief: 'Turn each request into a clear task.', space: 'Business', lists: ['Admin tasks', 'Client work'],
    requests: [{ id: 'r1', from: 'The owner', text: 'Remind me to send the invoice to Acme on Friday.', expect: { list: 'Admin tasks', type: 'Operational', duration: 'Quick task', keywords: ['Acme', 'invoice'] } }],
  };
}
