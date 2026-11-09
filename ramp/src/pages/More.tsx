import { Link } from 'react-router-dom';
import { useMe } from '../lib/session';
import { useTitle } from '../lib/hooks';
import { LEVELS, displayName } from '../lib/util';
import { useBadges, useNav } from '../shell/AppShell';
import { Avatar, Card, Icon, PageHeader } from '../ui';

export default function More() {
  useTitle('More');
  const { me, isAdmin, signOut } = useMe();
  const { main, mobile } = useNav();
  const b = useBadges();
  const extra = main.filter((i) => !mobile.some((m) => m.to === i.to));
  const row = 'flex items-center gap-3.5 min-h-14 px-4 border-t border-line-2 first:border-t-0 no-underline text-ink text-[16px] font-semibold hover:bg-[#FAFBFC]';
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="More" />
      <Link to="/me" className="flex items-center gap-3.5 bg-card border border-line rounded-2xl p-4 no-underline text-ink">
        <Avatar name={displayName(me)} size={48} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[17px] truncate">{displayName(me)}</span>
          <span className="block text-sm text-muted">{LEVELS[me.level].label} · Profile and documents</span>
        </span>
        <Icon name="chevronRight" size={18} className="text-muted" />
      </Link>
      <Card padded={false} className="overflow-hidden">
        {extra.map((i) => (
          <Link key={i.to} to={i.to} className={row}>
            <Icon name={i.icon} size={22} className="text-brand-ink" />{i.label}
            {i.badge && b[i.badge] > 0 && <span className="ml-auto min-w-6 h-6 px-1.5 rounded-full bg-amber text-xs font-bold flex items-center justify-center">{b[i.badge]}</span>}
            {!(i.badge && b[i.badge] > 0) && <Icon name="chevronRight" size={18} className="ml-auto text-muted" />}
          </Link>
        ))}
        <Link to="/vault" className={row}><Icon name="key" size={22} className="text-brand-ink" />Vault<Icon name="chevronRight" size={18} className="ml-auto text-muted" /></Link>
      </Card>
      {isAdmin && (
        <Card padded={false} className="overflow-hidden">
          <Link to="/admin" className={row}><Icon name="shield" size={22} className="text-brand-ink" />Admin portal<Icon name="chevronRight" size={18} className="ml-auto text-muted" /></Link>
        </Card>
      )}
      <Card padded={false} className="overflow-hidden">
        <Link to="/practice" className={row}><Icon name="replay" size={22} className="text-brand-ink" />Replay the platform tour<Icon name="chevronRight" size={18} className="ml-auto text-muted" /></Link>
        <button type="button" onClick={signOut} className={row + ' w-full text-left cursor-pointer bg-white text-bad'}><Icon name="logout" size={22} />Sign out</button>
      </Card>
    </div>
  );
}
