import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { cx, initials, type Tone } from './lib/util';

// ───────────────────────── icons ─────────────────────────

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5|M5.5 9v11.5h13V9',
  book: 'M3 5.5h6a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H3z|M21 5.5h-6a3 3 0 0 0-3 3v11a2.5 2.5 0 0 1 2.5-2.5H21z',
  tasks: 'M8 3.5h8a4.5 4.5 0 0 1 4.5 4.5v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5z|m8 12.5 2.8 2.8L16.5 9',
  notes: 'M7 3.5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z|M9 3.5v17|M12 8.5h4M12 12.5h4',
  chat: 'M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z',
  folder: 'M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  users: 'M9 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z|M3 20a6 6 0 0 1 12 0|M16 5a3.5 3.5 0 0 1 0 7|M18 14.5a5.5 5.5 0 0 1 3 5.5',
  userPlus: 'M9 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z|M3 20a6 6 0 0 1 12 0|M19 8v6M16 11h6',
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.9 7.5-9.5V6z|m9 12 2.2 2.2L15.5 10',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevronDown: 'm6 9 6 6 6-6', chevronUp: 'm6 15 6-6 6 6', chevronRight: 'm9 6 6 6-6 6', chevronLeft: 'm15 6-6 6 6 6',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6 6 18', check: 'm5 12.5 4.5 4.5L19 7.5',
  lock: 'M6.5 10.5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z|M8 10.5V7.5a4 4 0 0 1 8 0v3',
  search: 'M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z|m20 20-4.2-4.2',
  send: 'M4 11.5 20 4l-7.5 16-2.3-6.2z',
  file: 'M13.5 3.5H6.5a1.5 1.5 0 0 0-1.5 1.5v14a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9z|M13.5 3.5V9H19',
  fileText: 'M13.5 3.5H6.5a1.5 1.5 0 0 0-1.5 1.5v14a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9z|M13.5 3.5V9H19|M8.5 13h7M8.5 16.5h4.5',
  upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5|M4 15v4.5h16V15',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5|M4 15v4.5h16V15',
  paperclip: 'm20 11.5-8.3 8.3a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z|M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  eyeOff: 'M3 3l18 18|M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6|M6.6 6.6A17 17 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4.4-1.1',
  replay: 'M4 12a8 8 0 1 0 2.4-5.7|M4 4v4.5h4.5',
  building: 'M4 20.5V6.5l8-3.5 8 3.5v14|M3 20.5h18|M9.5 20.5v-4.5h5v4.5|M8.5 9.5h1M14.5 9.5h1M8.5 13h1M14.5 13h1',
  list: 'M9 6h11M9 12h11M9 18h11|M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  chart: 'M4 20V11M10 20V5M16 20v-6M21 20H3',
  megaphone: 'M3.5 10v4h3l8 4.5v-13l-8 4.5z|M18 9.5a3.5 3.5 0 0 1 0 5',
  lifebuoy: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z|M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z|m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5',
  sliders: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1|M15 5v4M9 10v4M17 15v4',
  pen: 'M15.5 4.5l4 4L8 20H4v-4z|M13 7l4 4',
  trash: 'M4 7h16|M9 7V4.5h6V7|M6.5 7l1 13h9l1-13',
  logout: 'M15 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H15|M10 16l-4-4 4-4|M6 12h10',
  play: 'M8 5.5v13l10.5-6.5z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4z|M10 20a2 2 0 0 0 4 0',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z|M12 7.5V12l3 2',
  calendar: 'M5.5 5.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z|M3.5 10h17|M8 3.5v4M16 3.5v4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1|M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h10.5v10.5H9z|M15 9V4.5H4.5V15H9',
  mail: 'M4 6h16v12H4z|m4 7 8 6 8-6',
  alert: 'M12 3.5 2.5 20h19z|M12 10v4.5M12 17.5h.01',
  info: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z|M12 11v5|M12 8h.01',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  sparkle: 'M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  target: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z|M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z|M12 12h.01',
  key: 'M14.5 4a5.5 5.5 0 1 1-4.9 8l-6.1 6.1V21h3v-2h2v-2h2l1.2-1.2A5.5 5.5 0 0 1 14.5 4z|M16 8h.01',
  refresh: 'M20 12a8 8 0 0 1-14 5.3|M4 12a8 8 0 0 1 14-5.3|M18 3v4h-4M6 21v-4h4',
};

export function Icon({ name, size = 20, className, strokeWidth = 1.8 }: { name: keyof typeof PATHS | string; size?: number; className?: string; strokeWidth?: number }) {
  const d = PATHS[name] || PATHS.info!;
  const dotted = name === 'more';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={dotted ? 3.2 : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx('shrink-0', className)}>
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cx('shrink-0', className)}>
      <rect width="32" height="32" rx="9" fill="var(--brand, #4338CA)" />
      <path d="M7 25H25V7H21V12H17V17H13V21H7Z" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <Logo />
      <span className="font-display font-bold tracking-[0.08em] text-lg">RAMP</span>
    </span>
  );
}

