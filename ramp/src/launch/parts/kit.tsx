// Small building blocks shared by the launch plan screens.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { FILES_BUCKET, errText, fileUrl, openFile, supabase } from '../../lib/supabase';
import { cx, plural } from '../../lib/util';
import { Button, Icon, IconButton, Spinner, inputCls, useConfirm, useToast } from '../../ui';
import type { LaunchFile } from './model';

// ───────── list helpers ─────────

export function moved<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
export const patchById = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => T)) =>
  list.map((x) => (x.id === id ? (typeof patch === 'function' ? patch(x) : { ...x, ...patch }) : x));

export const hrefOf = (url: string) => (/^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
export function hostOf(url: string) {
  try { const u = new URL(hrefOf(url)); return (u.host.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '')).slice(0, 60); } catch { return url; }
}

/** Ticks once a second (or every `ms`) while `active`, for running timers. */
export function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

// ───────── layout pieces ─────────

/** A card that opens to edit one item. */
export function Fold({ open, onToggle, title, meta, children, lead }: { open: boolean; onToggle: () => void; title: ReactNode; meta?: ReactNode; children: ReactNode; lead?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx('rounded-2xl border bg-white', open ? 'border-brand-2 shadow-sm' : 'border-line')}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
        className="w-full flex items-center gap-3 min-h-14 px-3 sm:px-4 py-3 text-left cursor-pointer rounded-2xl">
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[15px] leading-snug break-words">{title}</span>
          {meta && <span className="mt-1.5 flex flex-wrap gap-1.5">{meta}</span>}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} className="text-muted" />
      </button>
      {open && <div id={id} className="px-3 sm:px-4 pb-4 pt-3.5 sm:pt-4 flex flex-col gap-4 border-t border-line-2">{children}</div>}
    </div>
  );
}

/** Move up, move down and delete for an item in a list. */
export function MoveBar({ index, count, onMove, onRemove, noun }: { index: number; count: number; onMove?: (dir: -1 | 1) => void; onRemove: () => void; noun: string }) {
  return (
    <div className="flex items-center gap-1 pt-3 border-t border-line-2">
      {onMove && count > 1 && (
        <>
          <IconButton icon="chevronUp" label={`Move this ${noun} up`} disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon="chevronDown" label={`Move this ${noun} down`} disabled={index >= count - 1} onClick={() => onMove(1)} />
        </>
      )}
      <Button variant="danger" icon="trash" className="ml-auto" onClick={onRemove}>Delete {noun}</Button>
    </div>
  );
}

export function AddButton({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('w-full min-h-12 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-2 text-brand-ink font-semibold text-[15px] hover:bg-brand-soft cursor-pointer', className)}>
      <Icon name="plus" size={18} />{children}
    </button>
  );
}

