import { cx } from '../../lib/util';
import { Chip, Icon, Logo } from '../../ui';
import { brandVars } from './setup-kit';

const RAMP_STAGES = ['Invited', 'Onboarding', 'Role training', 'Graduated', 'Growing'];

/** What a new person sees on the first screen of the welcome flow, tinted with the chosen brand color. */
export function WelcomePreview({ name, color, from, headline, message, videoUrl, first = 'Alex', className }: {
  name: string; color: string; from: string; headline: string; message: string; videoUrl: string; first?: string; className?: string;
}) {
  const h = (headline || '').split('{first}').join(first);
  return (
    <div style={brandVars(color)} className={cx('rounded-3xl border border-line bg-bg p-3 sm:p-4 flex flex-col gap-3', className)} aria-label="Preview of the welcome screen">
      <div className="flex items-center gap-2 px-1">
        <Logo size={24} />
        <span className="font-display font-bold tracking-[0.08em] text-sm">RAMP</span>
        <Chip tone="warn" className="ml-auto">Preview</Chip>
      </div>
      <div aria-hidden="true" className="grid grid-cols-6 gap-1.5 px-1">
        {Array.from({ length: 6 }).map((_, i) => <span key={i} className={cx('h-1.5 rounded-full', i === 0 ? 'bg-brand' : 'bg-line')} />)}
      </div>
      <div className="bg-card border border-line rounded-[20px] p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold tracking-[0.08em] uppercase text-brand">Welcome to {name.trim() || 'your company'}</p>
          <p className="font-display text-[24px] leading-tight font-bold tracking-tight break-words">{h.trim() || <span className="text-muted">Add a headline</span>}</p>
          <p className="text-[15px] text-muted leading-relaxed whitespace-pre-line break-words">{message.trim() || 'Add a welcome message.'}</p>
        </div>
        {videoUrl.trim() && (
          <div className="aspect-video rounded-2xl bg-ink text-white flex flex-col items-center justify-center gap-2" aria-hidden="true">
            <span className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center"><Icon name="play" size={22} /></span>
            <span className="text-sm font-semibold px-4 text-center">Welcome video{from.trim() && ` from ${from.trim()}`}</span>
          </div>
        )}
        {from.trim() && !videoUrl.trim() && <p className="text-sm font-semibold text-ink-2">From {from.trim()}</p>}
        <div className="rounded-2xl bg-bg px-4 pt-4 pb-3 flex flex-col gap-2" aria-hidden="true">
          <p className="text-[13px] font-bold text-ink-2">Your ramp</p>
          <div className="grid grid-cols-5 gap-1.5 items-end h-16">
            {RAMP_STAGES.map((s, i) => (
              <span key={s} className={cx('rounded-t-lg rounded-b-sm', i === 0 ? 'bg-brand' : i === 1 ? 'bg-amber' : 'bg-line')} style={{ height: 18 + i * 11 }} />
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {RAMP_STAGES.map((s, i) => <span key={s} className={cx('text-[11px] leading-tight text-center', i === 1 ? 'font-bold text-ink' : 'text-muted')}>{s}</span>)}
          </div>
        </div>
        <span className="inline-flex items-center justify-center min-h-11 rounded-xl bg-brand text-white font-semibold text-[15px]" aria-hidden="true">Let’s get started</span>
      </div>
    </div>
  );
}
