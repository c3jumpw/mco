// Sends apply1234 emails through Resend, all from apply1234 <hiring@apply1234.com>:
//  • a confirmation to the candidate when they finish an activity
//  • a heads-up to every admin who has notifications on (new applicant, new help message)
//  • a heads-up to people given access to that job (new applicant), if they asked for it
//  • an invitation when an admin gives someone access to a job
//
// Candidate-side emails need no login: each record can trigger emails only once, only within
// 2 hours, and only from the same browser (visitor id) that created it. Invitations need a
// signed-in admin. Admin and reviewer addresses never leave the server.
//
// Secret needed: APPLY1234_RESEND_API_KEY (Supabase → Edge Functions → Secrets).
// RESEND_API_KEY is still read as a fallback, so older setups keep working.
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
  'Hi {first},\n\nThanks for completing the activity for the {role} role. Your answers came through, and a person on our team will review every one.\n\nWhat happens next: if your answers are a good fit, we\'ll email you to set up a short interview. Either way, we\'ll let you know.\n\nYou don\'t need to do anything else. If something went wrong with your submission, just reply to this email.\n';

const KIND_LABEL: Record<string, string> = { bug: 'Something isn\'t working', question: 'Question about the role', other: 'Other' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// ── Brand: the same paper, ink and orange as the site, and the mono "apply1234" wordmark ──
const INK = '#16151a';
const MUTED = '#6e6c73';
const PAPER = '#f5f3ee';
const LINE = '#e2ded4';
const ACCENT = '#ff5a1f';
const SANS = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function layout(inner: string, preheader = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>apply1234</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER}">${esc(preheader)}&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 14px;font-family:${MONO};font-size:16px;font-weight:700;letter-spacing:-0.02em;color:${INK};">apply<span style="color:${ACCENT};">1234</span></td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:28px;font-family:${SANS};color:${INK};">${inner}</td></tr>
    <tr><td style="padding:16px 4px 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};">
      Sent by <a href="${SITE}" style="color:${MUTED};">apply1234.com</a> from hiring@apply1234.com
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const heading = (t: string, sub = '') =>
  `<h1 style="margin:0 0 4px;font-family:${SANS};font-size:20px;line-height:1.3;color:${INK};">${esc(t)}</h1>` +
  (sub ? `<p style="margin:0 0 18px;font-size:14px;color:${MUTED};">${sub}</p>` : '');

const paragraphs = (text: string) =>
  text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6;font-size:15px;color:${INK};">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td style="border-radius:10px;background:${INK};"><a href="${esc(href)}" style="display:inline-block;padding:12px 20px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a></td></tr></table>`;

const row = (k: string, v: string) =>
  `<tr><td style="padding:6px 14px 6px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top;font-family:${SANS};">${esc(k)}</td><td style="padding:6px 0;font-size:14px;font-family:${SANS};color:${INK};">${v}</td></tr>`;

const table = (rows: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">${rows}</table>`;

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
  const key = Deno.env.get('APPLY1234_RESEND_API_KEY') || Deno.env.get('RESEND_API_KEY');
  if (!key) return json({ ok: false, error: 'not_configured' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // ── Invitation to a job (signed-in admins only) ──
  if (body?.invite_reviewer) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = await db.auth.getUser(jwt).catch(() => ({ data: { user: null } }));
    const uid = who?.user?.id;
    if (!uid) return json({ ok: false, error: 'sign_in' }, 401);
    const { data: admin } = await db.from('hiring_admins').select('email').eq('user_id', uid).maybeSingle();
    if (!admin) return json({ ok: false, error: 'not_admin' }, 403);

    const { data: a } = await db.from('hiring_reviewers').select('*').eq('id', String(body.invite_reviewer)).maybeSingle();
    if (!a) return json({ ok: false, error: 'not_found' }, 404);
    const { data: job } = await db.from('hiring_jobs').select('title').eq('id', a.job_id).maybeSingle();
    const role = job?.title || 'a role';
    const first = String(a.name || '').trim().split(/\s+/)[0];
    const editor = a.role === 'editor';
    const what = editor
      ? `You can edit the ${role} job and manage its candidates: review their answers, score them, move them through the stages and email them.`
      : `You can review each candidate's answers, fill in your own scorecard and leave notes for the hiring team.`;
    const steps = [
      `Open <a href="${SITE}/admin" style="color:${INK};">apply1234.com/admin</a>`,
      `Choose <b>First time? Create your login</b> and sign up with <b>${esc(a.email)}</b>`,
      `Confirm your email from the message we send you, then sign in`,
    ];
    const inner = heading(`You're invited to ${editor ? 'manage' : 'review candidates for'} ${role}`, `From ${esc(admin.email)}`) +
      paragraphs(`Hi${first ? ` ${first}` : ''},\n\n${what}`) +
      `<ol style="margin:0 0 6px;padding-left:20px;font-size:15px;line-height:1.7;color:${INK};">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>` +
      `<p style="margin:10px 0 0;font-size:13px;color:${MUTED};">Already have an apply1234 login? Just sign in.</p>` +
      button(`${SITE}/admin`, 'Open apply1234');
    const result = await send(key, {
      to: [a.email],
      subject: `You're invited to ${editor ? 'manage' : 'review candidates for'} ${role}`,
      text: `Hi${first ? ` ${first}` : ''},\n\n${what}\n\n1. Open ${SITE}/admin\n2. Choose "First time? Create your login" and sign up with ${a.email}\n3. Confirm your email, then sign in.\n\nAlready have a login? Just sign in.\n`,
      html: layout(inner, `${editor ? 'Manage' : 'Review candidates for'} ${role} on apply1234.`),
      reply_to: admin.email,
    });
    if (result.ok) await db.from('hiring_reviewers').update({ last_invite_at: new Date().toISOString() }).eq('id', a.id);
    return json({ ok: result.ok, result });
  }

  const visitor = String(body?.visitor_id || '').slice(0, 64);
  if (!visitor) return json({ ok: false, error: 'visitor' }, 400);
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
        html: layout(paragraphs(text), `Your answers for ${role} arrived.`),
        reply_to: String(settings.reply_to || fallbackReply),
      });
    }

    // 2. Heads-up for the hiring team, and for people with access to this job
    const f = app.flags || {};
    const mark = (v: unknown, yes: string, no: string, unknown = 'Not checked') =>
      v === true ? `✓ ${yes}` : v === false ? `<span style="color:#c0352b">✗ ${no}</span>` : unknown;
    const files = Array.isArray(app.attachments) ? app.attachments : [];
    const link = `${SITE}/admin/candidates/${app.id}`;
    const answers: { type?: string; skipped?: boolean }[] = Array.isArray(app.answers) ? app.answers : [];
    const answered = answers.filter((a) => !a.skipped).length;
    const videoOnly = !answers.some((a) => a.type && a.type !== 'video');
    const hasVideo = videoOnly || f.all_loom_links != null;
    const ai = app.metrics?.ai_use as { used?: boolean; how?: string } | undefined;
    const summary = (showEmail: boolean) => table(
      (showEmail ? row('Email', `<a href="mailto:${esc(app.email)}" style="color:${INK}">${esc(app.email)}</a>`) : '') +
      row('Answers', videoOnly ? `${answered} video${answered === 1 ? '' : 's'}` : `${answered} of ${answers.length} steps`) +
      (f.musthave_ok != null ? row('Must-haves', mark(f.musthave_ok, 'All as needed', 'At least one doesn’t match')) : '') +
      (f.quiz_total ? row('Quick scenarios', `${f.quiz_right || 0} of ${f.quiz_total} best answers`) : '') +
      row('Code word', mark(f.hidden_code_ok, hasVideo ? 'Found' : 'Found in their answers', 'Missing', 'Not used')) +
      (hasVideo ? row('Video lengths', mark(f.lengths_in_range, 'In range', 'Outside the suggested range', 'Not shared by Loom')) : '') +
      (hasVideo && f.transcripts_ok != null ? row('Transcripts', mark(f.transcripts_ok, 'Included', 'Missing')) : '') +
      (f.pasted ? row('Writing', '<span style="color:#b26a00">A written answer was mostly pasted in</span>') : '') +
      (ai ? row('AI use', ai.used ? `Used AI${ai.how ? `: “${esc(String(ai.how).slice(0, 160))}”` : ''}` : 'Didn’t use AI') : '') +
      (f.duplicate_email ? row('Note', '<span style="color:#b26a00">Applied before with this email</span>') : '') +
      row('Résumé / letter', files.length || app.cover_letter
        ? [files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : '', app.cover_letter ? 'cover letter' : ''].filter(Boolean).join(' + ')
        : 'None'));
    const sub = `${esc(role)}${app.metrics?.source_label ? ` · via ${esc(app.metrics.source_label)}` : ''}`;

    const to = live.filter((a) => a.notify_applications !== false).map((a) => a.email);
    if (to.length) {
      results.admins = await send(key, {
        to,
        subject: `${tag}New applicant: ${app.name} · ${role}`,
        text: `${app.name} (${app.email}) finished the activity for ${role}.\n\nOpen their answers: ${link}\n`,
        html: layout(heading(`${app.name} finished the activity`, sub) + summary(true) + button(link, 'Open their answers'),
          `${app.name} applied for ${role}.`),
        reply_to: app.email,
      });
    }

    // People invited to this job. Test runs by the team are never sent to them.
    if (!test) {
      const adminEmails = new Set(live.map((a) => String(a.email).toLowerCase()));
      const { data: access } = await db.from('hiring_reviewers')
        .select('email, role, hide_contact, shortlisted_only, notify, user_id')
        .eq('job_id', app.job_id).eq('notify', true).not('user_id', 'is', null);
      const reviewers = (access || []).filter((r) => !r.shortlisted_only && !adminEmails.has(String(r.email).toLowerCase()));
      results.access = await Promise.all(reviewers.map((r) => {
        const showEmail = r.role === 'editor' || !r.hide_contact;
        return send(key, {
          to: [r.email],
          subject: `New candidate for ${role}: ${app.name}`,
          text: `${app.name} applied for ${role}. Review their answers and add your scorecard: ${link}\n`,
          html: layout(heading(`New candidate: ${app.name}`, sub) + summary(showEmail) +
            button(link, r.role === 'editor' ? 'Open their answers' : 'Review and score') +
            `<p style="margin:14px 0 0;font-size:12px;color:${MUTED};">You get these because you have access to ${esc(role)}. Ask the hiring team to switch them off.</p>`,
            `${app.name} applied for ${role}.`),
          reply_to: fallbackReply || undefined,
        });
      }));
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
    const inner = heading(kind, `From ${esc(who)}${job?.title ? ` · ${esc(job.title)}` : ''}`) +
      `<div style="background:${PAPER};border-radius:12px;padding:14px 16px;margin-bottom:14px">${paragraphs(m.body)}</div>` +
      table(
        (m.email ? row('Reply to', `<a href="mailto:${esc(m.email)}" style="color:${INK}">${esc(m.email)}</a>`) : row('Reply to', 'No email given')) +
        (ctx.step ? row('Was on', esc(ctx.step)) : '') +
        (ctx.browser ? row('Browser', esc(ctx.browser)) : '') +
        (m.application_id ? row('Applied', 'Yes, linked in the inbox') : '')) +
      button(`${SITE}/admin/inbox`, 'Open the inbox');
    const result = await send(key, {
      to,
      subject: `${kind}: ${who}${job?.title ? ` · ${job.title}` : ''}`,
      text: `${kind} from ${who}${m.email ? ` <${m.email}>` : ''}:\n\n${m.body}\n\nInbox: ${SITE}/admin/inbox\n`,
      html: layout(inner, `${kind} from ${who}.`),
      reply_to: m.email || undefined,
    });
    return json({ ok: true, result });
  }

  return json({ ok: false, error: 'nothing_to_send' }, 400);
});
