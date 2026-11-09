import { KINDS, cx } from '../../lib/util';
import type { Template, TemplateField } from '../../lib/types';
import { Button, Icon, Notice, Sheet, inputCls } from '../../ui';

/**
 * Read-only preview of a document as the person filling it in will see it.
 * Built locally because FormSheet always submits.
 */
export function TemplatePreviewSheet({ template, open, onClose }: {
  template: Pick<Template, 'title' | 'kind' | 'description' | 'fields' | 'version'>; open: boolean; onClose: () => void;
}) {
  const fields = template.fields || [];
  const hasSign = fields.some((f) => f.type === 'sign');
  const action = hasSign ? 'Sign and submit' : template.kind === 'upload' ? 'Upload' : 'Submit';
  return (
    <Sheet open={open} onClose={onClose} wide title={template.title || 'Untitled document'}
      subtitle={<>{KINDS[template.kind].label} · preview{template.description && <span className="block mt-1">{template.description}</span>}</>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <span className="text-[13px] text-muted">Preview only. Nothing is saved.</span>
          <div className="flex gap-2.5">
            <Button variant="primary" disabled icon={hasSign ? 'pen' : 'check'}>{action}</Button>
            <Button onClick={onClose}>Close preview</Button>
          </div>
        </div>
      }>
      <Notice tone="warn" icon="eye">This is how it looks to the person completing it. The fields are locked in the preview.</Notice>
      {fields.length === 0 && <Notice>This document has no questions yet. Submitting records that they’ve read it.</Notice>}
      {fields.map((f) => <PreviewField key={f.k} f={f} />)}
      <p className="text-xs text-muted leading-relaxed flex gap-2 items-start">
        <Icon name="shield" size={16} className="mt-px" />
        When they submit, RAMP records the date and time, their IP address and their device with the document.
      </p>
    </Sheet>
  );
}

function Label({ f }: { f: TemplateField }) {
  const secure = f.type === 'secure' || !!f.secure;
  return (
    <span className="text-[13px] font-semibold text-ink-2 inline-flex items-center gap-1.5">
      {f.label || <span className="text-muted italic">No label</span>}
      {f.required && <span className="text-bad" aria-hidden="true">*</span>}
      {secure && <Icon name="lock" size={13} className="text-muted" />}
    </span>
  );
}

function PreviewField({ f }: { f: TemplateField }) {
  const secure = f.type === 'secure' || !!f.secure;
  if (f.type === 'info') {
    return (
      <div className="rounded-[14px] bg-bg px-4 py-3.5">
        <p className="font-semibold text-[15px] whitespace-pre-line">{f.label}</p>
        {f.help && <div className="prose-ramp text-sm">{f.help.split('\n').map((l, i) => <p key={i}>{l}</p>)}</div>}
      </div>
    );
  }
  if (f.type === 'check') {
    return (
      <div className="flex items-start gap-3 min-h-11 py-2.5 text-[15px] font-semibold text-ink">
        <span className="w-5 h-5 mt-0.5 rounded border-2 border-field shrink-0" aria-hidden="true" />
        <span className="flex flex-col gap-0.5">
          <span>{f.label || <span className="text-muted italic">No label</span>}{f.required && <span className="text-bad"> *</span>}</span>
          {f.help && <span className="text-[13px] font-normal text-muted">{f.help}</span>}
        </span>
      </div>
    );
  }
  if (f.type === 'choice') {
    const opts = f.options || [];
    return (
      <div className="flex flex-col gap-2">
        <Label f={f} />
        <div className="flex flex-wrap gap-2">
          {opts.length ? opts.map((o, i) => (
            <span key={i} className="inline-flex items-center rounded-full border border-[#C9CED6] bg-white min-h-11 px-3.5 text-sm font-semibold text-ink-2">{o || '—'}</span>
          )) : <span className="text-sm text-warn">No options yet</span>}
        </div>
        {f.help && <span className="text-xs text-muted">{f.help}</span>}
      </div>
    );
  }
  if (f.type === 'file') {
    return (
      <div className="flex flex-col gap-1.5">
        <Label f={f} />
        <div className="flex flex-col items-center justify-center gap-1.5 min-h-28 rounded-xl border-2 border-dashed border-[#C9CED6] text-center px-4 py-4">
          <Icon name="upload" size={22} className="text-brand-ink" />
          <span className="font-semibold text-[15px] text-brand-ink">Choose a file or take a photo</span>
          <span className="text-xs text-muted">PDF, image or document · up to 25 MB</span>
        </div>
        {secure && <span className="text-xs text-muted flex items-center gap-1.5"><Icon name="lock" size={14} />Stored privately. Only they and HR admins can open it.</span>}
        {f.help && <span className="text-xs text-muted">{f.help}</span>}
      </div>
    );
  }
  if (f.type === 'sign') {
    return (
      <div className="flex flex-col gap-2">
        <Label f={f} />
        <div className={cx(inputCls, 'text-muted bg-chip')}>Their full name</div>
        <span className="text-xs text-muted">{f.help || 'Typing their full legal name counts as their electronic signature.'}</span>
        <div className="rounded-xl border border-line bg-[#FCFCFD] px-4 pt-3 pb-2 min-h-20 flex flex-col justify-end" aria-hidden="true">
          <span className="font-sign text-4xl leading-none text-muted">Signature</span>
          <span className="border-t border-ink-2/40 mt-2 pt-1 text-[11px] text-muted">Signed {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>
    );
  }
  const placeholder = { text: '', email: 'name@example.com', phone: '(555) 555-0100', date: 'mm/dd/yyyy', secure: '••••••••' }[f.type as 'text' | 'email' | 'phone' | 'date' | 'secure'] ?? '';
  return (
    <div className="flex flex-col gap-1.5">
      <Label f={f} />
      <div className={cx(inputCls, 'bg-chip text-muted flex items-center', secure && 'font-mono tracking-wide')}>
        <span className="flex-1">{secure ? '••••••••' : placeholder || ' '}</span>
        {secure && <Icon name="eye" size={18} />}
        {f.type === 'date' && !secure && <Icon name="calendar" size={18} />}
      </div>
      {(secure || f.help) && (
        <span className="text-xs text-muted leading-relaxed">
          {f.help}{f.help && secure && ' · '}{secure && 'Encrypted. Only they and HR admins can see it, and every view is logged.'}
        </span>
      )}
    </div>
  );
}
