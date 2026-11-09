// Person profile: Documents tab (applicable templates and their records) and Files tab (every file they've uploaded).

import { useCallback, useMemo, useState } from 'react';
import { FILES_BUCKET, errText, openFile, supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { docsFor, latestFor } from '../../lib/plan';
import { KINDS, STAGES, cx, fmtDateTime, plural } from '../../lib/util';
import type { Member, Submission, Template, TemplateStage } from '../../lib/types';
import { RecordView } from '../../components/RecordView';
import { Button, Card, CardHeader, Chip, EmptyState, ErrorBox, Icon, Notice, Progress as Bar, Skeleton, useToast } from '../../ui';
import { cleanFileName, fmtSize } from './ops-common';

const KIND_ICON: Record<Template['kind'], string> = { form: 'fileText', upload: 'upload', esign: 'pen', checklist: 'tasks' };
const STAGE_ORDER: TemplateStage[] = ['before', 'onboarding', 'first_week'];

/** Must they complete it? Staff: onboarding and first-week documents. Guests: everything shared with them. */
export const isRequiredDoc = (t: Template, m: Member) => m.level === 'guest' || t.stage !== 'before';

export function DocumentsTab({ member, templates, subs }: { member: Member; templates: Template[]; subs: Submission[] }) {
  const { org } = useMe();
  const [view, setView] = useState<Submission | null>(null);
  const closeView = useCallback(() => setView(null), []);
  const applicable = useMemo(() => docsFor(member, templates), [member, templates]);
  const appIds = new Set(applicable.map((t) => t.id));
  const other = subs.filter((s) => !s.template_id || !appIds.has(s.template_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const required = applicable.filter((t) => isRequiredDoc(t, member));
  const reqDone = required.filter((t) => latestFor(t.id, subs)).length;
  const tplFor = (s: Submission | null) => (s?.template_id ? templates.find((t) => t.id === s.template_id) || null : null);

  if (!applicable.length && !subs.length) {
    return (
      <Card>
        <EmptyState icon="fileText" title="No documents for them yet" body="Publish templates in Admin › Documents. Templates for everyone or for their job role show up here." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {required.length > 0 && (
        <Card>
          <CardHeader title={`${reqDone} of ${plural(required.length, 'required document')} done`}
            subtitle={reqDone < required.length ? `${required.length - reqDone} still missing. They’re marked below.` : 'Everything required is in.'} className="mb-3" />
          <Bar value={(reqDone / required.length) * 100} tone={reqDone === required.length ? 'good' : 'amber'} label="Required documents done" />
        </Card>
      )}

      {STAGE_ORDER.map((stage) => {
        const list = applicable.filter((t) => t.stage === stage);
        if (!list.length) return null;
        return (
          <section key={stage} className="flex flex-col gap-2" aria-label={STAGES[stage].label}>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2 px-1">
              <h2 className="font-display text-lg font-semibold">{STAGES[stage].label}</h2>
              <span className="text-[13px] text-muted">{STAGES[stage].desc}</span>
            </div>
            <Card padded={false} className="overflow-hidden">
              <ul>
                {list.map((t) => {
                  const all = subs.filter((s) => s.template_id === t.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
                  const latest = all[0] || null;
                  const req = isRequiredDoc(t, member);
                  const missing = !latest && req;
                  const outdated = latest && latest.template_version < t.version;
                  return (
                    <li key={t.id} className={cx('flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 border-t border-line-2 first:border-t-0 border-l-4',
                      missing ? 'border-l-amber bg-warn-soft/50' : 'border-l-transparent')}>
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', latest ? 'bg-good-soft text-good' : 'bg-chip text-ink-2')}>
                          <Icon name={KIND_ICON[t.kind]} size={19} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[15px] break-words">{t.title}</p>
                          <p className="text-[13px] text-muted">
                            {KINDS[t.kind].label}
                            {latest ? ` · ${latest.signed_name ? 'Signed' : 'Submitted'} ${fmtDateTime(latest.created_at, org.timezone)}` : ''}
                            {all.length > 1 ? ` · ${plural(all.length - 1, 'earlier record')}` : ''}
                          </p>
                          {outdated && <p className="text-[13px] text-warn mt-0.5">Signed on version {latest.template_version}. The template is now version {t.version}.</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-[52px] sm:pl-0">
                        {latest ? <Chip tone="good" icon="check">{latest.signed_name ? 'Signed' : 'Done'}</Chip>
                          : missing ? <Chip tone="warn" icon="alert">Missing</Chip>
                            : <Chip tone="neutral">Not done</Chip>}
                        {t.fields.some((f) => f.type === 'secure' || f.secure) && <Chip tone="neutral" icon="lock">Encrypted</Chip>}
                        {latest && <Button size="sm" icon="eye" onClick={() => setView(latest)}>View record</Button>}
                      </div>
                      {all.length > 1 && (
                        <details className="sm:basis-full text-sm pl-[52px] sm:pl-[52px] -mt-1">
                          <summary className="cursor-pointer min-h-11 flex items-center font-semibold text-brand-ink">Earlier records</summary>
                          <ul className="flex flex-col gap-1 pb-1">
                            {all.slice(1).map((s) => (
                              <li key={s.id}>
                                <button type="button" onClick={() => setView(s)} className="min-h-11 text-left text-ink-2 hover:text-brand-ink cursor-pointer underline-offset-2 hover:underline">
                                  Version {s.template_version} · {fmtDateTime(s.created_at, org.timezone)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        );
      })}

      {other.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Other records">
          <div className="px-1">
            <h2 className="font-display text-lg font-semibold">Other records</h2>
            <p className="text-[13px] text-muted">Documents they completed that no longer apply to them, or whose template was removed.</p>
          </div>
          <Card padded={false} className="overflow-hidden">
            <ul>
              {other.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3 border-t border-line-2 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[15px] break-words">{s.template_title}</p>
                    <p className="text-[13px] text-muted">Version {s.template_version} · {fmtDateTime(s.created_at, org.timezone)}</p>
                  </div>
                  <Button size="sm" icon="eye" onClick={() => setView(s)}>View record</Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <RecordView submission={view} template={tplFor(view)} open={!!view} onClose={closeView} tz={org.timezone} adminView />
    </div>
  );
}

// ───────── Files ─────────

interface StoredFile { name: string; path: string; size?: number; at?: string }

async function listFolder(memberId: string, folder: string): Promise<StoredFile[]> {
  const { data, error } = await supabase.storage.from(FILES_BUCKET).list(`${memberId}/${folder}`, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || [])
    .filter((f) => f.id && f.name !== '.emptyFolderPlaceholder')
    .map((f) => ({ name: cleanFileName(f.name), path: `${memberId}/${folder}/${f.name}`, size: (f.metadata as { size?: number } | null)?.size, at: f.created_at || undefined }));
}

export function FilesTab({ member, subs }: { member: Member; subs: Submission[] }) {
  const { org } = useMe();
  const toast = useToast();
  const [opening, setOpening] = useState('');
  const storage = useAsync(async () => {
    const [documents, notes] = await Promise.all([listFolder(member.id, 'documents'), listFolder(member.id, 'notes')]);
    return { documents, notes };
  }, [member.id]);

  const fromSubs = useMemo(() => subs
    .slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    .flatMap((s) => (s.files || []).map((f) => ({ ...f, sub: s }))), [subs]);
  const known = new Set(fromSubs.map((f) => f.path));
  const loose = (storage.data?.documents || []).filter((f) => !known.has(f.path));
  const notes = storage.data?.notes || [];

  async function open(path: string, detail: string) {
    setOpening(path);
    try {
      await openFile(path, { member: member.id, detail });
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setOpening('');
    }
  }

  const row = (key: string, name: string, meta: string, onOpen: () => void, secure?: boolean) => (
    <li key={key} className="flex items-center gap-3 px-4 py-3 border-t border-line-2 first:border-t-0">
      <span className="w-10 h-10 rounded-xl bg-chip text-ink-2 flex items-center justify-center shrink-0"><Icon name="file" size={19} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[15px] truncate" title={name}>{name}</p>
        <p className="text-[13px] text-muted truncate">{meta}</p>
      </div>
      {secure && <Chip tone="warn" icon="lock" className="hidden sm:inline-flex">Sensitive</Chip>}
      <Button size="sm" icon="eye" onClick={onOpen} loading={opening === key} aria-label={`Open ${name}`}>Open</Button>
    </li>
  );

  const nothing = !fromSubs.length && storage.data && !loose.length && !notes.length;

  return (
    <div className="flex flex-col gap-5">
      <Notice tone="brand" icon="eye">Opening a file creates a link that works for two minutes, and the view is recorded in the audit log with your name.</Notice>

      {nothing && (
        <Card><EmptyState icon="paperclip" title="No files yet" body="Files they attach to documents or notebook pages show up here." /></Card>
      )}

      {fromSubs.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Files from documents">
          <h2 className="font-display text-lg font-semibold px-1">From documents</h2>
          <Card padded={false} className="overflow-hidden">
            <ul>
              {fromSubs.map((f) => row(f.path, f.name, `${f.label} · ${f.sub.template_title} · ${fmtDateTime(f.sub.created_at, org.timezone)}`,
                () => open(f.path, `${f.name} on ${f.sub.template_title}`), f.secure))}
            </ul>
          </Card>
        </section>
      )}

      {storage.error && !storage.data && <ErrorBox error={storage.error} onRetry={storage.reload} />}
      {!storage.data && !storage.error && <Skeleton rows={2} />}

      {loose.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Other uploads">
          <div className="px-1">
            <h2 className="font-display text-lg font-semibold">Other uploads</h2>
            <p className="text-[13px] text-muted">Uploaded to a document they haven’t sent yet, or replaced before sending.</p>
          </div>
          <Card padded={false} className="overflow-hidden">
            <ul>{loose.map((f) => row(f.path, f.name, [fmtSize(f.size), f.at ? fmtDateTime(f.at, org.timezone) : ''].filter(Boolean).join(' · '), () => open(f.path, `${f.name} (unsent upload)`)))}</ul>
          </Card>
        </section>
      )}

      {notes.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Notebook files">
          <div className="px-1">
            <h2 className="font-display text-lg font-semibold">Notebook files</h2>
            <p className="text-[13px] text-muted">Attached to their notebook pages. Only open these when you need to.</p>
          </div>
          <Card padded={false} className="overflow-hidden">
            <ul>{notes.map((f) => row(f.path, f.name, [fmtSize(f.size), f.at ? fmtDateTime(f.at, org.timezone) : ''].filter(Boolean).join(' · '), () => open(f.path, `${f.name} (notebook file)`)))}</ul>
          </Card>
        </section>
      )}
    </div>
  );
}
