// hiring-offer: sends offer letters, shows them to candidates through a private link, records the
// signature with time, IP address and browser, builds the signed PDF and emails it to both sides.
// The logic is in core.ts; this file connects it to Supabase and Resend.
//
// Secret needed: APPLY1234_RESEND_API_KEY (falls back to RESEND_API_KEY), same as hiring-notify.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, type Mail, type Offer, type Store } from './core.ts';

const BUCKET = 'hiring-team';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const store: Store = {
  async offer(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data } = await db.from('hiring_offers').select('*').eq('id', id).maybeSingle();
    return data as Offer | null;
  },
  async offerByToken(token) {
    const { data } = await db.from('hiring_offers').select('*').eq('token', token).maybeSingle();
    return data as Offer | null;
  },
  async patch(id, patch, from) {
    let q = db.from('hiring_offers').update(patch).eq('id', id);
    if (from?.length) q = q.in('status', from);
    const { data, error } = await q.select('*').maybeSingle();
    if (error) throw error;
    return data as Offer | null;
  },
  async application(id) {
    const { data } = await db.from('hiring_applications').select('id, job_id, name, email, stage').eq('id', id).maybeSingle();
    return data;
  },
  async setStage(appId, stage) { await db.from('hiring_applications').update({ stage }).eq('id', appId); },
  async isStaff(userId, jobId) {
    const { data: a } = await db.from('hiring_admins').select('email').eq('user_id', userId).maybeSingle();
    if (a) return true;
    const { data: r } = await db.from('hiring_reviewers').select('id').eq('user_id', userId).eq('job_id', jobId).eq('role', 'editor').maybeSingle();
    return !!r;
  },
  async upload(path, bytes, type) {
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw error;
  },
  async copy(from, to) {
    const { error } = await db.storage.from(BUCKET).copy(from, to);
    if (error) throw error;
  },
  async download(path) {
    const { data } = await db.storage.from(BUCKET).download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  },
  async signedUrl(path, seconds, downloadName) {
    const { data } = await db.storage.from(BUCKET).createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
    return data?.signedUrl || null;
  },
};

const fromName = (n?: string) => (n || 'apply1234').replace(/["<>\r\n]/g, '').slice(0, 60);

async function send(m: Mail) {
  const key = Deno.env.get('APPLY1234_RESEND_API_KEY') || Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'not_configured' };
  const name = fromName(m.from_name);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${name === 'apply1234' ? name : `${name} via apply1234`} <hiring@apply1234.com>`,
      to: m.to, cc: m.cc?.length ? m.cc : undefined, subject: m.subject, html: m.html, text: m.text, reply_to: m.reply_to || undefined, attachments: m.attachments,
    }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, error: r.ok ? undefined : body?.message || body?.name || `status ${r.status}` };
}

Deno.serve((req) => handle(req, {
  store, send, site: 'https://www.apply1234.com',
  async user(jwt) {
    const { data } = await db.auth.getUser(jwt).catch(() => ({ data: { user: null } }));
    return data?.user ? { id: data.user.id, email: (data.user.email || '').toLowerCase() } : null;
  },
}).catch((e) => new Response(JSON.stringify({ ok: false, error: 'server', detail: String(e?.message || e).slice(0, 200) }), {
  status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
})));
