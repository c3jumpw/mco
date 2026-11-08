import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Template } from '../lib/types';
import { fmtDate, store } from '../lib/util';
import { listTemplates } from './data';
import { Button, Card, Input, Pill, SectionTitle, Toggle, useToast } from '../ui';

interface AdminRow { email: string; user_id: string | null; added_at: string; claimed_at: string | null; notify_applications?: boolean; notify_messages?: boolean }

export default function Settings({ email }: { email: string }) {
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newEmail, setNewEmail] = useState('');

  const load = () => {
    supabase.from('hiring_admins').select('*').order('added_at').then(({ data }) => setAdmins((data || []) as AdminRow[]));
    listTemplates().then(setTemplates);
  };
  useEffect(load, []);

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = newEmail.trim().toLowerCase();
    if (!v.includes('@')) return;
    const { error } = await supabase.from('hiring_admins').insert({ email: v });
    if (error) toast(error.code === '23505' ? 'Already on the list' : error.message, 'bad');
    else { setNewEmail(''); toast('Added. They can now create a login at /admin.'); load(); }
  };

  const mine = admins.find((a) => a.email === email.toLowerCase());
  const setNotify = async (p: Partial<AdminRow>) => {
    if (!mine) return;
    setAdmins((all) => all.map((a) => (a.email === mine.email ? { ...a, ...p } : a)));
    const { error } = await supabase.from('hiring_admins').update(p).eq('email', mine.email);
    if (error) { toast(error.message, 'bad'); load(); } else toast('Saved');
  };

  return (
    <div className="rise max-w-3xl">
      <h1 className="font-display text-4xl sm:text-5xl leading-none mb-6">Settings</h1>
      <div className="space-y-5">
        <Card>
          <SectionTitle sub={`Sent to ${email} from hiring@apply1234.com. Each person on the team picks their own.`}>Email me when</SectionTitle>
          {mine ? (
            <div className="space-y-4">
              <Toggle checked={mine.notify_applications !== false} onChange={(v) => setNotify({ notify_applications: v })}
                label="Someone finishes an activity" hint="Their name, the auto-checks, and a link straight to their answers." />
              <Toggle checked={mine.notify_messages !== false} onChange={(v) => setNotify({ notify_messages: v })}
                label="A candidate sends a help message" hint="From the “Need help?” button on activity pages. Reply straight from the email." />
            </div>
          ) : <p className="text-sm text-muted">Loading…</p>}
          <p className="text-xs text-muted mt-4 leading-relaxed">The candidate confirmation email is set per job, on its Interview tab.</p>
        </Card>

        <Card>
          <SectionTitle sub="Every screen, menu and setting explained with pictures. Share it with new teammates.">Guide</SectionTitle>
          <Link to="/admin/guide"><Button>Open the guide</Button></Link>
        </Card>

        <Card>
          <SectionTitle sub="People on this list can create a login and see every job and candidate.">Hiring team</SectionTitle>
          <ul className="divide-y divide-line">
            {admins.map((a) => (
              <li key={a.email} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.email}</p>
                  <p className="text-[12px] text-muted">added {fmtDate(a.added_at, false)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.user_id ? <Pill tone="good">Active</Pill> : <Pill tone="warn">Invited</Pill>}
                  {a.email !== email.toLowerCase() && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (!confirm(`Remove ${a.email}? They lose access immediately.`)) return;
                      await supabase.from('hiring_admins').delete().eq('email', a.email);
                      load();
                    }}>Remove</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <form onSubmit={addAdmin} className="flex gap-2 mt-3">
            <Input type="email" placeholder="teammate@company.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <Button type="submit">Add</Button>
          </form>
        </Card>

        <Card>
          <SectionTitle sub="Saved from a job’s Activity page tab.">Templates</SectionTitle>
          {templates.length === 0 ? <p className="text-sm text-muted">No templates yet.</p> : (
            <ul className="divide-y divide-line">
              {templates.map((t) => (
                <li key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-[12px] text-muted">{t.kind} · {fmtDate(t.created_at, false)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const name = prompt('Rename template', t.name);
                      if (!name) return;
                      await supabase.from('hiring_templates').update({ name }).eq('id', t.id);
                      load();
                    }}>Rename</Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (!confirm(`Delete template “${t.name}”?`)) return;
                      await supabase.from('hiring_templates').delete().eq('id', t.id);
                      load();
                    }}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Your domain</SectionTitle>
          <p className="text-sm text-ink-2 leading-relaxed">
            Candidates type links on <span className="font-mono">apply1234.com</span>. Once the domain points at this app, every wrong or partial address is logged on the Activity page, and the activity pages load at <span className="font-mono">apply1234.com/your-link</span>.
          </p>
        </Card>

        <Card>
          <SectionTitle>Account</SectionTitle>
          <p className="text-sm text-muted mb-3">Signed in as {email}. This browser is marked as an admin browser, so your visits to activity pages count as tests.</p>
          <Button onClick={async () => { store('a1234_admin', null); await supabase.auth.signOut(); }}>Sign out</Button>
        </Card>
      </div>
    </div>
  );
}
