// Sends apply1234 emails through Resend:
//  • a confirmation to the candidate when they finish an activity
//  • a heads-up to every admin who has notifications on (new applicant, new help message)
//
// The browser calls this right after a submission or help message. It needs no login:
// each record can trigger emails only once, only within 2 hours, and only from the same
// browser (visitor id) that created it. Admin addresses never leave the server.
//
// Secret needed: RESEND_API_KEY (Supabase → Edge Functions → Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://www.apply1234.com';
const FROM = 'apply1234 <hiring@apply1234.com>';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_CONFIRM_SUBJECT = 'We got your answers for {role}';
const DEFAULT_CONFIRM_BODY =
  'Hi {first},\n\nThanks for completing the activity for the {role} role. Your video answers came through, and a person on our team will watch every one.\n\nWhat happens next: if your answers are a good fit, we\'ll email you to set up a short interview. Either way, we\'ll let you know.\n\nYou don\'t need to do anything else. If something went wrong with your submission, just reply to this email.\n';

const KIND_LABEL: Record<string, string> = { bug: 'Something isn\'t working', question: 'Question about the role', other: 'Other' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

function layout(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;padding:24px 12px;font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16151a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2ded4;border-radius:16px;padding:28px">
    <div style="font-weight:700;font-size:15px;letter-spacing:-0.01em;margin-bottom:20px">apply<span style="color:#ff5a1f">1234</span></div>
    ${inner}
  </div>
  <p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#6e6c73;text-align:center">Sent by apply1234.com</p>
</body></html>`;
}

const paragraphs = (text: string) =>
  text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6;font-size:15px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

const button = (href: string, label: string) =>
  `<p style="margin:22px 0 4px"><a href="${esc(href)}" style="display:inline-block;background:#16151a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">${esc(label)}</a></p>`;

const row = (k: string, v: string) =>
  `<tr><td style="padding:6px 12px 6px 0;color:#6e6c73;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px">${v}</td></tr>`;

async function send(key: string, msg: { to: string[]; subject: string; html: string; text: string; reply_to?: string }) {
  if (!msg.to.length) return { ok: true, skipped: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, ...msg, reply_to: msg.reply_to || undefined }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, id: body?.id, error: r.ok ? undefined : body?.message || body?.name };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const body = await req.json().catch(() => ({}));
  const visitor = String(body?.visitor_id || '').slice(0, 64);
  if (!visitor) return json({ ok: false, error: 'visitor' }, 400);

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return json({ ok: false, error: 'not_configured' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - 2 * 3600_000).toISOString();

  const { data: admins } = await db.from('hiring_admins').select('email, user_id, notify_applications, notify_messages');
  const live = (admins || []).filter((a) => a.user_id);
  const fallbackReply = live[0]?.email || '';

  // ── New applicant ──
  if (body?.application_id) {
    const { data: app } = await db
      .from('hiring_applications')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', String(body.application_id))
      .eq('visitor_id', visitor)
      .is('notified_at', null)
      .gte('submitted_at', since)
      .select('*')
      .maybeSingle();
    if (!app) return json({ ok: true, skipped: true });

    const { data: job } = await db.from('hiring_jobs').select('id, title, settings').eq('id', app.job_id).maybeSingle();
    const settings = (job?.settings || {}) as Record<string, string | boolean | undefined>;
    const role = job?.title || 'the role';
    const first = String(app.name || '').trim().split(/\s+/)[0] || 'there';
    const test = app.metrics?.preview === true || app.metrics?.preview === 'true';
    const tag = test ? '[Test] ' : '';
    const results: Record<string, unknown> = {};

    // 1. Candidate confirmation
    if (!settings.confirm_off) {
      const vars = { first, name: app.name, role };
      const subject = tag + fill(String(settings.confirm_subject || DEFAULT_CONFIRM_SUBJECT), vars);
      const text = fill(String(settings.confirm_body || DEFAULT_CONFIRM_BODY), vars);
      results.candidate = await send(key, {
        to: [app.email],
        subject,
        text,
        html: layout(paragraphs(text)),
        reply_to: String(settings.reply_to || fallbackReply),
      });
    }

    // 2. Admin heads-up
    const to = live.filter((a) => a.notify_applications !== false).map((a) => a.email);
    if (to.length) {
      const f = app.flags || {};
      const mark = (v: unknown, yes: string, no: string, unknown = 'Not checked') =>
        v === true ? `✓ ${yes}` : v === false ? `<span style="color:#c0352b">✗ ${no}</span>` : unknown;
      const files = Array.isArray(app.attachments) ? app.attachments : [];
      const link = `${SITE}/admin/candidates/${app.id}`;
      const answered = Array.isArray(app.answers) ? app.answers.length : 0;
      const inner = `
        <h1 style="font-size:20px;margin:0 0 4px">${esc(app.name)} finished the activity</h1>
        <p style="margin:0 0 16px;color:#6e6c73;font-size:14px">${esc(role)}${app.metrics?.source_label ? ` · via ${esc(app.metrics.source_label)}` : ''}</p>
        <table style="border-collapse:collapse;width:100%">
          ${row('Email', `<a href="mailto:${esc(app.email)}" style="color:#16151a">${esc(app.email)}</a>`)}
          ${row('Answers', `${answered} video${answered === 1 ? '' : 's'}`)}
          ${row('Code word', mark(f.hidden_code_ok, 'In video titles', 'Missing from titles', 'Not used'))}
          ${row('Video lengths', mark(f.lengths_in_range, 'In range', 'Outside the range', 'Not known yet'))}
          ${row('Transcripts', mark(f.transcripts_ok, 'Included', 'Missing'))}
          ${f.duplicate_email ? row('Note', '<span style="color:#b26a00">Applied before with this email</span>') : ''}
          ${row('Résumé / letter', files.length || app.cover_letter ? [files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : '', app.cover_letter ? 'cover letter' : ''].filter(Boolean).join(' + ') : 'None')}
        </table>
        ${button(link, 'Open their answers')}`;
      results.admins = await send(key, {
        to,
        subject: `${tag}New applicant: ${app.name} · ${role}`,
        text: `${app.name} (${app.email}) finished the activity for ${role}.\n\nOpen their answers: ${link}\n`,
        html: layout(inner),
        reply_to: app.email,
      });
    }
    return json({ ok: true, results });
  }

  // ── New help message ──
  if (body?.message_id) {
    const { data: m } = await db
      .from('hiring_messages')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', String(body.message_id))
      .eq('visitor_id', visitor)
      .is('notified_at', null)
      .gte('created_at', since)
      .select('*')
      .maybeSingle();
    if (!m) return json({ ok: true, skipped: true });

    const to = live.filter((a) => a.notify_messages !== false).map((a) => a.email);
    if (!to.length) return json({ ok: true, skipped: true });
    const { data: job } = m.job_id ? await db.from('hiring_jobs').select('title').eq('id', m.job_id).maybeSingle() : { data: null };
    const kind = KIND_LABEL[m.kind] || 'Message';
    const ctx = (m.context || {}) as Record<string, unknown>;
    const who = m.name || m.email || 'A candidate';
    const inner = `
      <h1 style="font-size:20px;margin:0 0 4px">${esc(kind)}</h1>
      <p style="margin:0 0 16px;color:#6e6c73;font-size:14px">From ${esc(who)}${job?.title ? ` · ${esc(job.title)}` : ''}</p>
      <div style="background:#f5f3ee;border-radius:12px;padding:14px 16px;margin-bottom:14px">${paragraphs(m.body)}</div>
      <table style="border-collapse:collapse;width:100%">
        ${m.email ? row('Reply to', `<a href="mailto:${esc(m.email)}" style="color:#16151a">${esc(m.email)}</a>`) : row('Reply to', 'No email given')}
        ${ctx.step ? row('Was on', esc(ctx.step)) : ''}
        ${ctx.browser ? row('Browser', esc(ctx.browser)) : ''}
        ${m.application_id ? row('Applied', 'Yes, linked in the inbox') : ''}
      </table>
      ${button(`${SITE}/admin/inbox`, 'Open the inbox')}`;
    const result = await send(key, {
      to,
      subject: `${kind}: ${who}${job?.title ? ` · ${job.title}` : ''}`,
      text: `${kind} from ${who}${m.email ? ` <${m.email}>` : ''}:\n\n${m.body}\n\nInbox: ${SITE}/admin/inbox\n`,
      html: layout(inner),
      reply_to: m.email || undefined,
    });
    return json({ ok: true, result });
  }

  return json({ ok: false, error: 'nothing_to_send' }, 400);
});
