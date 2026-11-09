import { useState } from 'react';
import { supabase, openFile, errText } from '../lib/supabase';
import { deviceText, fmtDateTime } from '../lib/util';
import type { Submission, Template } from '../lib/types';
import { Button, Chip, Icon, Notice, Sheet, useToast } from '../ui';

/**
 * One submitted document: answers in the template's order, sensitive answers hidden until revealed
 * (each reveal is logged), files opened through short-lived links, and the signing record.
 */
export function RecordView({ submission, template, open, onClose, tz, adminView }: {
  submission: Submission | null; template?: Template | null; open: boolean; onClose: () => void; tz?: string; adminView?: boolean;
}) {
  if (!submission || !open) return null;
  return <Body key={submission.id} s={submission} t={template || null} onClose={onClose} tz={tz} adminView={adminView} />;
}

function Body({ s, t, onClose, tz, adminView }: { s: Submission; t: Template | null; onClose: () => void; tz?: string; adminView?: boolean }) {
  const toast = useToast();
  const [revealed, setRevealed] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState('');

  const known = (t?.fields || []).filter((f) => f.type !== 'info');
  const keys = new Set([...Object.keys(s.answers || {}), ...(s.secure_fields || []), ...(s.files || []).map((f) => f.k)]);
  const rows: { k: string; label: string; type: string }[] = [
    ...known.filter((f) => keys.has(f.k)).map((f) => ({ k: f.k, label: f.label, type: f.type })),
    ...[...keys].filter((k) => !known.some((f) => f.k === k)).map((k) => ({ k, label: (s.files || []).find((f) => f.k === k)?.label || k.replace(/_[a-z0-9]{4}$/, '').replace(/_/g, ' '), type: '' })),
  ];

  async function reveal(k: string, label: string) {
    setBusy(k);
    try {
      const { data, error } = await supabase.rpc('ramp_reveal', { p_submission: s.id, p_field: k, p_label: label });
      if (error) throw error;
      setRevealed((r) => ({ ...r, [k]: (data as string) ?? '' }));
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  async function open(path: string, name: string) {
    try {
      await openFile(path, { member: s.member_id, detail: `${name} on ${s.template_title}` });
    } catch (e) {
      toast(errText(e), 'bad');
    }
  }

  return (
    <Sheet open onClose={onClose} title={s.template_title} wide
      subtitle={<>Version {s.template_version} · {s.signed_name ? 'Signed' : 'Submitted'} {fmtDateTime(s.created_at, tz)}</>}
      footer={<Button onClick={onClose}>Close</Button>}>
      {rows.length === 0 && !s.signed_name && <p className="text-[15px] text-muted">No answers were needed for this document.</p>}
      {rows.length > 0 && (
        <dl className="rounded-2xl border border-line divide-y divide-line-2">
          {rows.map((r) => {
            const file = (s.files || []).find((f) => f.k === r.k);
            const secure = (s.secure_fields || []).includes(r.k);
            const val = s.answers?.[r.k];
            return (
              <div key={r.k} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <dt className="text-[13px] font-semibold text-muted sm:w-48 shrink-0">{r.label}</dt>
                <dd className="flex-1 min-w-0 text-[15px] flex flex-wrap items-center gap-2">
                  {file ? (
                    <>
                      <Icon name="paperclip" size={16} className="text-brand-ink" />
                      <span className="truncate min-w-0 flex-1">{file.name}</span>
                      {file.secure && <Chip tone="warn" icon="lock">Sensitive</Chip>}
                      <Button size="sm" icon="eye" onClick={() => open(file.path, file.name)}>Open</Button>
                    </>
                  ) : secure ? (
                    revealed[r.k] !== undefined ? (
                      <span className="font-mono tracking-wide break-all">{revealed[r.k] || '—'}</span>
                    ) : (
                      <>
                        <span className="font-mono text-muted tracking-widest">••••••••</span>
                        <Chip tone="neutral" icon="lock">Encrypted</Chip>
                        <Button size="sm" variant="ghost" icon="eye" loading={busy === r.k} onClick={() => reveal(r.k, r.label)}>Reveal</Button>
                      </>
                    )
                  ) : r.type === 'check' ? (
                    <span className="inline-flex items-center gap-1.5 text-good font-semibold"><Icon name="check" size={16} strokeWidth={2.4} />Yes</span>
                  ) : r.type === 'sign' ? (
                    <span className="font-sign text-3xl leading-none">{val}</span>
                  ) : (
                    <span className="break-words">{val || '—'}</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {(s.secure_fields || []).length > 0 && (
        <p className="text-xs text-muted flex gap-1.5 items-start"><Icon name="info" size={14} className="mt-px" />Revealing an encrypted answer is recorded in the audit log{adminView ? ', with your name, IP address and device' : ''}.</p>
      )}
      <div className="rounded-2xl bg-bg px-4 py-3.5 flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted">Record</p>
        {s.signed_name && (
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[13px] text-muted w-28">Signed as</span>
            <span className="font-sign text-3xl leading-none">{s.signed_name}</span>
          </div>
        )}
        <Meta label="Date and time" value={fmtDateTime(s.created_at, tz)} />
        <Meta label="IP address" value={s.ip || 'Not recorded'} mono />
        <Meta label="Device" value={s.user_agent ? deviceText(s.user_agent) : 'Not recorded'} title={s.user_agent || undefined} />
        <Meta label="Template" value={`Version ${s.template_version}`} />
        {!s.ip && <Notice tone="warn" icon="info" className="mt-1">IP recording was off when this was submitted (Admin › System).</Notice>}
      </div>
    </Sheet>
  );
}

function Meta({ label, value, mono, title }: { label: string; value: string; mono?: boolean; title?: string }) {
  return (
    <div className="flex items-baseline gap-3 flex-wrap text-[14px]">
      <span className="text-[13px] text-muted w-28 shrink-0">{label}</span>
      <span className={mono ? 'font-mono' : ''} title={title}>{value}</span>
    </div>
  );
}