// ───────────────────────── buttons ─────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-ink border border-transparent',
  secondary: 'bg-white text-ink border border-[#C9CED6] hover:bg-chip',
  ghost: 'bg-transparent text-brand-ink hover:bg-brand-soft border border-transparent',
  danger: 'bg-white text-bad border border-[#F2B8B5] hover:bg-bad-soft',
  success: 'bg-good-2 text-white hover:bg-good border border-transparent',
  dark: 'bg-ink text-white hover:bg-black border border-transparent',
};
const SIZE = { sm: 'min-h-10 px-3 text-sm rounded-[10px] gap-1.5', md: 'min-h-11 px-4 text-[15px] rounded-xl gap-2', lg: 'min-h-12 px-5 text-base rounded-xl gap-2' };

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: keyof typeof SIZE; icon?: string; iconRight?: string; loading?: boolean }) {
  return (
    <button type="button" {...rest} disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none',
        BTN[variant], SIZE[size], className)}>
      {loading ? <Spinner size={16} /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
}

export function IconButton({ icon, label, className, size = 20, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; size?: number }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={cx('inline-flex items-center justify-center w-11 h-11 rounded-xl text-ink-2 hover:bg-chip disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0', className)}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function LinkButton({ to, variant = 'secondary', size = 'md', icon, iconRight, className, children }:
  { to: string; variant?: BtnVariant; size?: keyof typeof SIZE; icon?: string; iconRight?: string; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cx('inline-flex items-center justify-center font-semibold whitespace-nowrap no-underline transition-colors', BTN[variant], SIZE[size], className)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </Link>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 min-h-11 -ml-1 px-1 text-sm font-semibold text-brand-ink no-underline self-start">
      <Icon name="chevronLeft" size={18} strokeWidth={2} />{children}
    </Link>
  );
}

// ───────────────────────── surfaces ─────────────────────────

export function Card({ className, children, as: As = 'section', padded = true }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article'; padded?: boolean }) {
  return <As className={cx('bg-card border border-line rounded-2xl', padded && 'p-5', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1 basis-56">
        <h3 className="font-display text-lg font-semibold leading-snug">{title}</h3>
        {subtitle && <p className="text-sm text-muted mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5 rise">
      {back && <BackLink to={back.to}>{back.label}</BackLink>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          {eyebrow && <p className="text-xs font-bold tracking-[0.08em] uppercase text-brand-ink mb-1">{eyebrow}</p>}
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[15px] text-muted mt-1.5 leading-relaxed max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

const CHIP: Record<Tone, string> = {
  neutral: 'bg-chip text-ink-2', brand: 'bg-brand-soft text-brand-ink', good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', dark: 'bg-ink text-white',
};
export function Chip({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap', CHIP[tone], className)}>
      {icon && <Icon name={icon} size={13} strokeWidth={2.2} />}{children}
    </span>
  );
}

export function Avatar({ name, size = 36, tone = 'brand', className }: { name: string; size?: number; tone?: 'brand' | 'amber' | 'ink'; className?: string }) {
  const tones = { brand: 'bg-brand-2 text-brand-ink', amber: 'bg-warn-soft text-warn', ink: 'bg-ink text-white' };
  return (
    <span aria-hidden="true" className={cx('inline-flex items-center justify-center rounded-full font-bold shrink-0', tones[tone], className)}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}>
      {initials(name)}
    </span>
  );
}

export function Progress({ value, tone = 'brand', className, label }: { value: number; tone?: 'brand' | 'good' | 'amber'; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fill = { brand: 'bg-brand', good: 'bg-good-2', amber: 'bg-amber' }[tone];
  return (
    <div className={cx('h-2 rounded-full bg-line overflow-hidden', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <div className="bg-card border border-line rounded-2xl px-4 py-3.5 flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className={cx('text-[28px] leading-tight font-semibold tabular-nums tracking-tight', tone === 'warn' && 'text-warn', tone === 'good' && 'text-good')}>{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function EmptyState({ icon = 'sparkle', title, body, action }: { icon?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-4">
      <span className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-ink flex items-center justify-center mb-1"><Icon name={icon} size={22} /></span>
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <p className="text-sm text-muted max-w-sm leading-relaxed">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'brand', icon = 'info', children, className }: { tone?: 'brand' | 'warn' | 'good' | 'dark' | 'bad'; icon?: string; children: ReactNode; className?: string }) {
  const tones = { brand: 'bg-brand-soft text-brand-ink', warn: 'bg-warn-soft text-warn', good: 'bg-good-soft text-good', dark: 'bg-ink text-white', bad: 'bg-bad-soft text-bad' };
  return (
    <div className={cx('flex gap-2.5 items-start rounded-[14px] px-3.5 py-3 text-sm leading-relaxed', tones[tone], className)}>
      <Icon name={icon} size={18} className="mt-0.5" /><div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin shrink-0', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ label = 'Loading…', full }: { label?: string; full?: boolean }) {
  return (
    <div className={cx('flex items-center justify-center gap-3 text-muted text-sm', full ? 'min-h-dvh' : 'py-16')} role="status">
      <Spinner /> {label}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-16" />)}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Notice tone="bad" icon="alert">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <span>{error}</span>
        {onRetry && <Button size="sm" onClick={onRetry} icon="refresh">Try again</Button>}
      </div>
    </Notice>
  );
}

// ───────────────────────── form controls ─────────────────────────

export const inputCls = 'w-full min-h-11 px-3 py-2.5 rounded-[10px] border border-field bg-white text-ink text-base placeholder:text-[#6B7280] disabled:bg-chip disabled:text-muted';

export function Field({ label, hint, error, children, className, required }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2', className)}>
      <span>{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}</span>
      {children}
      {hint && !error && <span className="text-xs font-normal text-muted leading-relaxed">{hint}</span>}
      {error && <span className="text-xs font-semibold text-bad">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cx(inputCls, 'leading-relaxed resize-y', props.className)} />;
}
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'pr-8', props.className)}>{children}</select>;
}

export function Checkbox({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start gap-3 min-h-11 py-2.5 text-[15px] font-semibold text-ink cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 mt-0.5 shrink-0 accent-[var(--brand,#4338CA)]" />
      <span className="flex flex-col gap-0.5"><span>{label}</span>{hint && <span className="text-[13px] font-normal text-muted">{hint}</span>}</span>
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className="shrink-0 inline-flex items-center w-14 min-h-11 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
      <span className={cx('flex w-[52px] h-[30px] p-[3px] rounded-full transition-colors', checked ? 'bg-brand justify-end' : 'bg-field justify-start')}>
        <span className="block w-6 h-6 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

export function Pills<T extends string>({ options, value, onChange, label, dark, size = 'md' }:
  { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string; dark?: boolean; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cx('rounded-full border font-semibold cursor-pointer transition-colors', size === 'sm' ? 'min-h-10 px-3 text-[13px]' : 'min-h-11 px-3.5 text-sm',
              on ? (dark ? 'bg-ink border-ink text-white' : 'bg-brand border-brand text-white') : 'bg-white border-[#C9CED6] text-ink-2 hover:bg-chip')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 p-1 rounded-xl bg-[#E9EBEF]">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={cx('min-h-10 px-4 rounded-[9px] text-sm font-semibold cursor-pointer', o.value === value ? 'bg-white text-ink shadow-sm' : 'text-ink-2')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={18} strokeWidth={2} /></span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, 'pl-10 min-h-12 rounded-xl')} />
    </label>
  );
}

// ───────────────────────── sheet (modal / bottom sheet) ─────────────────────────

export function Sheet({ open, onClose, title, subtitle, children, footer, wide, label }:
  { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center items-end md:items-center p-0 md:p-4 bg-ink/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label || (typeof title === 'string' ? title : 'Dialog')}
        className={cx('sheet-up w-full bg-white rounded-t-3xl md:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl', wide ? 'md:max-w-3xl' : 'md:max-w-xl')}>
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              {title && <h2 className="font-display text-[22px] leading-tight font-bold">{title}</h2>}
              {subtitle && <div className="text-sm text-muted mt-1 leading-relaxed">{subtitle}</div>}
            </div>
            <IconButton icon="x" label="Close" onClick={onClose} className="bg-bg -mr-1 -mt-1" />
          </div>
        )}
        <div className="px-5 pb-5 overflow-y-auto flex-1 flex flex-col gap-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-line flex flex-wrap justify-end gap-2.5 pb-safe">{footer}</div>}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: string; action: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((o: { title: string; body?: string; action: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const dialog = state && (
    <Sheet open onClose={() => close(false)} title={state.title}
      footer={<><Button onClick={() => close(false)}>Cancel</Button><Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state.action}</Button></>}>
      {state.body && <p className="text-[15px] text-ink-2 leading-relaxed">{state.body}</p>}
    </Sheet>
  );
  return { confirm, dialog };
}

// ───────────────────────── toasts ─────────────────────────

type Toast = { id: number; text: string; tone: 'ok' | 'bad' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-[88px] md:bottom-6 flex flex-col gap-2 items-center w-[calc(100%-32px)] max-w-md pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={cx('sheet-up pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg leading-snug', t.tone === 'bad' ? 'bg-bad text-white' : 'bg-ink text-white')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────────────────────── list rows ─────────────────────────

export function RowLink({ to, onClick, children, className }: { to?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = cx('flex items-center gap-3 w-full min-h-16 px-4 py-3 border-t border-line-2 first:border-t-0 bg-white text-left text-ink no-underline hover:bg-[#FAFBFC] cursor-pointer', className);
  if (to) return <Link to={to} className={cls}>{children}<Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" /></Link>;
  return <button type="button" onClick={onClick} className={cls}>{children}<Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" /></button>;
}
