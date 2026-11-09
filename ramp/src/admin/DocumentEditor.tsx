import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { FIELD_TYPES, KINDS, STAGES, plural, slugKey } from '../lib/util';
import type { FieldType, JobRole, Module, Template, TemplateField, TemplateKind, TemplateStage } from '../lib/types';
import { Button, Card, Checkbox, Chip, EmptyState, ErrorBox, Field, Icon, IconButton, Input, LinkButton, Notice, PageHeader, Pills, Select, Sheet, Skeleton, Textarea, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, Group, ListEditor, MoveButtons, SaveBar, SectionHead, StatusChip, move, placeholdersIn, same, templateTexts, useLeaveGuard } from './parts/setup-kit';
import { TemplatePreviewSheet } from './parts/setup-field-preview';

type Role = Pick<JobRole, 'id' | 'title'>;
type Editable = Pick<Template, 'title' | 'kind' | 'stage' | 'audience' | 'job_role_id' | 'description' | 'legal_review' | 'fields'>;
interface Data { t: Template | null; roles: Role[]; subs: number; tasks: number; linked: { id: string; title: string }[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIENCES: { value: Template['audience']; label: string; desc: string }[] = [
  { value: 'everyone', label: 'Everyone', desc: 'Every staff member. Before-start documents also go to guests.' },
  { value: 'role', label: 'One job role', desc: 'Only people with the job role you pick.' },
  { value: 'candidates', label: 'Candidates and guests', desc: 'Only people with guest access, like candidates and contractors.' },
];
const DEFAULT_LABEL: Record<FieldType, string> = {
  text: 'New question', email: 'Email', phone: 'Phone number', date: 'Date', choice: 'Pick one', file: 'Upload a file',
  check: 'I confirm that…', sign: 'Signature', secure: 'Sensitive detail', info: 'Instructions',
};
const TYPE_ICON: Record<FieldType, string> = {
  text: 'pen', email: 'mail', phone: 'chat', date: 'calendar', choice: 'list', file: 'upload', check: 'check', sign: 'pen', secure: 'lock', info: 'info',
};

const editable = (t: Template): Editable => ({
  title: t.title, kind: t.kind, stage: t.stage, audience: t.audience, job_role_id: t.job_role_id,
  description: t.description || '', legal_review: !!t.legal_review, fields: t.fields || [],
});

/** Trim text and drop empty extras so what we store is tidy. */
function clean(d: Editable): Editable {
  return {
    ...d,
    title: d.title.trim(),
    description: d.description.trim(),
    job_role_id: d.audience === 'role' ? d.job_role_id : null,
    fields: d.fields.map((f) => {
      const out: TemplateField = { k: f.k, type: f.type, label: f.label.trim() };
      if (f.required && f.type !== 'info') out.required = true;
      if (f.type === 'secure' || (f.secure && (f.type !== 'info'))) out.secure = true;
      if (f.type === 'choice') out.options = (f.options || []).map((o) => o.trim()).filter(Boolean);
      if (f.help?.trim()) out.help = f.help.trim();
      return out;
    }),
  };
}

function check(d: Editable, roles: Role[]) {
  const titleErrors: string[] = [];
  if (!d.title.trim()) titleErrors.push('Give the document a title.');
  if (d.title.trim().length > 120) titleErrors.push('Keep the title to 120 characters or fewer.');
  const errors: string[] = [...titleErrors];
  const warnings: string[] = [];
  if (d.audience === 'role' && !roles.some((r) => r.id === d.job_role_id)) errors.push('Pick the job role this document is for.');
  d.fields.forEach((f, i) => {
    const name = `Field ${i + 1}${f.label.trim() ? ` (“${f.label.trim().slice(0, 40)}”)` : ''}`;
    if (!f.label.trim()) errors.push(`${name} needs a label.`);
    if (f.type === 'choice' && (f.options || []).filter((o) => o.trim()).length < 2) errors.push(`${name} needs at least two options.`);
  });
  const ph = placeholdersIn(templateTexts(d));
  if (ph.length) warnings.push(`It still has ${plural(ph.length, 'placeholder')} in [brackets], like ${ph[0]}.`);
  if (d.legal_review) warnings.push('It’s marked as needing legal review. Have an employment lawyer check it before people sign it.');
  if (d.kind === 'esign' && !d.fields.some((f) => f.type === 'sign')) warnings.push('It’s an e-sign document but has no signature field.');
  if (d.kind === 'upload' && !d.fields.some((f) => f.type === 'file')) warnings.push('It’s an upload document but has no file upload field.');
  return { titleErrors, errors, warnings };
}

export default function DocumentEditor() {
  const { id = '' } = useParams();
  const { data, error, loading, reload, setData } = useAsync<Data>(async () => {
    if (!UUID.test(id)) return { t: null, roles: [], subs: 0, tasks: 0, linked: [] };
    const [t, roles, subs, tasks, mods] = await Promise.all([
      q<Template | null>(supabase.from('ramp_templates').select('*').eq('id', id).maybeSingle()),
      q<Role[]>(supabase.from('ramp_job_roles').select('id, title').order('title')),
      supabase.from('ramp_submissions').select('id', { count: 'exact', head: true }).eq('template_id', id),
      supabase.from('ramp_tasks').select('id', { count: 'exact', head: true }).eq('template_id', id).neq('status', 'done'),
      q<Pick<Module, 'id' | 'title' | 'blocks'>[]>(supabase.from('ramp_modules').select('id, title, blocks')),
    ]);
    if (subs.error) throw subs.error;
    const linked = mods.filter((m) => (m.blocks || []).some((b) => b.type === 'form' && b.template_id === id)).map((m) => ({ id: m.id, title: m.title }));
    return { t, roles, subs: subs.count || 0, tasks: tasks.count || 0, linked };
  }, [id]);
  useTitle(data?.t ? `${data.t.title} · Documents` : 'Document');

  if (loading && !data) {
    return <div className="flex flex-col gap-6"><PageHeader back={ADMIN_BACK} eyebrow={<Eyebrow />} title="Document" /><Skeleton rows={6} /></div>;
  }
  if (error && !data) {
    return <div className="flex flex-col gap-6"><PageHeader back={ADMIN_BACK} eyebrow={<Eyebrow />} title="Document" /><ErrorBox error={error} onRetry={reload} /></div>;
  }
  if (!data?.t) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={ADMIN_BACK} eyebrow={<Eyebrow />} title="Document not found" />
        <Card><EmptyState icon="fileText" title="This document doesn’t exist" body="It may have been deleted. Go back to your documents to pick another one or start a new one."
          action={<LinkButton to="/admin/documents" variant="primary">All documents</LinkButton>} /></Card>
      </div>
    );
  }
  return <Editor key={data.t.id} data={data as Data & { t: Template }} onSaved={(t) => setData((d) => ({ ...(d as Data), t }))} />;
}

