import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText, uploadFile, openFile, FILES_BUCKET } from '../../lib/supabase';
import { useAutosave } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { ago, cx, fmtDateTime } from '../../lib/util';
import type { Page } from '../../lib/types';
import { Button, Card, Icon, IconButton, Select, Spinner, Switch, useConfirm, useToast } from '../../ui';

export type PageFile = Page['files'][number];
export interface ModuleLite { id: string; title: string }

const MAX_MB = 25;

export function fmtSize(bytes?: number) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The notebook page editor: title and body autosave, sharing, module link, placement and attachments.
 * Key it by page id so each page starts with fresh local state.
 */
export function PageEditor({ page, pages, modules, onPatch, onDelete, onAddSub }: {
  page: Page;
  pages: Page[];
  modules: ModuleLite[];
  onPatch: (p: Partial<Page>) => void;
  onDelete: () => void;
  onAddSub: () => void;
}) {
  const { me } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [manual, setManual] = useState<null | 'saving' | 'saved' | 'error'>(null);
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const draft = useMemo(() => ({ title, body }), [title, body]);
  const saved = useRef({ title: page.title, body: page.body });
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;
  const filesRef = useRef(page.files || []);
  filesRef.current = page.files || [];

  const save = useCallback(async (v: { title: string; body: string }) => {
    if (v.title === saved.current.title && v.body === saved.current.body) return;
    const t = v.title.trim().slice(0, 200) || 'Untitled page';
    const { error } = await supabase.from('ramp_pages').update({ title: t, body: v.body }).eq('id', page.id);
    if (error) throw error;
    saved.current = v;
    onPatchRef.current({ title: t, body: v.body, updated_at: new Date().toISOString() });
  }, [page.id]);

  const status = useAutosave(draft, save, 800);
  useEffect(() => { setManual(null); }, [draft]);
  const shown = manual ?? status;

  // Save anything still pending when leaving the page, and warn before closing the tab mid-save.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => {
    const d = draftRef.current;
    if (d.title !== saved.current.title || d.body !== saved.current.body) saveRef.current(d).catch(() => {});
  }, []);
  useEffect(() => {
    if (shown !== 'saving' && shown !== 'error') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [shown]);

  // The body grows with its content.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 280)}px`;
  }, [body]);

  async function retry() {
    setManual('saving');
    try { await save(draftRef.current); setManual('saved'); } catch (e) { setManual('error'); toast(errText(e), 'bad'); }
  }

  async function setField<K extends 'shared' | 'module_id' | 'parent_id'>(k: K, v: Page[K], okText?: string) {
    const prev = page[k];
    onPatch({ [k]: v } as Partial<Page>);
    const { error } = await supabase.from('ramp_pages').update({ [k]: v }).eq('id', page.id);
    if (error) {
      onPatch({ [k]: prev } as Partial<Page>);
      toast(errText(error), 'bad');
    } else if (okText) toast(okText);
  }

  async function attach(list: FileList | null) {
    const files = list ? [...list] : [];
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    const big = files.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (big.length) toast(`${big[0]!.name} is over ${MAX_MB} MB, so it wasn’t attached.`, 'bad');
    const ok = files.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    if (!ok.length) return;
    setUploading(ok.length);
    const added: PageFile[] = [];
    try {
      for (const f of ok) added.push({ name: f.name, path: await uploadFile(me.id, f, 'notes'), size: f.size });
    } catch (e) {
      toast(errText(e), 'bad');
    }
    if (added.length) {
      const next = [...filesRef.current, ...added];
      const { error } = await supabase.from('ramp_pages').update({ files: next }).eq('id', page.id);
      if (error) {
        toast(errText(error), 'bad');
        supabase.storage.from(FILES_BUCKET).remove(added.map((a) => a.path)).then(() => {});
      } else {
        onPatch({ files: next });
        toast(added.length === 1 ? `Attached ${added[0]!.name}.` : `Attached ${added.length} files.`);
      }
    }
    setUploading(0);
  }

  async function removeFile(f: PageFile) {
    const ok = await confirm({ title: `Remove ${f.name}?`, body: 'The file will be deleted from this page.', action: 'Remove file', danger: true });
    if (!ok) return;
    const prev = filesRef.current;
    const next = prev.filter((x) => x.path !== f.path);
    onPatch({ files: next });
    const { error } = await supabase.from('ramp_pages').update({ files: next }).eq('id', page.id);
    if (error) {
      onPatch({ files: prev });
      toast(errText(error), 'bad');
      return;
    }
    supabase.storage.from(FILES_BUCKET).remove([f.path]).then(() => {});
    toast('File removed.');
  }

  async function open(f: PageFile) {
    try { await openFile(f.path); } catch (e) { toast(errText(e), 'bad'); }
  }

  const parent = page.parent_id ? pages.find((p) => p.id === page.parent_id) || null : null;
  const children = pages.filter((p) => p.parent_id === page.id);
  const tops = pages.filter((p) => !p.parent_id && p.id !== page.id);
  const linked = page.module_id ? modules.find((m) => m.id === page.module_id) || null : null;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <h1 className="sr-only">{title || 'Untitled page'}</h1>
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-6">
        <p className="text-[13px] text-muted">
          {parent && <><Link to={`/notes/${parent.id}`} className="font-semibold text-brand-ink no-underline">{parent.title}</Link> › </>}
          <span title={fmtDateTime(page.updated_at)}>Edited {ago(page.updated_at)}</span>
          {page.shared && <> · <span className="font-semibold text-brand-ink">Shared</span></>}
        </p>
        <p className="text-[13px] font-semibold flex items-center gap-1.5" aria-live="polite">
          {shown === 'saving' && <><Spinner size={14} className="text-muted" /><span className="text-muted">Saving…</span></>}
          {(shown === 'saved' || shown === 'idle') && <><Icon name="check" size={15} className="text-good" /><span className="text-good">Saved</span></>}
          {shown === 'error' && (
            <span className="flex items-center gap-2 text-bad">
              <Icon name="alert" size={15} />Couldn’t save
              <button type="button" onClick={retry} className="underline cursor-pointer min-h-11 px-1">Try again</button>
            </span>
          )}
        </p>
      </div>

      <Card padded={false} className="focus-within:border-brand transition-colors">
        <label className="block px-5 pt-5">
          <span className="sr-only">Page title</span>
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled page"
            className="w-full bg-transparent font-display text-[26px] leading-tight font-bold tracking-tight text-ink placeholder:text-muted/60 focus-visible:outline-none" />
        </label>
        <label className="block px-5 pb-5 pt-3">
          <span className="sr-only">Page text</span>
          <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={10}
            placeholder="Start writing. Everything saves as you type."
            className="w-full resize-none overflow-hidden bg-transparent text-base leading-relaxed text-ink placeholder:text-muted/70 focus-visible:outline-none" />
        </label>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Attachments</h2>
          <Button size="sm" icon="paperclip" onClick={() => fileRef.current?.click()} loading={uploading > 0}>
            {uploading > 0 ? `Uploading ${uploading > 1 ? `${uploading} files` : ''}…` : 'Attach a file'}
          </Button>
          <input ref={fileRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => attach(e.target.files)} />
        </div>
        {(page.files || []).length === 0 ? (
          <p className="text-sm text-muted">No files yet. Attach screenshots, PDFs or anything else that helps, up to {MAX_MB} MB each.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-2 border border-line rounded-xl">
            {(page.files || []).map((f) => (
              <li key={f.path} className="flex items-center gap-2 pl-3 pr-1">
                <button type="button" onClick={() => open(f)} className="flex-1 min-w-0 flex items-center gap-2.5 min-h-12 text-left cursor-pointer">
                  <Icon name="file" size={18} className="text-brand-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold truncate">{f.name}</span>
                    {f.size != null && <span className="block text-xs text-muted">{fmtSize(f.size)}</span>}
                  </span>
                </button>
                <IconButton icon="trash" label={`Remove ${f.name}`} onClick={() => removeFile(f)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">Share with my mentor and lead</p>
            <p className="text-sm text-muted leading-relaxed mt-0.5">
              {page.shared ? 'Your mentor, your department lead and admins can read this page. Only you can change it.' : 'Only you can see this page.'}
            </p>
          </div>
          <Switch checked={page.shared} label="Share with my mentor and lead"
            onChange={(v) => setField('shared', v, v ? 'Shared with your mentor and lead.' : 'This page is private again.')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
            Training module
            <Select value={page.module_id || ''} onChange={(e) => setField('module_id', e.target.value || null, e.target.value ? 'Linked to the module.' : 'Module link removed.')}>
              <option value="">Not linked</option>
              {page.module_id && !linked && <option value={page.module_id}>A module that’s no longer available</option>}
              {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </Select>
            {linked && <Link to={`/training/${linked.id}`} className="text-[13px] font-semibold text-brand-ink no-underline inline-flex items-center gap-1 min-h-8">Open {linked.title}<Icon name="chevronRight" size={14} /></Link>}
          </label>
          {children.length === 0 && (
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
              Inside
              <Select value={page.parent_id || ''} onChange={(e) => setField('parent_id', e.target.value || null, 'Page moved.')}>
                <option value="">Top level of my notebook</option>
                {tops.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </label>
          )}
        </div>
      </Card>

      <div className={cx('flex flex-wrap gap-2.5', !page.parent_id ? 'justify-between' : 'justify-end')}>
        {!page.parent_id && <Button icon="plus" onClick={onAddSub}>Add a sub-page</Button>}
        <Button variant="danger" icon="trash" onClick={onDelete}>Delete page</Button>
      </div>
      {dialog}
    </div>
  );
}
