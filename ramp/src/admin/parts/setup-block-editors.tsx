// Editors for each kind of training block, used by the module builder.

import { Link } from 'react-router-dom';
import { BLOCKS, cx, plural } from '../../lib/util';
import { embedUrl } from '../../lib/plan';
import type { Block, BlockType, QuizQuestion, Slide, Template } from '../../lib/types';
import { Button, Chip, Field, Icon, IconButton, Input, Notice, Select, Textarea } from '../../ui';
import { MoveButtons, move } from './setup-kit';

export type Tpl = Pick<Template, 'id' | 'title' | 'status' | 'kind'>;
export interface BlockItem { id: string; b: Block }

export const BLOCK_ICON: Record<BlockType, string> = {
  slides: 'list', reading: 'fileText', video: 'play', quiz: 'target', assignment: 'pen', form: 'file', practice: 'sparkle',
};

export function newBlock(type: BlockType): Block {
  switch (type) {
    case 'slides': return { type, slides: [{ title: '', body: '' }] };
    case 'reading': return { type, title: '', body: '' };
    case 'video': return { type, url: '', caption: '' };
    case 'quiz': return { type, questions: [{ q: '', options: ['', ''], answer: 0, explain: '' }] };
    case 'assignment': return { type, prompt: '' };
    case 'form': return { type, template_id: null, note: '' };
    default: return { type: 'practice' };
  }
}

/** Drop empty optional text so unchanged blocks compare equal. */
export function tidyBlock(b: Block): Block {
  switch (b.type) {
    case 'video': return b.caption ? { type: 'video', url: b.url, caption: b.caption } : { type: 'video', url: b.url };
    case 'quiz': return { type: 'quiz', questions: b.questions.map((qq) => (qq.explain ? { q: qq.q, options: qq.options, answer: qq.answer, explain: qq.explain } : { q: qq.q, options: qq.options, answer: qq.answer })) };
    case 'form': return b.note ? { type: 'form', template_id: b.template_id, note: b.note } : { type: 'form', template_id: b.template_id };
    default: return b;
  }
}

export function blockSummary(b: Block, templates: Tpl[]): string {
  switch (b.type) {
    case 'slides': return plural(b.slides.length, 'slide');
    case 'reading': return b.title.trim() || 'Untitled reading';
    case 'video': return b.url.trim() ? (b.caption?.trim() || b.url.trim()) : 'No link yet';
    case 'quiz': return plural(b.questions.length, 'question');
    case 'assignment': return b.prompt.trim().slice(0, 80) || 'No prompt yet';
    case 'form': return templates.find((t) => t.id === b.template_id)?.title || 'No document picked';
    default: return 'Nine quick missions in a safe sandbox';
  }
}