function Eyebrow() {
  return <>Set up · <Link to="/admin/documents" className="text-brand-ink underline-offset-2">Documents</Link></>;
}

function Editor({ data, onSaved }: { data: Data & { t: Template }; onSaved: (t: Template) => void }) {
  const t = data.t;
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const saved = editable(t);
  const [draft, setDraft] = useState<Editable>(saved);
  const [busy, setBusy] = useState<'' | 'save' | 'publish' | 'unpublish' | 'delete'>('');
  const [issues, setIssues] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [adding, setAdding] = useState<FieldType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);
  const dirty = !same(clean(draft), clean(saved)) || !same(draft.fields.map((f) => f.k), saved.fields.map((f) => f.k));
  const { dialog: leaveDialog, allowLeave } = useLeaveGuard(dirty);
  const fieldsChanged = !same(clean(draft).fields, clean(saved).fields);
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => { setDraft((d) => ({ ...d, [k]: v })); setIssues([]); };
  const setFields = (fields: TemplateField[]) => set('fields', fields);
  const updateField = (i: number, patch: Partial<TemplateField>) => setFields(draft.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const ph = placeholdersIn(templateTexts(draft));

  async function write(extra: Partial<Template> = {}, withDraft = true) {
    // Only send fields when they really changed: any change to them bumps a published template's version.
    const c: Partial<Editable> = clean(draft);
    if (same(c.fields, clean(saved).fields)) delete c.fields;
    const body = withDraft ? { ...c, ...extra } : extra;
    const { data: row, error } = await supabase.from('ramp_templates').update(body).eq('id', t.id).select().single();
    if (error) throw error;
    const next = row as Template;
    onSaved(next);
    if (withDraft) setDraft(editable(next));
    return next;
  }

  async function save() {
    const { errors, titleErrors } = check(draft, data.roles);
    const blocking = t.status === 'published' ? errors : titleErrors;
    if (blocking.length) { showIssues(blocking); return; }
    setBusy('save');
    try {
      const next = await write();
      toast(next.version > t.version ? `Saved. This is now version ${next.version}.` : 'Document saved.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  function showIssues(list: string[]) {
    setIssues(list);
    requestAnimationFrame(() => issuesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function publish() {
    const { errors, warnings } = check(draft, data.roles);
    if (errors.length) { showIssues(errors); return; }
    const who = { before: 'Candidates and guests can complete it before they start.', onboarding: 'New people will complete it in the welcome flow.', first_week: 'It becomes a task for new people when they finish the welcome flow.' }[draft.stage];
    const ok = await confirm(warnings.length
      ? { title: 'Publish with warnings?', body: `${warnings.join(' ')} ${who}`, action: 'Publish anyway' }
      : { title: `Publish ${draft.title.trim()}?`, body: who, action: 'Publish' });
    if (!ok) return;
    setBusy('publish');
    try {
      await write({ status: 'published' });
      toast(`${draft.title.trim()} published.`);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  async function unpublish(fromDelete = false) {
    const ok = fromDelete || await confirm({
      title: `Unpublish ${t.title}?`,
      body: 'People who haven’t completed it won’t see it anymore. Records already submitted stay in each person’s profile.',
      action: 'Unpublish',
    });
    if (!ok) return;
    setBusy('unpublish');
    try {
      await write({ status: 'draft' }, false);
      toast(`${t.title} is a draft again.`);
      setDeleting(false);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    setBusy('delete');
    const { error } = await supabase.from('ramp_templates').delete().eq('id', t.id);
    if (error) { setBusy(''); toast(errText(error), 'bad'); return; }
    toast(`${t.title} deleted.`);
    allowLeave();
    navigate('/admin/documents', { replace: true });
  }

  async function removeField(i: number) {
    const f = draft.fields[i]!;
    if (saved.fields.some((x) => x.k === f.k)) {
      const ok = await confirm({
        title: `Remove “${f.label || FIELD_TYPES[f.type]}”?`,
        body: data.subs ? 'Answers people already gave to this field stay on their records. New submissions won’t ask for it.' : 'The field is removed when you save.',
        action: 'Remove field', danger: true,
      });
      if (!ok) return;
    }
    setFields(draft.fields.filter((_, j) => j !== i));
  }

  function addField(f: TemplateField) {
    setFields([...draft.fields, f]);
    setAdding(null);
    requestAnimationFrame(() => document.getElementById(`field-${f.k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  const roleOk = draft.audience !== 'role' || data.roles.some((r) => r.id === draft.job_role_id);
  const busyAny = !!busy;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={<Eyebrow />} title={draft.title.trim() || 'Untitled document'}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusChip status={t.status} /><span>Version {t.version} · {data.subs ? plural(data.subs, 'submission') : 'No submissions yet'}</span></span>}
        actions={<>
          <Button icon="eye" onClick={() => setPreview(true)}>Preview</Button>
          {t.status === 'published' && <Button onClick={() => unpublish()} loading={busy === 'unpublish'} disabled={busyAny}>Unpublish</Button>}
          <Button variant="danger" icon="trash" onClick={() => setDeleting(true)} disabled={busyAny}>Delete</Button>
        </>} />

      <Card className="flex flex-col gap-5">
        <SectionHead title="Details" />
        <Field label="Title" required>
          <Input value={draft.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Short description" hint="Shown under the title. Say what it’s for and anything people need to have ready.">
          <Textarea value={draft.description} rows={2} maxLength={600} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Type</span>
          <Pills label="Type" value={draft.kind} onChange={(v: TemplateKind) => set('kind', v)}
            options={(Object.keys(KINDS) as TemplateKind[]).map((k) => ({ value: k, label: KINDS[k].label }))} />
          <span className="text-xs text-muted">People see the button “{KINDS[draft.kind].action}”.</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">When it’s completed</span>
          <Pills label="When it’s completed" value={draft.stage} onChange={(v: TemplateStage) => set('stage', v)}
            options={(Object.keys(STAGES) as TemplateStage[]).map((k) => ({ value: k, label: STAGES[k].label }))} />
          <span className="text-xs text-muted">{STAGES[draft.stage].desc}.</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Who completes it</span>
          <Pills label="Who completes it" value={draft.audience} onChange={(v: Template['audience']) => set('audience', v)} options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))} />
          <span className="text-xs text-muted">{AUDIENCES.find((a) => a.value === draft.audience)?.desc}</span>
          {draft.audience === 'role' && (
            <Field label="Job role" required error={!roleOk ? 'Pick a job role.' : undefined} className="mt-1"
              hint={data.roles.length ? undefined : <>No job roles yet. <Link to="/admin/roles" className="font-semibold text-brand-ink">Add one</Link> first.</>}>
              <Select value={draft.job_role_id || ''} onChange={(e) => set('job_role_id', e.target.value || null)}>
                <option value="">Pick a role</option>
                {data.roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-line-2 pt-3">
          <Checkbox checked={draft.legal_review} onChange={(v) => set('legal_review', v)} label="Needs legal review"
            hint="Turn this off once an employment lawyer has checked the wording. You’ll be warned before publishing while it’s on." />
          {draft.legal_review && (
            <Notice tone="warn" icon="alert">Rules for agreements like non-competes differ by state, and some states don’t allow them. Have an employment lawyer review this before people sign it.</Notice>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionHead title="Fields" subtitle="People see these in this order."
          action={<Button icon="eye" onClick={() => setPreview(true)}>Preview</Button>} />
        {t.status === 'published' && (
          <Notice tone={fieldsChanged ? 'warn' : 'brand'} icon="info">
            This document is published. Saving changes to its fields creates version {t.version + 1}. Records already submitted keep the version people signed.
          </Notice>
        )}
        {ph.length > 0 && (
          <Notice tone="warn" icon="alert">Replace the text in [brackets] with your own: {ph.slice(0, 3).join(', ')}{ph.length > 3 && ` and ${ph.length - 3} more`}.</Notice>
        )}
        {draft.fields.length === 0 ? (
          <p className="text-sm text-muted rounded-xl bg-bg px-4 py-6 text-center">No fields yet. Add one below. A document with no fields just records that someone read it.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {draft.fields.map((f, i) => (
              <FieldCard key={f.k} f={f} i={i} count={draft.fields.length} onChange={(p) => updateField(i, p)}
                onMove={(d) => setFields(move(draft.fields, i, d))} onRemove={() => removeField(i)} />
            ))}
          </ol>
        )}
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-[13px] font-semibold text-ink-2">Add a field</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {(Object.keys(FIELD_TYPES) as FieldType[]).map((ft) => (
              <button key={ft} type="button" onClick={() => setAdding(ft)}
                className="flex items-center gap-2 min-h-11 px-3 rounded-xl border border-dashed border-[#C9CED6] bg-white text-sm font-semibold text-ink-2 hover:bg-brand-soft hover:text-brand-ink hover:border-brand cursor-pointer text-left">
                <Icon name={TYPE_ICON[ft]} size={16} />{FIELD_TYPES[ft]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {data.linked.length > 0 && (
        <p className="text-sm text-muted px-1">Used in training: {data.linked.map((m, i) => <span key={m.id}>{i > 0 && ', '}<Link to={`/admin/training/${m.id}`} className="font-semibold text-brand-ink">{m.title}</Link></span>)}.</p>
      )}

      {issues.length > 0 && (
        <div ref={issuesRef}>
          <Notice tone="bad" icon="alert">
            <p className="font-semibold">Fix {issues.length === 1 ? 'this' : 'these'} first:</p>
            <ul className="list-disc pl-5 mt-1">{issues.map((x) => <li key={x}>{x}</li>)}</ul>
          </Notice>
        </div>
      )}

      <SaveBar dirty={dirty} saving={busy === 'save' || busy === 'publish'}
        note={dirty && fieldsChanged && t.status === 'published' ? undefined : t.status === 'published' ? 'Published and saved' : 'Draft saved'}>
        {dirty && <Button variant="ghost" onClick={() => { setDraft(saved); setIssues([]); }} disabled={busyAny}>Discard</Button>}
        {(dirty || t.status === 'published') && (
          <Button variant={t.status === 'published' ? 'primary' : 'secondary'} onClick={save} loading={busy === 'save'} disabled={!dirty || busyAny} icon="check">
            {t.status === 'published' && fieldsChanged ? `Save as version ${t.version + 1}` : 'Save'}
          </Button>
        )}
        {t.status === 'draft' && (
          <Button variant="primary" onClick={publish} loading={busy === 'publish'} disabled={busyAny} icon="send">{dirty ? 'Save and publish' : 'Publish'}</Button>
        )}
      </SaveBar>

      <TemplatePreviewSheet open={preview} onClose={() => setPreview(false)} template={{ ...clean(draft), version: t.version }} />
      {adding && <AddFieldSheet type={adding} onClose={() => setAdding(null)} onAdd={addField} />}
      {deleting && (
        <Sheet open onClose={() => (busy ? undefined : setDeleting(false))} title={`Delete ${t.title}?`}
          footer={<>
            <Button onClick={() => setDeleting(false)} disabled={busyAny}>Cancel</Button>
            {t.status === 'published' && data.subs > 0 && <Button variant="primary" onClick={() => unpublish(true)} loading={busy === 'unpublish'} disabled={busyAny}>Unpublish instead</Button>}
            <Button variant="danger" icon="trash" onClick={remove} loading={busy === 'delete'} disabled={busyAny}>Delete document</Button>
          </>}>
          {data.subs > 0 ? (
            <Notice tone="warn" icon="alert">
              {plural(data.subs, 'record')} {data.subs === 1 ? 'was' : 'were'} submitted with this document. They stay in each person’s profile, but won’t link back to it anymore.
              {t.status === 'published' ? ' Unpublishing stops new submissions and keeps everything together, so it’s usually the better choice.' : ' Keeping it as a draft keeps everything together.'}
            </Notice>
          ) : <p className="text-[15px] text-ink-2 leading-relaxed">Nobody has submitted it yet.</p>}
          {data.tasks > 0 && <p className="text-[15px] text-ink-2 leading-relaxed">{plural(data.tasks, 'open task')} made from it will stay on people’s lists, but won’t open the form anymore.</p>}
          {data.linked.length > 0 && <p className="text-[15px] text-ink-2 leading-relaxed">It’s linked from {data.linked.map((m) => m.title).join(', ')}. That step will have no form to fill in.</p>}
          <p className="text-[15px] text-ink-2 leading-relaxed">Deleting can’t be undone.</p>
        </Sheet>
      )}
      {confirmDialog}
      {leaveDialog}
    </div>
  );
}

function FieldCard({ f, i, count, onChange, onMove, onRemove }: {
  f: TemplateField; i: number; count: number; onChange: (p: Partial<TemplateField>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const secure = f.type === 'secure' || !!f.secure;
  const canSecure = f.type === 'text' || f.type === 'file' || (!!f.secure && f.type !== 'secure' && f.type !== 'info');
  const name = f.label.trim() || FIELD_TYPES[f.type];
  return (
    <li id={`field-${f.k}`} className="rounded-2xl border border-line bg-white scroll-mt-24">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-4 pr-1 py-1 border-b border-line-2 bg-[#FAFBFC] rounded-t-2xl">
        <span className="flex items-center gap-2 text-[13px] font-bold text-ink-2 min-h-11 mr-auto">
          <Icon name={TYPE_ICON[f.type]} size={16} className="text-muted" />{i + 1} · {FIELD_TYPES[f.type]}
          {secure && <Chip icon="lock">Encrypted</Chip>}
        </span>
        <span className="flex ml-auto">
          <MoveButtons index={i} count={count} what={name} onMove={onMove} />
          <IconButton icon="trash" label={`Remove ${name}`} onClick={onRemove} className="text-bad" />
        </span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {f.type === 'info' ? (
          <>
            <Field label="Heading" required error={!f.label.trim() ? 'Add a heading.' : undefined}>
              <Textarea rows={2} value={f.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={500} />
            </Field>
            <Field label="Text" hint="Optional. Each line becomes a paragraph.">
              <Textarea rows={5} value={f.help || ''} onChange={(e) => onChange({ help: e.target.value })} maxLength={20000} />
            </Field>
          </>
        ) : (
          <>
            <Field label={f.type === 'check' ? 'Checkbox text' : f.type === 'sign' ? 'What they’re signing' : 'Question'} required error={!f.label.trim() ? 'Add a label.' : undefined}>
              <Input value={f.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={300} />
            </Field>
            {f.type === 'choice' && (
              <Group label="Options" error={(f.options || []).filter((o) => o.trim()).length < 2 ? 'Add at least two options.' : undefined}>
                <ListEditor items={f.options || []} onChange={(options) => onChange({ options })} label="Option" placeholder="Add an option" empty="No options yet." maxLength={120} />
              </Group>
            )}
            <Field label="Help text" hint="Optional. Shown under the field.">
              <Input value={f.help || ''} onChange={(e) => onChange({ help: e.target.value })} maxLength={300} />
            </Field>
            <div className="flex flex-wrap gap-x-8">
              <Checkbox checked={!!f.required} onChange={(v) => onChange({ required: v })} label="Required" />
              {canSecure && (
                <Checkbox checked={!!f.secure} onChange={(v) => onChange({ secure: v })}
                  label={f.type === 'file' ? 'Sensitive file' : 'Encrypt the answer'}
                  hint={f.type === 'file' ? 'Only owners and admins can open it, and every view is logged.' : 'For things like ID or tax numbers. Admins reveal it on demand, and every reveal is logged.'} />
              )}
              {f.type === 'secure' && <p className="flex items-center gap-1.5 text-[13px] text-muted min-h-11"><Icon name="lock" size={14} />Always encrypted. Every reveal is logged.</p>}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function AddFieldSheet({ type, onClose, onAdd }: { type: FieldType; onClose: () => void; onAdd: (f: TemplateField) => void }) {
  const [label, setLabel] = useState('');
  const [options, setOptions] = useState<string[]>(['Yes', 'No']);
  const [help, setHelp] = useState('');
  const placeholder = DEFAULT_LABEL[type];

  function add() {
    const l = label.trim() || placeholder;
    const f: TemplateField = { k: slugKey(l), type, label: l };
    if (type !== 'info') f.required = true;
    if (type === 'secure') f.secure = true;
    if (type === 'choice') f.options = options.map((o) => o.trim()).filter(Boolean);
    if (help.trim()) f.help = help.trim();
    onAdd(f);
  }

  return (
    <Sheet open onClose={onClose} title={`Add ${FIELD_TYPES[type].toLowerCase()}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="plus" onClick={add}>Add field</Button></>}>
      {type === 'info' ? (
        <>
          <Field label="Heading"><Textarea rows={2} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} /></Field>
          <Field label="Text" hint="Optional. Each line becomes a paragraph."><Textarea rows={5} value={help} onChange={(e) => setHelp(e.target.value)} /></Field>
        </>
      ) : (
        <>
          <Field label={type === 'check' ? 'Checkbox text' : type === 'sign' ? 'What they’re signing' : 'Question'}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} maxLength={300}
              onKeyDown={(e) => { if (e.key === 'Enter' && type !== 'choice') { e.preventDefault(); add(); } }} />
          </Field>
          {type === 'choice' && (
            <Group label="Options"><ListEditor items={options} onChange={setOptions} label="Option" placeholder="Add an option" maxLength={120} /></Group>
          )}
          {type === 'secure' && <Notice icon="lock">Answers are encrypted. Only owners and admins can reveal them, and every reveal is logged.</Notice>}
          {type === 'sign' && <Notice icon="pen">People type their full legal name to sign. RAMP records the time, IP address and device.</Notice>}
          <p className="text-xs text-muted">It’s added as a required field. You can change that after.</p>
        </>
      )}
    </Sheet>
  );
}
