import { useMemo, useRef, useState } from 'react';
import { supabase, uploadFile, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { KINDS, cx } from '../lib/util';
import type { SubmissionFile, Template, TemplateField } from '../lib/types';
import { Button, Checkbox, Field, Icon, Input, Notice, Pills, Sheet, useToast, inputCls } from '../ui';

const MAX_MB = 25;

function prefill(f: TemplateField, me: { full_name: string; email: string; phone: string; preferred_name: string }) {
  const k = (f.k + ' ' + f.label).toLowerCase();
  if (f.type === 'email' && /email/.test(k)) return me.email;
  if (f.type === 'phone') return me.phone;
  if (f.type === 'text' && /preferred/.test(k)) return me.preferred_name;
  if (f.type === 'text' && /(full|legal)?\s*name/.test(k) && !/(emergency|contact|bank|company|manager|reference)/.test(k)) return me.full_name;
  return '';
}

/**
 * Fill out, upload or sign one document template. Files go to private storage, sensitive answers are
 * encrypted by the database, and the time, IP address and device are recorded with the submission.
 */
export function FormSheet({ template, open, onClose, onDone }: { template: Template | null; open: boolean; onClose: () => void; onDone?: (submissionId: string) => void }) {
  if (!template || !open) return null;
  return <FormBody key={template.id} template={template} onClose={onClose} onDone={onDone} />;
}

function FormBody({ template, onClose, onDone }: { template: Template; onClose: () => void; onDone?: (id: string) => void }) {
  const { me, org } = useMe();
  const toast = useToast();
  const fields = template.fields || [];
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) if (f.type !== 'file' && f.type !== 'info') v[f.k] = prefill(f, me) || '';
    return v;
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'uploading' | 'saving'>('');
  const [fail, setFail] = useState('');
  const topRef = useRef<HTMLDivElement>(null);
  const hasSign = fields.some((f) => f.type === 'sign');
  const set = (k: string, v: string) => { setVals((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const requiredLeft = useMemo(() => fields.filter((f) => f.required && f.type !== 'info' && (
    f.type === 'file' ? !files[f.k] : f.type === 'check' ? vals[f.k] !== 'yes' : !String(vals[f.k] || '').trim())).length, [fields, vals, files]);

  function validate() {
    const e: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === 'info') continue;
      const v = String(vals[f.k] || '').trim();
      if (f.required) {
        if (f.type === 'file' && !files[f.k]) e[f.k] = 'Add a file.';
        else if (f.type === 'check' && vals[f.k] !== 'yes') e[f.k] = 'Tick this box to continue.';
        else if (f.type === 'sign' && !v) e[f.k] = 'Type your full name to sign.';
        else if (f.type !== 'file' && f.type !== 'check' && !v) e[f.k] = 'Required.';
      }
      if (v && f.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) e[f.k] = 'Enter a valid email address.';
      if (f.type === 'file' && files[f.k] && files[f.k]!.size > MAX_MB * 1024 * 1024) e[f.k] = `Files can be up to ${MAX_MB} MB.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    setFail('');
    if (!validate()) {
      topRef.current?.closest('[role="dialog"]')?.querySelector('[data-error="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    try {
      const answers: Record<string, string> = {};
      const secure: Record<string, string> = {};
      let signed = '';
      for (const f of fields) {
        if (f.type === 'info' || f.type === 'file') continue;
        const v = String(vals[f.k] || '').trim();
        if (!v) continue;
        if (f.type === 'secure' || f.secure) secure[f.k] = v;
        else answers[f.k] = v;
        if (f.type === 'sign') signed = v;
      }
      const uploaded: SubmissionFile[] = [];
      const pending = fields.filter((f) => f.type === 'file' && files[f.k]);
      if (pending.length) setBusy('uploading');
      for (const f of pending) {
        const file = files[f.k]!;
        const path = await uploadFile(me.id, file, 'documents');
        uploaded.push({ k: f.k, label: f.label, name: file.name, path, secure: !!f.secure });
      }
      setBusy('saving');
      const { data, error } = await supabase.rpc('ramp_submit', {
        p_template: template.id, p_answers: answers, p_secure: secure, p_files: uploaded, p_signed_name: signed || null,
      });
      if (error) throw error;
      toast(hasSign ? `Signed: ${template.title}` : `Submitted: ${template.title}`);
      onDone?.(data as string);
      onClose();
    } catch (e) {
      setFail(errText(e));
    } finally {
      setBusy('');
    }
  }

  const action = hasSign ? 'Sign and submit' : template.kind === 'upload' ? 'Upload' : 'Submit';

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={template.title} wide
      subtitle={<>{KINDS[template.kind].label}{template.version > 1 && ` · version ${template.version}`}{template.description && <span className="block mt-1">{template.description}</span>}</>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <span className="text-[13px] text-muted">{requiredLeft > 0 ? `${requiredLeft} required ${requiredLeft === 1 ? 'item' : 'items'} left` : 'Ready to submit'}</span>
          <div className="flex gap-2.5">
            <Button onClick={onClose} disabled={!!busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={!!busy} icon={hasSign ? 'pen' : 'check'}>
              {busy === 'uploading' ? 'Uploading…' : busy === 'saving' ? 'Saving…' : action}
            </Button>
          </div>
        </div>
      }>
      <div ref={topRef} />
      {fields.length === 0 && <Notice>This document has no questions yet. Submitting records that you’ve read it.</Notice>}
      {fields.map((f) => <FieldInput key={f.k} f={f} value={vals[f.k] || ''} file={files[f.k] || null} error={errors[f.k]} shown={!!show[f.k]}
        onChange={(v) => set(f.k, v)} onFile={(file) => { setFiles((s) => ({ ...s, [f.k]: file })); setErrors((e) => ({ ...e, [f.k]: '' })); }}
        onToggle={() => setShow((s) => ({ ...s, [f.k]: !s[f.k] }))} />)}
      {org.flags?.record_ip !== false && (
        <p className="text-xs text-muted leading-relaxed flex gap-2 items-start">
          <Icon name="shield" size={16} className="mt-px" />
          When you submit, RAMP records the date and time, your IP address and your device with this document, so there’s an accurate record.
        </p>
      )}
      {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
    </Sheet>
  );
}

function FieldInput({ f, value, file, error, shown, onChange, onFile, onToggle }: {
  f: TemplateField; value: string; file: File | null; error?: string; shown: boolean;
  onChange: (v: string) => void; onFile: (f: File | null) => void; onToggle: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errAttr = error ? { 'data-error': '1' } : {};

  if (f.type === 'info') {
    return (
      <div className="rounded-[14px] bg-bg px-4 py-3.5">
        <p className="font-semibold text-[15px]">{f.label}</p>
        {f.help && <div className="prose-ramp text-sm">{f.help.split('\n').map((l, i) => <p key={i}>{l}</p>)}</div>}
      </div>
    );
  }

  if (f.type === 'check') {
    return (
      <div {...errAttr}>
        <Checkbox checked={value === 'yes'} onChange={(v) => onChange(v ? 'yes' : '')} label={<>{f.label}{f.required && <span className="text-bad"> *</span>}</>} hint={f.help} />
        {error && <p className="text-xs font-semibold text-bad -mt-1">{error}</p>}
      </div>
    );
  }

  if (f.type === 'choice') {
    return (
      <div className="flex flex-col gap-2" {...errAttr}>
        <span className="text-[13px] font-semibold text-ink-2">{f.label}{f.required && <span className="text-bad"> *</span>}</span>
        <Pills label={f.label} value={value || null} onChange={onChange} options={(f.options || []).map((o) => ({ value: o, label: o }))} />
        {f.help && <span className="text-xs text-muted">{f.help}</span>}
        {error && <span className="text-xs font-semibold text-bad">{error}</span>}
      </div>
    );
  }

  if (f.type === 'file') {
    return (
      <div className="flex flex-col gap-1.5" {...errAttr}>
        <span className="text-[13px] font-semibold text-ink-2">{f.label}{f.required && <span className="text-bad"> *</span>}</span>
        <input ref={inputRef} type="file" className="sr-only" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => onFile(e.target.files?.[0] || null)} aria-label={f.label} />
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <Icon name="paperclip" size={18} className="text-brand-ink" />
            <span className="flex-1 min-w-0 truncate text-[15px] font-medium">{file.name}</span>
            <span className="text-xs text-muted shrink-0">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            <Button size="sm" variant="ghost" onClick={() => { onFile(null); if (inputRef.current) inputRef.current.value = ''; }}>Remove</Button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()}
            className={cx('flex flex-col items-center justify-center gap-1.5 min-h-28 rounded-xl border-2 border-dashed text-center px-4 py-4 cursor-pointer hover:bg-brand-soft',
              error ? 'border-bad' : 'border-[#C9CED6]')}>
            <Icon name="upload" size={22} className="text-brand-ink" />
            <span className="font-semibold text-[15px] text-brand-ink">Choose a file or take a photo</span>
            <span className="text-xs text-muted">PDF, image or document · up to {MAX_MB} MB</span>
          </button>
        )}
        {f.secure && <span className="text-xs text-muted flex items-center gap-1.5"><Icon name="lock" size={14} />Stored privately. Only you and HR admins can open it.</span>}
        {f.help && <span className="text-xs text-muted">{f.help}</span>}
        {error && <span className="text-xs font-semibold text-bad">{error}</span>}
      </div>
    );
  }

  if (f.type === 'sign') {
    return (
      <div className="flex flex-col gap-2" {...errAttr}>
        <Field label={f.label || 'Signature'} required={f.required} error={error} hint={f.help || 'Type your full legal name. This counts as your electronic signature.'}>
          <Input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="name" placeholder="Your full name" />
        </Field>
        <div className="rounded-xl border border-line bg-[#FCFCFD] px-4 pt-3 pb-2 min-h-20 flex flex-col justify-end" aria-hidden="true">
          <span className="font-sign text-4xl leading-none text-ink truncate">{value || ' '}</span>
          <span className="border-t border-ink-2/40 mt-2 pt-1 text-[11px] text-muted">Signed {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>
    );
  }

  const secure = f.type === 'secure' || f.secure;
  const type = secure ? (shown ? 'text' : 'password') : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'date' ? 'date' : 'text';
  return (
    <div {...errAttr}>
      <Field label={<span className="inline-flex items-center gap-1.5">{f.label}{secure && <Icon name="lock" size={13} className="text-muted" />}</span>} required={f.required} error={error}
        hint={secure ? (f.help ? `${f.help} · ` : '') + 'Encrypted. Only you and HR admins can see it, and every view is logged.' : f.help}>
        <div className="relative">
          <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, secure && 'pr-12 font-mono tracking-wide')}
            autoComplete={secure ? 'off' : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'on'} inputMode={f.type === 'phone' ? 'tel' : undefined} />
          {secure && (
            <button type="button" onClick={onToggle} aria-label={shown ? 'Hide' : 'Show'} className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-muted cursor-pointer">
              <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}
