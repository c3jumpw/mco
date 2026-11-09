import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { cx, deviceText, plural } from '../lib/util';
import type { Member, Org, OrgFlags } from '../lib/types';
import { Button, Card, CardHeader, EmptyState, ErrorBox, Icon, Notice, PageHeader, SearchInput, Select, Skeleton, Switch, useToast } from '../ui';
import { ADMIN_BACK, csvTime, downloadCsv, groupOf, personName, stamp } from './parts/ops-common';
import { AuditList, actionText, useAuditLog } from './parts/ops-audit';

const DEFAULT_FLAGS: OrgFlags = { chat: true, tasks: true, certificates: false, record_ip: true };

const FLAGS: { k: keyof OrgFlags; label: string; desc: string; off: string }[] = [
  {
    k: 'chat', label: 'Chat',
    desc: 'Company and department channels, plus direct messages between team members.',
    off: 'When off, Chat leaves the menu and nobody can post. Past messages are kept.',
  },
  {
    k: 'tasks', label: 'Tasks',
    desc: 'A task board for everyone. Mentors and leads can assign tasks to the people they look after.',
    off: 'When off, Tasks leaves the menu. Existing tasks are kept.',
  },
  {
    k: 'certificates', label: 'Certificates',
    desc: 'Give people a certificate when they finish their assigned training.',
    off: 'When off, no certificates are shown.',
  },
  {
    k: 'record_ip', label: 'Record IP address and device',
    desc: 'Saved with every sign-in, signature and form submission, as evidence of who did what and from where. The database reads them from the request, so they can’t be faked from the browser.',
    off: 'Turning this off stops recording IP and device on new sign-ins and submissions. Records already saved keep theirs.',
  },
];

const SECURITY: { icon: string; title: string; body: string }[] = [
  { icon: 'lock', title: 'Sensitive fields are encrypted', body: 'Answers like bank and ID numbers are encrypted in the database with a key held in Supabase Vault. The key never reaches the browser.' },
  { icon: 'eye', title: 'Every reveal is logged', body: 'Showing an encrypted answer or opening a person’s file records who did it, when, and from which IP address and device.' },
  { icon: 'folder', title: 'Private file storage', body: 'Uploaded files sit in a private bucket. Each one opens through a link that expires after two minutes.' },
  { icon: 'shield', title: 'Owners are protected', body: 'Only an owner can make, change or remove an owner, and RAMP always keeps at least one.' },
  { icon: 'key', title: 'Row-level security', body: 'The database checks every request against the person’s access level, so people only ever receive what they’re allowed to see.' },
];

type Lite = Pick<Member, 'id' | 'full_name' | 'preferred_name' | 'email'>;

export default function System() {
  useTitle('System and audit');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={groupOf('/admin/system')} title="System and audit"
        subtitle="Feature switches, how RAMP protects your records, and the full audit log." />
      <FeatureSwitches />
      <SecurityCard />
      <AuditLog />
    </div>
  );
}

// ───────────────────────── feature switches ─────────────────────────

