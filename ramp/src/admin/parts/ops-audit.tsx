// Audit log: paged loading (50 at a time) and a list that is a table on desktop and cards on phones.

import { useCallback, useRef, useState } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { q, useAsync } from '../../lib/hooks';
import { cx, deviceText, fmtDateTime } from '../../lib/util';
import type { AuditEntry } from '../../lib/types';
import { Chip } from '../../ui';

export const AUDIT_PAGE = 50;

export interface AuditFilter { member?: string; person?: string; search?: string }

/** Strip characters that would break a PostgREST or() filter, and the LIKE wildcards. */
function safeSearch(s: string | undefined) {
  return (s || '').replace(/[,()"\\%*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function auditPage(f: AuditFilter, from: number) {
  let qb = supabase.from('ramp_audit').select('*')
    .order('at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + AUDIT_PAGE - 1);
  if (f.member) qb = qb.eq('member_id', f.member);
  if (f.person) qb = qb.or(`member_id.eq.${f.person},actor_id.eq.${f.person}`);
  const s = safeSearch(f.search);
  if (s) qb = qb.or(`action.ilike.%${s}%,detail.ilike.%${s}%`);
  return q<AuditEntry[]>(qb);
}

export function useAuditLog(f: AuditFilter) {
  const key = JSON.stringify([f.member || '', f.person || '', safeSearch(f.search)]);
  const keyRef = useRef(key);
  const filterRef = useRef(f);
  keyRef.current = key;
  filterRef.current = f;
  const res = useAsync(async () => {
    const rows = await auditPage(filterRef.current, 0);
    return { rows, more: rows.length === AUDIT_PAGE };
  }, [key]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const { data, setData } = res;

  const loadMore = useCallback(async () => {
    if (!data) return;
    const started = keyRef.current;
    setLoadingMore(true);
    setMoreError('');
    try {
      const rows = await auditPage(filterRef.current, data.rows.length);
      if (keyRef.current !== started) return;
      setData((prev) => {
        const have = new Set((prev?.rows || []).map((r) => r.id));
        return { rows: [...(prev?.rows || []), ...rows.filter((r) => !have.has(r.id))], more: rows.length === AUDIT_PAGE };
      });
    } catch (e) {
      setMoreError(errText(e));
    } finally {
      setLoadingMore(false);
    }
  }, [data, setData]);

  return { ...res, loadMore, loadingMore, moreError };
}

const SENSITIVE = /^(revealed|opened file)/i;
const DESTRUCTIVE = /^(removed|deleted)/i;

export function actionText(a: string) {
  return a ? a[0]!.toUpperCase() + a.slice(1) : '';
}

function ActionChip({ action }: { action: string }) {
  if (SENSITIVE.test(action)) return <Chip tone="warn" icon="eye">{actionText(action)}</Chip>;
  if (DESTRUCTIVE.test(action)) return <Chip tone="bad">{actionText(action)}</Chip>;
  return <span className="font-semibold text-ink">{actionText(action)}</span>;
}

/** Audit rows. `nameOf` turns a member id into a name; `showPerson` adds the "person" column. */
export function AuditList({ rows, nameOf, tz, showPerson = true, dim }: {
  rows: AuditEntry[]; nameOf: (id: string | null) => string; tz: string; showPerson?: boolean; dim?: boolean;
}) {
  return (
    <div className={cx('transition-opacity', dim && 'opacity-60')} aria-busy={dim || undefined}>
      {/* Phones: one card per entry */}
      <ul className="md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3 border-t border-line-2 first:border-t-0 flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
              <span className="font-semibold">{r.actor_id ? nameOf(r.actor_id) : 'System'}</span>
              <ActionChip action={r.action} />
              {showPerson && r.member_id && r.member_id !== r.actor_id && <span className="text-ink-2">· {nameOf(r.member_id)}</span>}
            </div>
            {r.detail && <p className="text-sm text-ink-2 break-words">{r.detail}</p>}
            <p className="text-xs text-muted">
              {fmtDateTime(r.at, tz)}
              {r.ip && <> · <span className="font-mono">{r.ip}</span></>}
              {r.user_agent && <> · {deviceText(r.user_agent)}</>}
            </p>
          </li>
        ))}
      </ul>
      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="text-xs font-bold uppercase tracking-[0.06em] text-muted bg-bg">
              <th scope="col" className="px-4 py-2.5 font-bold whitespace-nowrap">Time</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Who</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Action</th>
              {showPerson && <th scope="col" className="px-3 py-2.5 font-bold">Person</th>}
              <th scope="col" className="px-3 py-2.5 font-bold">Detail</th>
              <th scope="col" className="px-3 py-2.5 font-bold">IP</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Device</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line-2 align-top">
                <td className="px-4 py-3 whitespace-nowrap text-ink-2 tabular-nums">{fmtDateTime(r.at, tz)}</td>
                <td className="px-3 py-3 font-semibold whitespace-nowrap">{r.actor_id ? nameOf(r.actor_id) : 'System'}</td>
                <td className="px-3 py-3 whitespace-nowrap"><ActionChip action={r.action} /></td>
                {showPerson && <td className="px-3 py-3 text-ink-2 whitespace-nowrap">{r.member_id ? nameOf(r.member_id) : '—'}</td>}
                <td className="px-3 py-3 text-ink-2 break-words min-w-[12rem] max-w-[22rem]">{r.detail || '—'}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-2 whitespace-nowrap">{r.ip || '—'}</td>
                <td className="px-4 py-3 text-ink-2 whitespace-nowrap" title={r.user_agent || undefined}>{r.user_agent ? deviceText(r.user_agent) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
