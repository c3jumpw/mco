// Person profile: Sign-ins tab (with new IP and new device flags) and Activity tab (audit entries about them).

import { useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { q, useAsync } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { cx, deviceText, fmtDateTime, plural } from '../../lib/util';
import type { Member, SignIn } from '../../lib/types';
import { Button, Card, Chip, EmptyState, ErrorBox, Notice, Skeleton } from '../../ui';
import { AuditList, useAuditLog } from './ops-audit';

const SIGNIN_LIMIT = 200;

export function SigninsTab({ member }: { member: Member }) {
  const { org } = useMe();
  const res = useAsync(() => q<SignIn[]>(supabase.from('ramp_signins').select('*').eq('member_id', member.id)
    .order('at', { ascending: false }).limit(SIGNIN_LIMIT)), [member.id]);

  // Walk oldest → newest and flag the first time each IP address and each device shows up.
  const rows = useMemo(() => {
    const list = res.data || [];
    const ips = new Set<string>();
    const devices = new Set<string>();
    const flags = new Map<number, { first: boolean; newIp: boolean; newDevice: boolean }>();
    [...list].reverse().forEach((s, i) => {
      const dev = s.user_agent ? deviceText(s.user_agent) : '';
      const newIp = !!s.ip && !ips.has(s.ip);
      const newDevice = !!dev && !devices.has(dev);
      if (s.ip) ips.add(s.ip);
      if (dev) devices.add(dev);
      flags.set(s.id, { first: i === 0, newIp: i > 0 && newIp, newDevice: i > 0 && newDevice });
    });
    return list.map((s) => ({ s, f: flags.get(s.id)! }));
  }, [res.data]);

  if (res.error && !res.data) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Skeleton rows={4} />;

  const ipCount = new Set(rows.map((r) => r.s.ip).filter(Boolean)).size;
  const devCount = new Set(rows.map((r) => (r.s.user_agent ? deviceText(r.s.user_agent) : '')).filter(Boolean)).size;

  return (
    <div className="flex flex-col gap-4">
      {!org.flags?.record_ip && <Notice tone="warn" icon="info">IP and device recording is off (Admin › System), so new sign-ins don’t show them.</Notice>}
      {rows.length > 0 && (
        <p className="text-[15px] text-muted">
          {plural(rows.length, 'sign-in')}{rows.length === SIGNIN_LIMIT ? ' (latest shown)' : ''} from {plural(ipCount, 'IP address', 'IP addresses')} and {plural(devCount, 'device')}.
          New ones are marked the first time they appear.
        </p>
      )}
      <Card padded={false} className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="lock" title="No sign-ins yet"
            body={member.auth_user_id ? 'Sign-ins are recorded each time they open RAMP.' : 'They haven’t created a login yet. Send them their invite from the top of this page.'} />
        ) : (
          <ul>
            {rows.map(({ s, f }) => (
              <li key={s.id} className={cx('flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 px-4 py-3 border-t border-line-2 first:border-t-0', (f.newIp || f.newDevice) && 'bg-warn-soft/40')}>
                <span className="text-[15px] font-semibold sm:w-60 shrink-0 tabular-nums">{fmtDateTime(s.at, org.timezone)}</span>
                <span className="flex-1 min-w-0 text-sm text-ink-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono">{s.ip || 'IP not recorded'}</span>
                  <span title={s.user_agent || undefined}>{s.user_agent ? deviceText(s.user_agent) : 'Device not recorded'}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {f.first && <Chip tone="neutral">First sign-in</Chip>}
                  {f.newIp && <Chip tone="warn" icon="alert">New IP</Chip>}
                  {f.newDevice && <Chip tone="warn" icon="alert">New device</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ActivityTab({ member, nameOf }: { member: Member; nameOf: (id: string | null) => string }) {
  const { org } = useMe();
  const log = useAuditLog({ member: member.id });

  if (log.error && !log.data) return <ErrorBox error={log.error} onRetry={log.reload} />;
  if (!log.data) return <Skeleton rows={5} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted">Everything done by or about them, newest first: invites, changes, documents, reviews, files opened and fields revealed.</p>
      <Card padded={false} className="overflow-hidden">
        {log.data.rows.length === 0
          ? <EmptyState icon="list" title="No activity yet" body="Changes, submissions and record views show up here as they happen." />
          : <AuditList rows={log.data.rows} nameOf={nameOf} tz={org.timezone} showPerson={false} />}
      </Card>
      {log.moreError && <ErrorBox error={log.moreError} onRetry={log.loadMore} />}
      {log.data.more && (
        <Button className="self-center" onClick={log.loadMore} loading={log.loadingMore}>Load more</Button>
      )}
    </div>
  );
}