/** Problems that stop publishing (errors) and things worth a second look (warnings). */
export function blockIssues(b: Block, templates: Tpl[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (b.type === 'slides') {
    if (!b.slides.length) errors.push('Add at least one slide.');
    b.slides.forEach((s, i) => { if (!s.title.trim() && !s.body.trim()) errors.push(`Slide ${i + 1} is empty.`); });
  } else if (b.type === 'reading') {
    if (!b.body.trim()) errors.push('Add the text to read.');
  } else if (b.type === 'video') {
    const url = b.url.trim();
    if (!url) errors.push('Paste the video link.');
    else if (!/^https?:\/\/\S+\.\S+/i.test(url)) errors.push('The video link should start with https://');
    else if (!embedUrl(url)) warnings.push('The video can’t play inside RAMP, so people will open it in a new tab.');
  } else if (b.type === 'quiz') {
    if (!b.questions.length) errors.push('Add at least one question.');
    b.questions.forEach((qq, i) => {
      const n = `Question ${i + 1}`;
      if (!qq.q.trim()) errors.push(`${n} has no question text.`);
      if (qq.options.length < 2) errors.push(`${n} needs at least two answers.`);
      if (qq.options.some((o) => !o.trim())) errors.push(`${n} has an empty answer.`);
      if (!(qq.answer >= 0 && qq.answer < qq.options.length)) errors.push(`${n} needs a correct answer.`);
    });
  } else if (b.type === 'assignment') {
    if (!b.prompt.trim()) errors.push('Say what people should do or hand in.');
  } else if (b.type === 'form') {
    const t = templates.find((x) => x.id === b.template_id);
    if (!b.template_id) errors.push('Pick the document to fill in or sign.');
    else if (!t) errors.push('The linked document was deleted. Pick another one.');
    else if (t.status !== 'published') warnings.push(`“${t.title}” is still a draft, so people can’t open it until you publish it.`);
  }
  return { errors, warnings };
}

export function BlockCard({ item, index, count, collapsed, onToggle, onChange, onMove, onRemove, templates, locked, showErrors }: {
  item: BlockItem; index: number; count: number; collapsed: boolean; onToggle: () => void; onChange: (b: Block) => void;
  onMove: (d: -1 | 1) => void; onRemove: () => void; templates: Tpl[]; locked?: boolean; showErrors?: boolean;
}) {
  const b = item.b;
  const info = BLOCKS[b.type];
  const issues = blockIssues(b, templates);
  const bad = showErrors && issues.errors.length > 0;
  const bodyId = `block-body-${item.id}`;
  return (
    <li id={`block-${item.id}`} className={cx('rounded-2xl border bg-white scroll-mt-24', bad ? 'border-bad' : 'border-line')}>
      <div className={cx('flex items-center gap-1 pl-1.5 pr-1 py-1 bg-[#FAFBFC] rounded-t-2xl', !collapsed && 'border-b border-line-2', collapsed && 'rounded-b-2xl')}>
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls={bodyId}
          className="flex-1 min-w-0 flex items-center gap-2.5 min-h-12 px-1.5 text-left cursor-pointer rounded-xl">
          <Icon name="chevronDown" size={18} className={cx('text-muted transition-transform', collapsed && '-rotate-90')} />
          <span className="w-8 h-8 rounded-lg bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={BLOCK_ICON[b.type]} size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-semibold text-[15px]">{index + 1}. {info.label}
              {bad && <Chip tone="bad">Needs work</Chip>}
              {!bad && issues.warnings.length > 0 && showErrors && <Chip tone="warn">Check</Chip>}
            </span>
            <span className="block text-xs text-muted truncate">{blockSummary(b, templates)}</span>
          </span>
        </button>
        {!locked && (
          <span className="flex shrink-0">
            <MoveButtons index={index} count={count} what={`${info.label} block`} onMove={onMove} />
            <IconButton icon="trash" label={`Remove ${info.label} block`} onClick={onRemove} className="text-bad" />
          </span>
        )}
      </div>
      {!collapsed && (
        <div id={bodyId} className="p-4 flex flex-col gap-4">
          {locked ? <PracticeInfo /> : <BlockBody b={b} onChange={onChange} templates={templates} blockId={item.id} />}
          {showErrors && (issues.errors.length > 0 || issues.warnings.length > 0) && (
            <Notice tone={issues.errors.length ? 'bad' : 'warn'} icon="alert">
              <ul className="list-disc pl-4">{[...issues.errors, ...issues.warnings].map((x) => <li key={x}>{x}</li>)}</ul>
            </Notice>
          )}
        </div>
      )}
    </li>
  );
}

function BlockBody({ b, onChange, templates, blockId }: { b: Block; onChange: (b: Block) => void; templates: Tpl[]; blockId: string }) {
  switch (b.type) {
    case 'slides': return <SlidesEditor slides={b.slides} onChange={(slides) => onChange({ ...b, slides })} />;
    case 'reading': return (
      <>
        <Field label="Title"><Input value={b.title} maxLength={160} onChange={(e) => onChange({ ...b, title: e.target.value })} placeholder="For example, Our security basics" /></Field>
        <Field label="Text" hint="Line breaks are kept. Keep paragraphs short so it reads well on a phone.">
          <Textarea rows={10} value={b.body} maxLength={50000} onChange={(e) => onChange({ ...b, body: e.target.value })} />
        </Field>
      </>
    );
    case 'video': return <VideoEditor url={b.url} caption={b.caption || ''} onChange={(url, caption) => onChange({ type: 'video', url, caption })} />;
    case 'quiz': return <QuizEditor questions={b.questions} onChange={(questions) => onChange({ ...b, questions })} blockId={blockId} />;
    case 'assignment': return (
      <Field label="What should they do?" hint="Say exactly what to hand in. People write their answer in RAMP. Turn on mentor review in Settings to have it checked.">
        <Textarea rows={5} value={b.prompt} maxLength={5000} onChange={(e) => onChange({ ...b, prompt: e.target.value })} />
      </Field>
    );
    case 'form': {
      const t = templates.find((x) => x.id === b.template_id);
      return (
        <>
          <Field label="Document" hint={templates.length ? undefined : 'No documents yet. Create one on the Documents page first.'}>
            <Select value={b.template_id || ''} onChange={(e) => onChange({ ...b, template_id: e.target.value || null })}>
              <option value="">Pick a document</option>
              {templates.map((x) => <option key={x.id} value={x.id}>{x.title}{x.status !== 'published' ? ' (draft)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Note" hint="Optional. Shown above the button, for example why this matters.">
            <Input value={b.note || ''} maxLength={300} onChange={(e) => onChange({ ...b, note: e.target.value })} />
          </Field>
          <p className="text-sm">
            {t ? <Link to={`/admin/documents/${t.id}`} className="font-semibold text-brand-ink">Edit “{t.title}”</Link>
              : <Link to="/admin/documents" className="font-semibold text-brand-ink">Go to Documents</Link>}
          </p>
        </>
      );
    }
    default: return <PracticeInfo />;
  }
}

function PracticeInfo() {
  return (
    <Notice icon="sparkle">
      The interactive RAMP sandbox: nine quick missions in a safe copy of the app, like creating a task and messaging a mentor. It’s marked complete automatically when they finish.
    </Notice>
  );
}

function SlidesEditor({ slides, onChange }: { slides: Slide[]; onChange: (s: Slide[]) => void }) {
  const set = (i: number, p: Partial<Slide>) => onChange(slides.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="flex flex-col gap-3">
      {slides.map((s, i) => (
        <div key={i} className="rounded-xl border border-line-2 bg-bg/60 p-3 flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-bold text-ink-2 mr-auto">Slide {i + 1} of {slides.length}</span>
            <MoveButtons index={i} count={slides.length} what={`slide ${i + 1}`} onMove={(d) => onChange(move(slides, i, d))} />
            <IconButton icon="trash" label={`Remove slide ${i + 1}`} onClick={() => onChange(slides.filter((_, j) => j !== i))} className="text-bad" />
          </div>
          <Field label="Heading"><Input value={s.title} maxLength={160} onChange={(e) => set(i, { title: e.target.value })} /></Field>
          <Field label="Text" hint="One key idea per slide. Line breaks are kept."><Textarea rows={4} value={s.body} maxLength={5000} onChange={(e) => set(i, { body: e.target.value })} /></Field>
        </div>
      ))}
      <Button icon="plus" onClick={() => onChange([...slides, { title: '', body: '' }])} className="self-start">Add slide</Button>
    </div>
  );
}

function VideoEditor({ url, caption, onChange }: { url: string; caption: string; onChange: (url: string, caption: string) => void }) {
  const src = url.trim() ? embedUrl(url.trim()) : null;
  return (
    <>
      <Field label="Video link" hint="YouTube, Vimeo and Loom links play right inside RAMP.">
        <Input type="url" inputMode="url" value={url} onChange={(e) => onChange(e.target.value, caption)} placeholder="https://www.youtube.com/watch?v=…" />
      </Field>
      <Field label="Caption" hint="Optional. What to watch for.">
        <Input value={caption} maxLength={300} onChange={(e) => onChange(url, e.target.value)} />
      </Field>
      {src ? (
        <div className="aspect-video rounded-xl overflow-hidden bg-ink">
          <iframe src={src} title="Video preview" className="w-full h-full" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
        </div>
      ) : url.trim() ? (
        <Notice tone="warn" icon="alert">This link can’t play inside RAMP. People will get a button to open it in a new tab.</Notice>
      ) : null}
    </>
  );
}

function QuizEditor({ questions, onChange, blockId }: { questions: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void; blockId: string }) {
  const set = (i: number, p: Partial<QuizQuestion>) => onChange(questions.map((qq, j) => (j === i ? { ...qq, ...p } : qq)));
  return (
    <div className="flex flex-col gap-3">
      {questions.map((qq, i) => (
        <div key={i} className="rounded-xl border border-line-2 bg-bg/60 p-3 flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-bold text-ink-2 mr-auto">Question {i + 1} of {questions.length}</span>
            <MoveButtons index={i} count={questions.length} what={`question ${i + 1}`} onMove={(d) => onChange(move(questions, i, d))} />
            <IconButton icon="trash" label={`Remove question ${i + 1}`} onClick={() => onChange(questions.filter((_, j) => j !== i))} className="text-bad" />
          </div>
          <Field label="Question"><Textarea rows={2} value={qq.q} maxLength={500} onChange={(e) => set(i, { q: e.target.value })} /></Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-semibold text-ink-2 mb-2">Answers <span className="font-normal text-muted">· pick the right one</span></legend>
            {qq.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-1.5">
                <label className={cx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer', qq.answer === oi ? 'bg-good-soft' : 'hover:bg-chip')}>
                  <input type="radio" name={`quiz-${blockId}-${i}`} checked={qq.answer === oi} onChange={() => set(i, { answer: oi })}
                    className="w-5 h-5 accent-[var(--color-good-2)] cursor-pointer" aria-label={`Answer ${oi + 1} is the right answer`} />
                </label>
                <Input value={o} maxLength={300} aria-label={`Answer ${oi + 1}`} placeholder={`Answer ${oi + 1}`}
                  onChange={(e) => set(i, { options: qq.options.map((x, j) => (j === oi ? e.target.value : x)) })}
                  className={cx(qq.answer === oi && 'border-good-2')} />
                <IconButton icon="x" label={`Remove answer ${oi + 1}`} disabled={qq.options.length <= 2}
                  onClick={() => set(i, { options: qq.options.filter((_, j) => j !== oi), answer: qq.answer === oi ? 0 : qq.answer > oi ? qq.answer - 1 : qq.answer })} />
              </div>
            ))}
            {qq.options.length < 6 && (
              <Button variant="ghost" icon="plus" className="self-start" onClick={() => set(i, { options: [...qq.options, ''] })}>Add answer</Button>
            )}
          </fieldset>
          <Field label="Explanation" hint="Optional. Shown after they answer, so they learn why.">
            <Input value={qq.explain || ''} maxLength={500} onChange={(e) => set(i, { explain: e.target.value })} />
          </Field>
        </div>
      ))}
      <Button icon="plus" onClick={() => onChange([...questions, { q: '', options: ['', ''], answer: 0, explain: '' }])} className="self-start">Add question</Button>
    </div>
  );
}
