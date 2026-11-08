import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { copyText } from './lib/util';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export function Button({ variant = 'secondary', size = 'md', className, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition select-none',
        'disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' && 'h-8 px-2.5 text-[13px]',
        size === 'md' && 'h-10 px-3.5 text-sm',
        size === 'lg' && 'h-12 px-5 text-[15px]',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink-2 active:scale-[.98]',
        variant === 'accent' && 'bg-accent text-white hover:brightness-95 active:scale-[.98]',
        variant === 'secondary' && 'bg-card border border-line text-ink hover:border-ink/30 active:scale-[.98]',
        variant === 'ghost' && 'text-ink-2 hover:bg-paper-2',
        variant === 'danger' && 'bg-card border border-bad/30 text-bad hover:bg-bad-soft',
        className,
      )}
    />
  );
}

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="block text-[13px] font-medium text-ink mb-1.5">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-muted mt-1.5 leading-relaxed">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-card px-3 text-[15px] text-ink placeholder:text-muted/70 ' +
  'focus:outline-none focus:border-ink/40 focus:ring-4 focus:ring-ink/5 transition';

export function Input({ className, mono, ...p }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input {...p} className={cx(inputCls, 'h-10', mono && 'font-mono text-[14px]', className)} />;
}

export function Textarea({ className, mono, autoGrow = true, ...p }:
  TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean; autoGrow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoGrow || !ref.current) return;
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 900) + 'px';
  }, [p.value, autoGrow]);
  return <textarea ref={ref} {...p} className={cx(inputCls, 'py-2.5 leading-relaxed resize-y', mono && 'font-mono text-[13.5px]', className)} />;
}

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, 'h-10 pr-8 appearance-none bg-[length:12px] bg-no-repeat bg-[right_12px_center]', className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236e6c73' stroke-width='1.6' fill='none'/%3E%3C/svg%3E\")" }} />;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left w-full group">
      <span className={cx('mt-0.5 h-6 w-10 shrink-0 rounded-full p-0.5 transition', checked ? 'bg-ink' : 'bg-line')}>
        <span className={cx('block h-5 w-5 rounded-full bg-white shadow transition', checked && 'translate-x-4')} />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted mt-0.5 leading-relaxed">{hint}</span>}
      </span>
    </button>
  );
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cx('rounded-2xl border border-line bg-card', pad && 'p-4 sm:p-5', className)}>{children}</div>;
}

export function SectionTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <h3 className="text-[15px] font-semibold">{children}</h3>
        {sub && <p className="text-[13px] text-muted mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'ink';
export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap',
      tone === 'neutral' && 'bg-paper-2 text-ink-2',
      tone === 'good' && 'bg-good-soft text-good',
      tone === 'warn' && 'bg-warn-soft text-warn',
      tone === 'bad' && 'bg-bad-soft text-bad',
      tone === 'accent' && 'bg-accent-soft text-accent',
      tone === 'ink' && 'bg-ink text-white',
      className,
    )}>{children}</span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin', className)} />;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm"><Spinner /> {label}…</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-2xl">{title}</p>
      {children && <p className="text-sm text-muted mt-2 max-w-md mx-auto leading-relaxed">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none">
      <div className="inline-flex gap-1 border-b border-line min-w-full">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            className={cx('px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition',
              value === t.id ? 'border-ink text-ink font-medium' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }:
  { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-paper-2 p-0.5 max-w-full overflow-x-auto scrollbar-none">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={cx('rounded-md whitespace-nowrap transition', size === 'sm' ? 'px-2 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
            value === o.id ? 'bg-card shadow-sm text-ink font-medium' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── toasts ── */
const ToastCtx = createContext<(msg: string, tone?: 'good' | 'bad') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: 'good' | 'bad' }[]>([]);
  const push = useCallback((msg: string, tone: 'good' | 'bad' = 'good') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, tone }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-0 bottom-20 sm:bottom-6 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {items.map((t) => (
          <div key={t.id} className={cx('rise pointer-events-auto rounded-full px-4 py-2 text-sm shadow-lg',
            t.tone === 'good' ? 'bg-ink text-white' : 'bg-bad text-white')}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function CopyButton({ text, html, label = 'Copy', done = 'Copied', variant = 'secondary', size = 'sm', className, onCopied }:
  { text: string | (() => string); html?: string | (() => string); label?: ReactNode; done?: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; className?: string; onCopied?: () => void }) {
  const toast = useToast();
  return (
    <Button type="button" variant={variant} size={size} className={className}
      onClick={async () => {
        const t = typeof text === 'function' ? text() : text;
        const h = typeof html === 'function' ? html() : html;
        const ok = await copyText(t, h);
        toast(ok ? done : 'Copy failed', ok ? 'good' : 'bad');
        if (ok) onCopied?.();
      }}>
      {label}
    </Button>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] p-0 sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={cx('rise w-full max-h-[92vh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="sticky top-0 bg-card/95 backdrop-blur flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-paper-2 text-muted text-lg leading-none" aria-label="Close">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Stars({ value, onChange, size = 'md' }: { value?: number | null; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(value === n ? 0 : n)}
          className={cx('rounded-md font-mono font-medium transition border',
            size === 'sm' ? 'h-7 w-7 text-[12px]' : 'h-9 w-9 text-sm',
            value && n <= value ? 'bg-ink text-white border-ink' : 'bg-card text-muted border-line hover:border-ink/40',
            !onChange && 'pointer-events-none')}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('font-mono font-semibold tracking-tight', className)}>
      apply<span className="text-accent">1234</span>
    </span>
  );
}
