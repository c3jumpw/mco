// "Your path to the next tier" for an assistant. Shows pay rates only (never bill rates).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx, fmtDate, money, plural } from '../../lib/util';
import type { MyWork } from '../../lib/types';
import { Card, Icon, Notice, Progress } from '../../ui';

type WorkPlacement = MyWork['placements'][number];
type WorkTier = MyWork['tiers'][number];
export interface ModuleRef { id: string; title: string }

function Req({ done, title, detail, pct, children }: { done: boolean; title: string; detail: ReactNode; pct?: number; children?: ReactNode }) {
  return (
    <li className="flex gap-3 py-3 border-t border-line-2 first:border-t-0">
      <span className={cx('w-7 h-7 mt-0.5 rounded-full flex items-center justify-center shrink-0', done ? 'bg-good-2 text-white' : 'bg-chip text-muted')}>
        <Icon name={done ? 'check' : 'target'} size={15} strokeWidth={done ? 3 : 2} />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[15px] font-semibold">{title}</p>
          <p className={cx('text-[13px] tabular-nums', done ? 'text-good font-semibold' : 'text-muted')}>{detail}</p>
        </div>
        {pct !== undefined && <Progress value={pct} tone={done ? 'good' : 'brand'} label={`${title} progress`} />}
        {children}
      </div>
    </li>
  );
}

export function TierPathCard({ p, tiers, completed, modules, showClient }: {
  p: WorkPlacement; tiers: WorkTier[]; completed: string[]; modules: ModuleRef[]; showClient: boolean;
}) {
  const sorted = [...tiers].sort((a, b) => a.level - b.level);
  const cur = p.tier ? sorted.find((t) => t.id === p.tier!.id) || null : null;
  const next = cur ? sorted.find((t) => t.level > cur.level) || null : sorted[0] || null;
  const cur$ = p.currency || 'USD';
  const title = showClient ? `Your path to the next tier · ${p.client.name}` : 'Your path to the next tier';

  if (!next) {
    return (
      <Card className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {cur ? (
          <Notice tone="good" icon="star">You’re at our top tier, <span className="font-semibold">{cur.name}</span>. Keep up the great work.</Notice>
        ) : (
          <p className="text-[15px] text-muted">Tiers haven’t been set up yet. Your coach can tell you how growth works here.</p>
        )}
      </Card>
    );
  }

  // Required modules: titles from the module list (links), filling any we can't read from the tier's own titles.
  const ids = next.required_modules || [];
  const known = new Map(modules.map((m) => [m.id, m.title]));
  const spare = (next.module_titles || []).filter((t) => !modules.some((m) => m.title === t));
  let si = 0;
  const reqMods = ids.map((id) => ({ id, title: known.get(id) || spare[si++] || 'A required module', link: known.has(id), done: completed.includes(id) }));
  const modsDone = reqMods.filter((m) => m.done).length;

  const days = p.days_active;
  const daysOk = next.min_days <= 0 || (days ?? 0) >= next.min_days;
  const avg = p.checkin_avg == null ? null : Number(p.checkin_avg);
  const minScore = Number(next.min_checkin_score) || 0;
  const scoreOk = minScore <= 0 || (avg != null && avg >= minScore);
  const modsOk = modsDone === reqMods.length;
  const hasReqs = next.min_days > 0 || reqMods.length > 0 || minScore > 0;
  const allOk = daysOk && modsOk && scoreOk;

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-display text-lg font-semibold leading-snug">{title}</h3>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-xl bg-bg px-3.5 py-3 min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Now</p>
          <p className="font-display text-[17px] font-semibold leading-snug mt-0.5 break-words">{cur?.name || 'No tier yet'}</p>
          <p className="text-[13px] text-muted mt-0.5 tabular-nums">{money(p.pay_rate, cur$)}/h</p>
        </div>
        <span className="self-center text-muted"><Icon name="chevronRight" size={20} strokeWidth={2} /></span>
        <div className="rounded-xl bg-brand-soft px-3.5 py-3 min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-ink">Next</p>
          <p className="font-display text-[17px] font-semibold leading-snug mt-0.5 break-words">{next.name}</p>
          <p className="text-[13px] text-brand-ink font-semibold mt-0.5 tabular-nums">{money(next.pay_rate, cur$)}/h</p>
        </div>
      </div>
      {next.description && <p className="text-[15px] text-ink-2 leading-relaxed">{next.description}</p>}

      {hasReqs ? (
        <ul>
          {next.min_days > 0 && (
            <Req done={daysOk} title="Time in your role"
              detail={days == null ? 'Starts on your start date' : `${plural(Math.min(days, next.min_days), 'day')} of ${next.min_days}`}
              pct={days == null ? 0 : (days / next.min_days) * 100}>
              {p.start_date && !daysOk && <p className="text-[13px] text-muted">Counting from {fmtDate(p.start_date, { month: 'long', day: 'numeric', year: 'numeric' })}.</p>}
            </Req>
          )}
          {reqMods.length > 0 && (
            <Req done={modsOk} title="Required training" detail={`${modsDone} of ${plural(reqMods.length, 'module')} done`} pct={(modsDone / reqMods.length) * 100}>
              <ul className="flex flex-col">
                {reqMods.map((m) => (
                  <li key={m.id}>
                    {m.link ? (
                      <Link to={`/training/${m.id}`} className="flex items-center gap-2 min-h-11 text-[15px] text-ink no-underline hover:text-brand-ink">
                        <Icon name={m.done ? 'check' : 'book'} size={16} className={m.done ? 'text-good' : 'text-brand-ink'} strokeWidth={m.done ? 2.6 : 1.8} />
                        <span className={cx('min-w-0 flex-1', m.done && 'text-muted')}>{m.title}</span>
                        {!m.done && <span className="text-[13px] font-semibold text-brand-ink shrink-0">Start</span>}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2 min-h-11 text-[15px] text-ink">
                        <Icon name={m.done ? 'check' : 'book'} size={16} className={m.done ? 'text-good' : 'text-muted'} />{m.title}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Req>
          )}
          {minScore > 0 && (
            <Req done={scoreOk} title="Check-in score"
              detail={avg == null ? `Needs ${minScore.toFixed(1)} average` : `${avg.toFixed(1)} average · needs ${minScore.toFixed(1)}`}
              pct={avg == null ? 0 : (avg / minScore) * 100}>
              <p className="text-[13px] text-muted">{avg == null ? 'Your coach scores each check-in from 1 to 5. This uses your last three.' : 'Average of your last three scored check-ins.'}</p>
            </Req>
          )}
        </ul>
      ) : (
        <p className="text-[15px] text-muted">There are no set requirements for {next.name}. Talk with your coach about moving up.</p>
      )}

      {hasReqs && allOk && (
        <Notice tone="good" icon="check">You meet every requirement for {next.name}. Your coach will review your move up with our team.</Notice>
      )}
      {hasReqs && !allOk && <p className="text-[13px] text-muted">When you meet these, your coach reviews your move up with our team.</p>}
    </Card>
  );
}
