import { useMemo, useState } from 'react';
import { cx } from '../../lib/util';
import { Icon, SearchInput, Sheet, inputCls } from '../../ui';

const COMMON: { tz: string; label: string }[] = [
  { tz: 'America/New_York', label: 'Eastern' },
  { tz: 'America/Chicago', label: 'Central' },
  { tz: 'America/Denver', label: 'Mountain' },
  { tz: 'America/Phoenix', label: 'Arizona' },
  { tz: 'America/Los_Angeles', label: 'Pacific' },
  { tz: 'America/Anchorage', label: 'Alaska' },
  { tz: 'Pacific/Honolulu', label: 'Hawaii' },
];

function allZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return COMMON.map((c) => c.tz);
  }
}

function offsetOf(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

function nowIn(tz: string) {
  try {
    return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const zoneName = (tz: string) => tz.split('/').slice(1).join(' / ').replace(/_/g, ' ') || tz;

export function zoneLabel(tz: string) {
  const c = COMMON.find((x) => x.tz === tz);
  return c ? `${c.label} · ${zoneName(tz)}` : zoneName(tz);
}

export function isZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A button that shows the chosen time zone and opens a searchable list (US zones first). */
export function TimezonePicker({ value, onChange, id }: { value: string; onChange: (tz: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id={id} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={cx(inputCls, 'flex items-center gap-2 text-left cursor-pointer')}>
        <Icon name="clock" size={18} className="text-muted" />
        <span className="flex-1 min-w-0 truncate">{value ? zoneLabel(value) : 'Choose a time zone'}</span>
        {value && <span className="text-sm text-muted shrink-0">{offsetOf(value)}</span>}
        <Icon name="chevronDown" size={18} className="text-muted" />
      </button>
      {open && <ZoneSheet value={value} onClose={() => setOpen(false)} onPick={(tz) => { onChange(tz); setOpen(false); }} />}
    </>
  );
}

function ZoneSheet({ value, onClose, onPick }: { value: string; onClose: () => void; onPick: (tz: string) => void }) {
  const [search, setSearch] = useState('');
  const zones = useMemo(() => {
    const list = allZones();
    const common = new Set(COMMON.map((c) => c.tz));
    return {
      common: COMMON.map((c) => ({ tz: c.tz, name: `${c.label} · ${zoneName(c.tz)}`, offset: offsetOf(c.tz), now: nowIn(c.tz) })),
      rest: list.filter((tz) => !common.has(tz)).map((tz) => ({ tz, name: zoneName(tz), offset: offsetOf(tz), now: '' })),
    };
  }, []);
  const term = search.trim().toLowerCase().replace(/[\s_/]+/g, ' ');
  const match = (z: { tz: string; name: string; offset: string }) => !term || `${z.tz} ${z.name} ${z.offset}`.toLowerCase().replace(/[\s_/]+/g, ' ').includes(term);
  const common = zones.common.filter(match);
  const rest = zones.rest.filter(match);

  const row = (z: { tz: string; name: string; offset: string; now: string }) => {
    const on = z.tz === value;
    return (
      <li key={z.tz}>
        <button type="button" onClick={() => onPick(z.tz)} aria-pressed={on}
          className={cx('flex items-center gap-3 w-full min-h-12 px-3 rounded-xl text-left cursor-pointer', on ? 'bg-brand-soft text-brand-ink' : 'hover:bg-chip')}>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold truncate">{z.name}</span>
            <span className="block text-xs text-muted">{z.tz}{z.now && ` · ${z.now} now`}</span>
          </span>
          <span className="text-sm text-muted shrink-0">{z.offset}</span>
          {on && <Icon name="check" size={18} strokeWidth={2.2} />}
        </button>
      </li>
    );
  };

  return (
    <Sheet open onClose={onClose} title="Time zone" subtitle="Used for due dates, record times and the audit log.">
      <SearchInput value={search} onChange={setSearch} placeholder="Search by city or region" label="Search time zones" />
      {common.length > 0 && (
        <div>
          <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted px-3 pb-1">United States</p>
          <ul className="flex flex-col">{common.map(row)}</ul>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted px-3 pb-1">{term ? 'Other matches' : 'All time zones'}</p>
          <ul className="flex flex-col">{rest.map(row)}</ul>
        </div>
      )}
      {!common.length && !rest.length && <p className="text-sm text-muted text-center py-6">No time zone matches “{search}”. Try a city name, like Chicago or London.</p>}
    </Sheet>
  );
}
