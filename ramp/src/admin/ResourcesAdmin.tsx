import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { FILES_BUCKET, errText, openFile, supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import type { JobRole, Resource } from '../lib/types';
import { Button, Card, Checkbox, Chip, EmptyState, ErrorBox, Field, Icon, IconButton, Input, PageHeader, Pills, Select, Sheet, Skeleton, Textarea, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, FormError, cleanFileName, fmtSize, focusInvalid, groupOf } from './parts/ops-common';

type Category = Resource['category'];
const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'policy', label: 'Policy' },
  { value: 'sop', label: 'SOP' },
  { value: 'guide', label: 'Guide' },
  { value: 'tool', label: 'Tool' },
  { value: 'other', label: 'Other' },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<Category, string>;
const MAX_BYTES = 25 * 1024 * 1024;

const ordered = (list: Resource[]) => [...list].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));

export default function ResourcesAdmin() {
  useTitle('Resources');
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);
  const [said, setSaid] = useState('');
  const closeEdit = useCallback(() => setEditing(null), []);

  const res = useAsync(async () => {
    const [items, roles] = await Promise.all([
      q<Resource[]>(supabase.from('ramp_resources').select('*').order('sort').order('created_at')),
      q<JobRole[]>(supabase.from('ramp_job_roles').select('*').order('title')),
    ]);
    return { items: ordered(items), roles };
  }, []);
  const { data, setData, reload } = res;
  const items = data?.items || [];
  const shown = cat === 'all' ? items : items.filter((r) => r.category === cat);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    items.forEach((r) => { c[r.category] = (c[r.category] || 0) + 1; });
    return c;
  }, [items]);

  // Swap with the nearest visible neighbour, then renumber everything in steps of 10. Only changed rows are saved.
  async function move(r: Resource, dir: -1 | 1) {
    if (!data) return;
    const vi = shown.findIndex((x) => x.id === r.id);
    const other = shown[vi + dir];
    if (!other) return;
    const before = data.items;
    const list = [...before];
    const a = list.findIndex((x) => x.id === r.id), b = list.findIndex((x) => x.id === other.id);
    [list[a], list[b]] = [list[b]!, list[a]!];
    const next = list.map((x, i) => ({ ...x, sort: (i + 1) * 10 }));
    const changed = next.filter((x) => before.find((y) => y.id === x.id)?.sort !== x.sort);
    setData({ ...data, items: next });
    setSaid(`${r.title} moved ${dir < 0 ? 'up' : 'down'}, now ${vi + dir + 1} of ${shown.length}.`);
    const results = await Promise.all(changed.map((x) => supabase.from('ramp_resources').update({ sort: x.sort }).eq('id', x.id)));
    const err = results.find((x) => x.error)?.error;
    if (err) {
      setData((p) => ({ roles: p?.roles || [], items: before }));
      toast(`Couldn’t save the new order. ${errText(err)}`, 'bad');
      reload();
    }
  }

  async function remove(r: Resource) {
    const ok = await confirm({
      title: `Delete “${r.title}”?`,
      body: r.file_path ? 'The resource and its file are removed for everyone. This can’t be undone.' : 'It’s removed for everyone. This can’t be undone.',
      action: 'Delete resource', danger: true,
    });
    if (!ok || !data) return false;
    const before = data.items;
    setData({ ...data, items: before.filter((x) => x.id !== r.id) });
    const { error } = await supabase.from('ramp_resources').delete().eq('id', r.id);
    if (error) {
      setData((p) => ({ roles: p?.roles || [], items: before }));
      toast(errText(error), 'bad');
      return false;
    }
    if (r.file_path) supabase.storage.from(FILES_BUCKET).remove([r.file_path]).then(() => {});
    toast('Resource deleted.');
    return true;
  }

  const onSaved = useCallback((r: Resource, isNew: boolean) => {
    setData((p) => {
      const list = p?.items || [];
      return { roles: p?.roles || [], items: ordered(isNew ? [...list, r] : list.map((x) => (x.id === r.id ? r : x))) };
    });
  }, [setData]);

  const roleTitle = (id: string | null) => data?.roles.find((x) => x.id === id)?.title;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={groupOf('/admin/resources')} title="Resources"
        subtitle="Policies, SOPs, guides and tools everyone can find in Resources. Use the arrows to set the order."
        actions={<Button variant="primary" icon="plus" onClick={() => setEditing('new')} disabled={!data}>Add a resource</Button>} />

      {res.error && !data ? <ErrorBox error={res.error} onRetry={reload} />
        : !data ? <Skeleton rows={5} />
          : items.length === 0 ? (
            <Card>
              <EmptyState icon="folder" title="No resources yet" body="Add your handbook, SOPs and the tools people use, as a link, a file or a page of text."
                action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add a resource</Button>} />
            </Card>
          ) : (
            <>
              <Pills label="Category" size="sm" value={cat} onChange={setCat}
                options={[{ value: 'all', label: `All (${items.length})` }, ...CATEGORIES.filter((c) => counts[c.value]).map((c) => ({ value: c.value, label: `${c.label} (${counts[c.value]})` }))]} />
              <Card padded={false} className="overflow-hidden">
                {shown.length === 0 ? (
                  <EmptyState icon="folder" title={`No ${CAT_LABEL[cat as Category]?.toLowerCase() || ''} resources`} action={<Button onClick={() => setCat('all')}>Show all</Button>} />
                ) : (
                  <ol>
                    {shown.map((r, i) => (
                      <li key={r.id} className="flex items-center gap-1 sm:gap-2 pl-1 sm:pl-2 pr-3 py-2 border-t border-line-2 first:border-t-0">
                        <div className="flex flex-col sm:flex-row shrink-0">
                          <IconButton icon="chevronUp" label={`Move ${r.title} up`} disabled={i === 0} onClick={() => move(r, -1)} />
                          <IconButton icon="chevronDown" label={`Move ${r.title} down`} disabled={i === shown.length - 1} onClick={() => move(r, 1)} />
                        </div>
                        <button type="button" onClick={() => setEditing(r)} className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer rounded-xl px-2 py-2 hover:bg-[#FAFBFC] min-h-14">
                          <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0">
                            <Icon name={r.file_path ? 'file' : r.url ? 'link' : 'fileText'} size={19} />
                          </span>
                          <span className="min-w-0 flex-1 flex flex-col gap-1">
                            <span className="font-semibold text-[15px] break-words">{r.title}</span>
                            <span className="flex flex-wrap gap-1.5">
                              <Chip tone="neutral">{CAT_LABEL[r.category]}</Chip>
                              {r.required && <Chip tone="warn">Required</Chip>}
                              <Chip tone={r.job_role_id ? 'brand' : 'neutral'}>{r.job_role_id ? roleTitle(r.job_role_id) || 'One role' : 'Everyone'}</Chip>
                              {r.guest_visible && <Chip tone="neutral" icon="eye">Guests</Chip>}
                            </span>
                          </span>
                          <Icon name="pen" size={18} className="text-muted shrink-0" />
                          <span className="sr-only">Edit</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
              <p className="sr-only" aria-live="polite">{said}</p>
            </>
          )}

      <EditSheet item={editing} roles={data?.roles || []} nextSort={(items.at(-1)?.sort ?? 0) + 10} onClose={closeEdit} onSaved={onSaved} onDelete={remove} />
      {dialog}
    </div>
  );
}

// ───────────────────────── add / edit ─────────────────────────

function EditSheet(props: { item: Resource | 'new' | null; roles: JobRole[]; nextSort: number; onClose: () => void; onSaved: (r: Resource, isNew: boolean) => void; onDelete: (r: Resource) => Promise<boolean> }) {
  if (!props.item) return null;
  return <EditBody key={props.item === 'new' ? 'new' : props.item.id} {...props} item={props.item} />;
}

function EditBody({ item, roles, nextSort, onClose, onSaved, onDelete }: { item: Resource | 'new'; roles: JobRole[]; nextSort: number; onClose: () => void; onSaved: (r: Resource, isNew: boolean) => void; onDelete: (r: Resource) => Promise<boolean> }) {
  const toast = useToast();
  const cur = item === 'new' ? null : item;
  const [title, setTitle] = useState(cur?.title || '');
  const [category, setCategory] = useState<Category>(cur?.category || 'guide');
  const [url, setUrl] = useState(cur?.url || '');
  const [body, setBody] = useState(cur?.body || '');
  const [role, setRole] = useState(cur?.job_role_id || '');
  const [required, setRequired] = useState(cur?.required || false);
  const [guest, setGuest] = useState(cur?.guest_visible || false);
  const [file, setFile] = useState<File | null>(null);
  const [dropFile, setDropFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [titleErr, setTitleErr] = useState('');
  const [urlErr, setUrlErr] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const keptPath = dropFile ? null : cur?.file_path || null;

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setError(`${f.name} is ${fmtSize(f.size)}. Files can be up to 25 MB.`); return; }
    setError('');
    setFile(f);
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    let link = url.trim();
    // Links starting with "/" are pages inside RAMP, like /guide.
    const internal = link.startsWith('/');
    if (link && !internal && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    const tErr = title.trim() ? '' : 'Give it a title.';
    const uErr = link && !internal && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(link) ? 'Enter a full web address, like https://example.com/handbook, or a RAMP page like /guide.' : '';
    setTitleErr(tErr);
    setUrlErr(uErr);
    if (tErr || uErr) { focusInvalid('ops-resource-form'); return; }
    if (!link && !file && !keptPath && !body.trim()) { setError('Add a link, a file or some text, so there’s something to open.'); return; }

    setBusy(true);
    let uploaded: string | null = null;
    try {
      if (file) {
        const clean = file.name.replace(/[^\w.\-]+/g, '-').slice(-80) || 'file';
        uploaded = `resources/${crypto.randomUUID()}-${clean}`;
        const { error: upErr } = await supabase.storage.from(FILES_BUCKET).upload(uploaded, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) { uploaded = null; throw upErr; }
      }
      const row = {
        title: title.trim(), category, url: link, body: body.trim(), file_path: uploaded || keptPath,
        job_role_id: role || null, required, guest_visible: guest,
      };
      const r = cur
        ? await supabase.from('ramp_resources').update(row).eq('id', cur.id).select('*').single()
        : await supabase.from('ramp_resources').insert({ ...row, sort: nextSort }).select('*').single();
      if (r.error) throw r.error;
      // The old file is no longer used once it's replaced or removed.
      if (cur?.file_path && cur.file_path !== row.file_path) supabase.storage.from(FILES_BUCKET).remove([cur.file_path]).then(() => {});
      onSaved(r.data as Resource, !cur);
      toast(cur ? 'Resource saved.' : 'Resource added.');
      onClose();
    } catch (x) {
      if (uploaded) supabase.storage.from(FILES_BUCKET).remove([uploaded]).then(() => {});
      setError(errText(x));
      setBusy(false);
    }
  }

  async function del() {
    if (!cur) return;
    if (await onDelete(cur)) onClose();
  }

  async function preview() {
    if (!cur?.file_path) return;
    try { await openFile(cur.file_path); } catch (x) { toast(errText(x), 'bad'); }
  }

  const fileName = file ? file.name : keptPath ? cleanFileName(keptPath.split('/').pop() || '') : '';

  return (
    <Sheet open onClose={onClose} title={cur ? 'Edit resource' : 'Add a resource'} wide
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="ops-resource-form" loading={busy}>{cur ? 'Save changes' : 'Add resource'}</Button>
      </>}>
      <form id="ops-resource-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field label="Title" required error={titleErr}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Employee handbook" aria-invalid={!!titleErr} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Category</span>
          <Pills options={CATEGORIES} value={category} onChange={setCategory} label="Category" size="sm" />
        </div>

        <Field label="Link" error={urlErr} hint="A page, document or tool people should open. Leave empty to use a file or text instead.">
          <Input type="text" inputMode="url" autoCapitalize="none" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" aria-invalid={!!urlErr} />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">File</span>
          {fileName ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5">
              <div className="flex items-start gap-2 min-w-0">
                <Icon name="paperclip" size={18} className="text-brand-ink mt-0.5" />
                <span className="min-w-0 flex-1 text-[15px] break-all">
                  {fileName}
                  {file && <span className="block text-muted text-sm break-normal">{fmtSize(file.size)} · uploads when you save</span>}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {!file && keptPath && <Button size="sm" icon="eye" onClick={preview}>Open</Button>}
                <Button size="sm" icon="upload" onClick={() => fileInput.current?.click()}>Replace</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (file) setFile(null); else setDropFile(true); }}>Remove file</Button>
              </div>
            </div>
          ) : (
            <Button icon="upload" className="self-start" onClick={() => fileInput.current?.click()}>Choose a file</Button>
          )}
          <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="text-xs text-muted">PDF, document, image or slides, up to 25 MB. Files open through a private, short-lived link.</span>
        </div>

        <Field label="Text" hint="Shown on the resource itself. Use it for a short SOP, or to say what the link or file is for.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
        </Field>

        <Field label="Who it’s for">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Everyone</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.title} only</option>)}
          </Select>
        </Field>
        <div className="flex flex-col rounded-xl border border-line px-3">
          <Checkbox checked={required} onChange={setRequired} label="Required reading" hint="Highlighted for the people it’s for." />
          <div className="border-t border-line-2" />
          <Checkbox checked={guest} onChange={setGuest} label="Guests can see it" hint="Contractors and candidates with guest access." />
        </div>
        <FormError error={error} />
        {cur && (
          <div className="border-t border-line pt-4 mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Remove it for everyone, along with its file.</p>
            <Button variant="danger" size="sm" icon="trash" onClick={del}>Delete resource</Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