/** A friendly “nothing yet” box that shows what a filled-in item looks like. */
export function ExampleBox({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-4 py-4 flex flex-col gap-2">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <div className="text-sm text-muted leading-relaxed">{children}</div>
      {action && <div className="pt-1 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

// ───────── quick steps ─────────

/** A one-line text box that wraps and grows as you type, for short sentences on narrow screens. */
export function GrowText({ inputRef, className, value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea rows={1} {...rest} value={value} ref={(el) => { ref.current = el; inputRef?.(el); }}
      className={cx(inputCls, 'resize-none overflow-hidden leading-snug', className)} />
  );
}

/** A numbered list of short steps: type and press Enter for the next one, reorder, delete. */
export function StepsEditor({ steps, onChange, examples, label = 'Quick steps' }: { steps: string[]; onChange: (s: string[]) => void; examples: string[]; label?: string }) {
  const labelId = useId();
  const [reorder, setReorder] = useState(false);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusAt = useRef<number | null>(null);
  useEffect(() => {
    if (focusAt.current === null) return;
    refs.current[focusAt.current]?.focus();
    focusAt.current = null;
  });
  const set = (i: number, v: string) => onChange(steps.map((s, j) => (j === i ? v : s)));
  const insert = (at: number) => { const n = [...steps]; n.splice(at, 0, ''); focusAt.current = at; onChange(n); };
  const remove = (i: number) => { focusAt.current = i > 0 ? i - 1 : null; onChange(steps.filter((_, j) => j !== i)); };
  const showReorder = reorder && steps.length > 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 min-h-10">
        <span id={labelId} className="text-[13px] font-semibold text-ink-2">{label}</span>
        {steps.length > 1 && (
          <Button size="sm" variant="ghost" icon={showReorder ? 'check' : 'sliders'} onClick={() => setReorder(!showReorder)}>{showReorder ? 'Done' : 'Reorder'}</Button>
        )}
      </div>
      {steps.length === 0 && (
        <p className="text-sm text-muted leading-relaxed">Short steps anyone could follow, like a recipe. For example: {examples.slice(0, 3).map((e) => `“${e}”`).join(', then ')}.</p>
      )}
      {steps.length > 0 && (
        <ol aria-labelledby={labelId} className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={i} className={cx('flex gap-2', showReorder ? 'items-center' : 'items-start')}>
              <span aria-hidden="true" className={cx('w-7 h-7 rounded-full bg-brand-soft text-brand-ink text-[13px] font-bold flex items-center justify-center shrink-0 tabular-nums', !showReorder && 'mt-2')}>{i + 1}</span>
              {showReorder ? (
                <>
                  <span className="flex-1 min-w-0 text-[15px] truncate">{s || <span className="text-muted">Empty step</span>}</span>
                  <IconButton icon="chevronUp" label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => onChange(moved(steps, i, -1))} />
                  <IconButton icon="chevronDown" label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => onChange(moved(steps, i, 1))} />
                </>
              ) : (
                <>
                  <GrowText inputRef={(el) => { refs.current[i] = el; }} value={s} aria-label={`Step ${i + 1}`} enterKeyHint="next"
                    placeholder={examples[i] ? `e.g. ${examples[i]}` : 'What happens next?'}
                    onChange={(e) => set(i, e.target.value.replace(/\n+/g, ' '))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); insert(i + 1); }
                      else if (e.key === 'Backspace' && !s) { e.preventDefault(); remove(i); }
                    }}
                    className="flex-1 min-w-0" />
                  <IconButton icon="x" label={`Delete step ${i + 1}`} onClick={() => remove(i)} />
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {!showReorder && (
        <Button size="md" variant="ghost" icon="plus" className="self-start -ml-2" onClick={() => insert(steps.length)}>
          {steps.length ? 'Add a step' : 'Add the first step'}
        </Button>
      )}
    </div>
  );
}

export function StepsView({ steps, className }: { steps: string[]; className?: string }) {
  const list = steps.filter((s) => s.trim());
  if (!list.length) return <p className={cx('text-sm text-muted', className)}>No quick steps yet.</p>;
  return (
    <ol className={cx('flex flex-col gap-1.5', className)}>
      {list.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-2">
          <span aria-hidden="true" className="mt-0.5 w-6 h-6 rounded-full bg-brand-soft text-brand-ink text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
          <span className="min-w-0 break-words"><span className="sr-only">Step {i + 1}: </span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export const lines = (text: string) => text.split('\n').map((s) => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);

export function Bullets({ text, className }: { text: string; className?: string }) {
  const list = lines(text);
  if (!list.length) return null;
  return (
    <ul className={cx('flex flex-col gap-1', className)}>
      {list.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-2">
          <span aria-hidden="true" className="mt-[9px] w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
          <span className="min-w-0 break-words">{s}</span>
        </li>
      ))}
    </ul>
  );
}

/** Multi-line text as written, or nothing. */
export function Prose({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  return <p className={cx('text-[15px] leading-relaxed text-ink-2 whitespace-pre-line break-words', className)}>{text.trim()}</p>;
}

// ───────── links ─────────

export function LinksEditor({ links, onChange, label = 'Links', placeholder = 'https://…' }: { links: string[]; onChange: (l: string[]) => void; label?: string; placeholder?: string }) {
  const labelId = useId();
  const last = useRef<HTMLInputElement | null>(null);
  const [focusNew, setFocusNew] = useState(false);
  useEffect(() => { if (focusNew) { last.current?.focus(); setFocusNew(false); } }, [focusNew]);
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-[13px] font-semibold text-ink-2">{label}</span>
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input ref={i === links.length - 1 ? last : undefined} type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" value={l} placeholder={placeholder}
            aria-label={`Link ${i + 1}`} onChange={(e) => onChange(links.map((x, j) => (j === i ? e.target.value : x)))} className={cx(inputCls, 'flex-1 min-w-0')} />
          <IconButton icon="x" label={`Remove link ${i + 1}`} onClick={() => onChange(links.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button variant="ghost" icon="link" className="self-start -ml-2" onClick={() => { onChange([...links, '']); setFocusNew(true); }}>
        {links.length ? 'Add another link' : 'Add a link'}
      </Button>
    </div>
  );
}

export function LinkList({ links }: { links: string[] }) {
  const list = links.filter((l) => l.trim());
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {list.map((l, i) => (
        <li key={i}>
          <a href={hrefOf(l)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 min-h-10 text-[15px] font-semibold text-brand-ink break-all">
            <Icon name="link" size={16} />{hostOf(l)}
          </a>
        </li>
      ))}
    </ul>
  );
}

// ───────── files ─────────

const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|heic)$/i;

export async function uploadLaunchFile(placementId: string, file: File): Promise<LaunchFile> {
  const cleanName = file.name.replace(/[^\w.\-]+/g, '-').slice(-80) || 'file';
  const path = `launch/${placementId}/${crypto.randomUUID()}-${cleanName}`;
  const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return { name: file.name, path };
}

const signed = new Map<string, { url: string; until: number }>();
function useImageUrl(path: string, isImage: boolean) {
  const hit = signed.get(path);
  const [url, setUrl] = useState<string | null>(hit && hit.until > Date.now() ? hit.url : null);
  useEffect(() => {
    if (!isImage || url) return;
    let live = true;
    fileUrl(path, 3600).then((u) => { signed.set(path, { url: u, until: Date.now() + 50 * 60 * 1000 }); if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [path, isImage, url]);
  return url;
}

function FileTile({ file, onRemove }: { file: LaunchFile; onRemove?: () => void }) {
  const toast = useToast();
  const img = IMAGE.test(file.name) || IMAGE.test(file.path);
  const url = useImageUrl(file.path, img);
  const open = () => openFile(file.path).catch((e) => toast(errText(e), 'bad'));
  return (
    <li className="launch-keep relative flex flex-col rounded-xl border border-line bg-white overflow-hidden">
      <button type="button" onClick={open} className="flex flex-col text-left cursor-pointer min-h-11 group" aria-label={`Open ${file.name}`}>
        {img ? (
          <span className="block aspect-[4/3] bg-chip">
            {url ? <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="w-full h-full flex items-center justify-center text-muted"><Icon name="file" size={22} /></span>}
          </span>
        ) : (
          <span className="flex aspect-[4/3] items-center justify-center bg-brand-soft text-brand-ink"><Icon name="fileText" size={28} /></span>
        )}
        <span className="px-2.5 py-2 text-[13px] font-semibold text-ink leading-snug break-all line-clamp-2 group-hover:text-brand-ink">{file.name}</span>
      </button>
      {onRemove && (
        <IconButton icon="x" label={`Remove ${file.name}`} onClick={onRemove}
          className="launch-noprint absolute top-1 right-1 rounded-full bg-white/90 shadow-sm" size={18} />
      )}
    </li>
  );
}

export function FileTiles({ files, onRemove }: { files: LaunchFile[]; onRemove?: (path: string) => void }) {
  if (!files.length) return null;
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {files.map((f) => <FileTile key={f.path} file={f} onRemove={onRemove ? () => onRemove(f.path) : undefined} />)}
    </ul>
  );
}

/** Upload files into the placement's launch folder and list them. */
export function FilesField({ files, placementId, onAdd, onRemove, label, hint, accept }: {
  files: LaunchFile[]; placementId: string; onAdd: (f: LaunchFile[]) => void; onRemove: (path: string) => void; label: string; hint: string; accept?: string;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const inputId = useId();
  const [busy, setBusy] = useState(0);

  async function pick(input: HTMLInputElement) {
    const chosen = Array.from(input.files || []);
    input.value = '';
    if (!chosen.length) return;
    const big = chosen.filter((f) => f.size > MAX_BYTES);
    if (big.length) toast(`${big[0]!.name} is over 25 MB. Add a link to it instead.`, 'bad');
    const ok = chosen.filter((f) => f.size <= MAX_BYTES);
    if (!ok.length) return;
    setBusy(ok.length);
    const added: LaunchFile[] = [];
    for (const f of ok) {
      try { added.push(await uploadLaunchFile(placementId, f)); }
      catch (e) { toast(`${f.name}: ${errText(e)}`, 'bad'); }
    }
    setBusy(0);
    if (added.length) {
      onAdd(added);
      toast(added.length === 1 ? `${added[0]!.name} added.` : `${plural(added.length, 'file')} added.`);
    }
  }

  async function remove(path: string) {
    const f = files.find((x) => x.path === path);
    const ok = await confirm({ title: `Remove ${f?.name || 'this file'}?`, body: 'It will no longer show in the launch plan.', action: 'Remove file', danger: true });
    if (ok) onRemove(path);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      <FileTiles files={files} onRemove={remove} />
      <input id={inputId} type="file" multiple accept={accept} disabled={busy > 0} className="peer sr-only" onChange={(e) => pick(e.currentTarget)} />
      <label htmlFor={inputId}
        className={cx('flex items-center gap-3 min-h-14 px-4 py-3 rounded-xl border-2 border-dashed border-line bg-white text-left cursor-pointer hover:border-brand-2 hover:bg-brand-soft',
          'peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-brand-2', busy > 0 && 'opacity-70 cursor-wait')}>
        <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0">{busy ? <Spinner size={18} /> : <Icon name="upload" size={20} />}</span>
        <span className="min-w-0 flex flex-col">
          <span className="text-[15px] font-semibold text-ink">{busy ? `Uploading ${plural(busy, 'file')}…` : files.length ? 'Add more files' : 'Add files'}</span>
          <span className="text-[13px] text-muted leading-snug">{hint}</span>
        </span>
      </label>
      {dialog}
    </div>
  );
}