function FeatureSwitches() {
  const { org, me, setOrg } = useMe();
  const toast = useToast();
  const saved = useMemo(() => ({ ...DEFAULT_FLAGS, ...(org.flags || {}) }), [org.flags]);
  const [draft, setDraft] = useState<OrgFlags>(saved);
  const [busy, setBusy] = useState(false);
  const canEdit = me.level === 'owner';
  const dirty = FLAGS.some((f) => draft[f.k] !== saved[f.k]);

  useEffect(() => { setDraft(saved); }, [saved]);

  async function save() {
    setBusy(true);
    try {
      const { data, error } = await supabase.from('ramp_org').update({ flags: draft }).eq('id', true).select('*').single();
      if (error) throw error;
      setOrg(data as Org);
      toast('Feature switches saved.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Feature switches" subtitle="Turn parts of RAMP on or off for everyone. Nothing is deleted when you turn something off." className="mb-2" />
      {!canEdit && <Notice tone="brand" icon="lock" className="mb-2">Only an owner can change feature switches.</Notice>}
      <ul>
        {FLAGS.map((f) => {
          const on = draft[f.k];
          const changed = on !== saved[f.k];
          return (
            <li key={f.k} className="flex items-start gap-4 py-4 border-t border-line-2 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold flex flex-wrap items-center gap-2">
                  {f.label}
                  <span className={cx('text-xs font-bold', on ? 'text-good' : 'text-muted')}>{on ? 'On' : 'Off'}</span>
                  {changed && <span className="text-xs font-bold text-warn">Not saved</span>}
                </p>
                <p className="text-sm text-muted mt-1 leading-relaxed">{f.desc}</p>
                {(!on || f.k === 'record_ip') && <p className={cx('text-sm mt-1.5 leading-relaxed', !on && f.k === 'record_ip' ? 'text-warn font-semibold' : 'text-ink-2')}>{f.off}</p>}
              </div>
              <Switch checked={on} onChange={(v) => setDraft((d) => ({ ...d, [f.k]: v }))} label={f.label} disabled={!canEdit || busy} />
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className={cx('flex flex-wrap gap-2 justify-end pt-3 border-t border-line',
          dirty && 'sticky z-20 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0 bg-card -mx-5 px-5 pb-3 md:static md:pb-0 md:mx-0 md:px-0')}>
          {dirty && <Button onClick={() => setDraft(saved)} disabled={busy}>Undo changes</Button>}
          <Button variant="primary" onClick={save} loading={busy} disabled={!dirty}>Save switches</Button>
        </div>
      )}
    </Card>
  );
}

function SecurityCard() {
  return (
    <Card>
      <CardHeader title="How RAMP protects your records" subtitle="Built into the database, so it applies everywhere and can’t be switched off." className="mb-4" />
      <ul className="grid gap-4 sm:grid-cols-2">
        {SECURITY.map((s) => (
          <li key={s.title} className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-good-soft text-good flex items-center justify-center shrink-0"><Icon name={s.icon} size={19} /></span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{s.title}</p>
              <p className="text-sm text-muted leading-relaxed mt-0.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────────────────────── audit log ─────────────────────────

function AuditLog() {
  const { org } = useMe();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [person, setPerson] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const people = useAsync(() => q<Lite[]>(supabase.from('ramp_members').select('id, full_name, preferred_name, email')), []);
  const sorted = useMemo(() => [...(people.data || [])].sort((a, b) => personName(a).localeCompare(personName(b))), [people.data]);
  const byId = useMemo(() => new Map((people.data || []).map((p) => [p.id, p])), [people.data]);
  const nameOf = useCallback((id: string | null) => {
    if (!id) return 'System';
    const p = byId.get(id);
    return p ? personName(p) : people.data ? 'Removed person' : '…';
  }, [byId, people.data]);

  const log = useAuditLog({ search: debounced, person });
  const rows = log.data?.rows || [];
  const filtered = !!debounced.trim() || !!person;

  function exportCsv() {
    const out: (string | number)[][] = [['Time', 'Who', 'Action', 'Person', 'Detail', 'IP address', 'Device', 'Browser details']];
    for (const r of rows) {
      out.push([csvTime(r.at, org.timezone), nameOf(r.actor_id), actionText(r.action), r.member_id ? nameOf(r.member_id) : '', r.detail, r.ip || '',
        r.user_agent ? deviceText(r.user_agent) : '', r.user_agent || '']);
    }
    downloadCsv(`ramp-audit-log-${stamp()}.csv`, out);
    toast(`Downloaded ${plural(rows.length, 'entry', 'entries')}.`);
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 flex flex-col gap-4">
        <CardHeader title="Audit log" subtitle={`Every invite, change, signature, file view and reveal, newest first. Times are in ${org.timezone}.`}
          action={<Button icon="download" size="sm" onClick={exportCsv} disabled={!rows.length}>Export {rows.length ? plural(rows.length, 'entry', 'entries') : 'CSV'}</Button>} />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search actions and details" label="Search the audit log" />
          <Select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)} className="min-h-12 rounded-xl">
            <option value="">Everyone</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
          </Select>
        </div>
        {people.error && <ErrorBox error={`Names couldn’t load. ${people.error}`} onRetry={people.reload} />}
      </div>

      {log.error && !log.data ? (
        <div className="px-5 pb-5"><ErrorBox error={log.error} onRetry={log.reload} /></div>
      ) : !log.data ? (
        <div className="px-5 pb-5"><Skeleton rows={5} /></div>
      ) : rows.length === 0 ? (
        <div className="border-t border-line">
          {filtered
            ? <EmptyState icon="search" title="Nothing matches" body="Try other words, or show everyone." action={<Button onClick={() => { setSearch(''); setPerson(''); }}>Clear filters</Button>} />
            : <EmptyState icon="list" title="Nothing logged yet" body="Invites, changes, signatures and file views show up here as they happen." />}
        </div>
      ) : (
        <div className="border-t border-line">
          {log.error && <div className="px-5 pt-4"><ErrorBox error={log.error} onRetry={log.reload} /></div>}
          <AuditList rows={rows} nameOf={nameOf} tz={org.timezone} dim={log.loading} />
          <div className="flex flex-col items-center gap-2 px-5 py-4 border-t border-line">
            <p className="text-sm text-muted">{log.data.more ? `Showing the latest ${rows.length}` : `${plural(rows.length, 'entry', 'entries')}, that’s everything${filtered ? ' that matches' : ''}`}</p>
            {log.moreError && <ErrorBox error={log.moreError} onRetry={log.loadMore} />}
            {log.data.more && <Button onClick={log.loadMore} loading={log.loadingMore}>Load 50 more</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}
