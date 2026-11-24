// What the hiring-offer function does, kept apart from Supabase so it can be tested with a fake store.
//
// Hiring team (signed in): send, resend, withdraw, rebuild_pdf. (They open files straight from storage.)
// Candidate (with the private link's token): view, file, sign, decline.
// Every step is added to the offer's event log with the time, IP address and browser.
import {
  DEFAULT_LETTER, type OfferEvent, type OfferFields, type OfferFile, ccList, documentText, fillOffer, firstName, fmtDay, fmtStamp,
  mdEmail, missingForSend, offerTitle, offerVars, payText, sha256Hex, uaLabel,
} from './offer.ts';
import { buildOfferPdf } from './pdf.ts';
import { button, esc, heading, layout, paragraphs, row, table } from './email.ts';

export interface Offer {
  id: string; application_id: string; job_id: string; status: string; fields: OfferFields; letter: string; terms: string;
  attachments: OfferFile[]; token: string | null; final_letter: string | null; final_terms: string | null; doc_hash: string | null;
  expires_at: string | null; sent_at: string | null; sent_by: string | null; sent_meta?: { ip?: string; ua?: string } | null;
  viewed_at: string | null; views: number;
  signed_at: string | null; signer_name: string | null; signature: { kind: 'drawn' | 'typed'; path?: string; text?: string } | null;
  signer_meta: { ip?: string; ua?: string; tz?: string } | null; declined_at: string | null; decline_reason: string | null;
  withdrawn_at: string | null; pdf_path: string | null; events: OfferEvent[];
}
export interface App { id: string; job_id: string; name: string; email: string; stage: string }
/** A message in the conversation between a candidate and the hiring team. */
export interface Chat {
  id: string; application_id: string; job_id: string; offer_id: string | null; sender: 'candidate' | 'team';
  author_email: string; author_name: string; body: string; meta?: { ip?: string; ua?: string }; emailed?: string[];
  read_at?: string | null; created_at: string;
}
export interface Mail { to: string[]; cc?: string[]; subject: string; html: string; text: string; reply_to?: string; from_name?: string; attachments?: { filename: string; content: string }[] }

export interface Store {
  offer(id: string): Promise<Offer | null>;
  offerByToken(token: string): Promise<Offer | null>;
  /** Updates only if the offer is still in one of `from` statuses; returns the new row, or null. */
  patch(id: string, patch: Partial<Offer>, from?: string[]): Promise<Offer | null>;
  application(id: string): Promise<App | null>;
  setStage(appId: string, stage: string): Promise<void>;
  isStaff(userId: string, jobId: string): Promise<boolean>;
  upload(path: string, bytes: Uint8Array, type: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  download(path: string): Promise<Uint8Array | null>;
  signedUrl(path: string, seconds: number, downloadName?: string): Promise<string | null>;
  chat(appId: string): Promise<Chat[]>;
  addChat(row: Omit<Chat, 'id' | 'created_at'>): Promise<Chat>;
  patchChat(id: string, patch: Partial<Chat>): Promise<void>;
  markRead(appId: string, by: string): Promise<void>;
  /** Admins who get an email when a candidate writes. */
  alertEmails(): Promise<string[]>;
}

export interface Deps {
  store: Store;
  user(jwt: string): Promise<{ id: string; email: string } | null>;
  send(mail: Mail): Promise<{ ok: boolean; error?: string }>;
  site: string;
  now?: () => Date;
  token?: () => string;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400) => json({ ok: false, error }, status);

/** The visitor's IP address as the platform reports it. */
export function clientMeta(req: Request) {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || fwd || '').slice(0, 64);
  return { ip: ip || undefined, ua: (req.headers.get('user-agent') || '').slice(0, 300) || undefined };
}

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const base = (o: Offer) => `${o.job_id}/${o.application_id}/offers/${o.id}`;
const cleanBody = (v: unknown) => String(v || '').replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, 5000);
const emails = (list: unknown[]) => [...new Set(list.filter((x): x is string => typeof x === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim())).map((x) => x.trim().toLowerCase()))];
/** The conversation as the candidate sees it: no team members' email addresses, no read receipts. */
const publicChat = (list: Chat[], company: string) => list.map((m) => ({
  id: m.id, from: m.sender === 'candidate' ? 'you' : 'team', name: m.sender === 'candidate' ? '' : (m.author_name || company), body: m.body, at: m.created_at,
}));
const fileName = (s: string) => s.replace(/[^\w .-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'offer';

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('method', 405);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const now = () => (d.now ? d.now() : new Date()).toISOString();
  const meta = clientMeta(req);
  const action = String(body.action || '');
  const s = d.store;

  // ── Hiring team ──
  if (['send', 'resend', 'withdraw', 'rebuild_pdf', 'reply'].includes(action)) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const user = jwt ? await d.user(jwt) : null;
    if (!user) return fail('sign_in', 401);
    const offer = await s.offer(String(body.offer_id || ''));
    if (!offer) return fail('not_found', 404);
    if (!(await s.isStaff(user.id, offer.job_id))) return fail('not_allowed', 403);
    const app = await s.application(offer.application_id);
    if (!app) return fail('not_found', 404);

    if (action === 'send') {
      if (offer.status !== 'draft') return fail('already_sent');
      const missing = missingForSend(offer.fields, offer.letter, offer.terms, now().slice(0, 10));
      if (missing.length) return json({ ok: false, error: 'missing', missing }, 400);
      const at = now();
      const vars = offerVars(offer.fields, app, at.slice(0, 10));
      const letter = fillOffer(offer.letter || DEFAULT_LETTER, vars);
      const terms = fillOffer(offer.terms, vars);
      const hash = await sha256Hex(documentText(letter, terms, offer.attachments || []));
      const token = (d.token || randomToken)();
      const cc = ccList(body.cc, app.email);
      // Attachments shared from the company or job settings are copied into this offer's folder, so the
      // sent offer keeps its own copy even if the shared file is later replaced or removed.
      const own = `${base(offer)}/`;
      const attachments: OfferFile[] = [];
      for (const [i, a] of (offer.attachments || []).entries()) {
        if (a.path.startsWith(own)) { attachments.push(a); continue; }
        const to = `${own}attachments/${Date.now().toString(36)}${i}-${a.path.split('/').pop()}`;
        try { await s.copy(a.path, to); attachments.push({ ...a, path: to }); } catch { attachments.push(a); }
      }
      const events = [...(offer.events || []), { at, type: 'sent', by: user.email, ip: meta.ip, ua: meta.ua, note: `to ${app.email}${cc.length ? `, cc ${cc.join(', ')}` : ''}` }];
      const sent = await s.patch(offer.id, {
        status: 'sent', token, fields: { ...offer.fields, cc }, attachments, final_letter: letter, final_terms: terms, doc_hash: hash, sent_at: at, sent_by: user.email,
        sent_meta: meta, expires_at: `${offer.fields.expires}T23:59:59Z`, events,
      }, ['draft']);
      if (!sent) return fail('already_sent', 409);
      await s.setStage(app.id, 'offer');
      const mailed = await mailOffer(d, sent, app, false);
      const log: OfferEvent[] = [...events, { at: now(), type: mailed.ok ? 'emailed' : 'email_failed', note: mailed.ok ? app.email : mailed.error }];
      if (cc.length) {
        const copied = await mailCopy(d, sent, app, cc);
        log.push({ at: now(), type: copied.ok ? 'cc' : 'email_failed', note: copied.ok ? cc.join(', ') : `copy: ${copied.error}` });
      }
      await s.patch(sent.id, { events: log });
      await mailTeam(d, sent, app, user.email, 'sent');
      return json({ ok: true, link: `${d.site}/offer/${token}`, emailed: mailed.ok });
    }
    if (action === 'resend') {
      if (!['sent', 'viewed'].includes(offer.status)) return fail('not_open');
      const mailed = await mailOffer(d, offer, app, true);
      await s.patch(offer.id, { events: [...offer.events, { at: now(), type: mailed.ok ? 'reminder' : 'email_failed', by: user.email, ip: meta.ip, note: mailed.ok ? app.email : mailed.error }] });
      return json({ ok: mailed.ok, error: mailed.error });
    }
    if (action === 'withdraw') {
      const done = await s.patch(offer.id, {
        status: 'withdrawn', withdrawn_at: now(),
        events: [...offer.events, { at: now(), type: 'withdrawn', by: user.email, ip: meta.ip, ua: meta.ua, note: String(body.note || '').slice(0, 300) || undefined }],
      }, ['sent', 'viewed']);
      return done ? json({ ok: true }) : fail('not_open');
    }
    if (action === 'reply') {
      if (!offer.token) return fail('not_sent');
      const text = cleanBody(body.body);
      if (!text) return fail('empty');
      const f = offer.fields;
      const isManager = user.email === (f.manager_email || '').trim().toLowerCase();
      const msg = await s.addChat({
        application_id: app.id, job_id: offer.job_id, offer_id: offer.id, sender: 'team', author_email: user.email,
        author_name: isManager ? (f.manager_name || '') : '', body: text, meta: { ip: meta.ip, ua: meta.ua },
      });
      await s.markRead(app.id, user.email);
      const r = await mailCandidateMessage(d, offer, app, msg);
      if (r.ok) await s.patchChat(msg.id, { emailed: [app.email] });
      return json({ ok: true, emailed: r.ok, error: r.ok ? undefined : r.error });
    }
    if (action === 'rebuild_pdf') {
      if (offer.status !== 'signed') return fail('not_signed');
      const r = await finishSigned(d, offer, app, false);
      return json({ ok: r.ok, error: r.error });
    }
  }

  // ── Candidate, through the private link ──
  const token = String(body.token || '');
  if (!/^[\w-]{20,64}$/.test(token)) return fail('not_found', 404);
  const offer = await s.offerByToken(token);
  if (!offer) return fail('not_found', 404);
  const app = await s.application(offer.application_id);
  if (!app) return fail('not_found', 404);
  const expired = !!offer.expires_at && new Date(offer.expires_at).getTime() < (d.now ? d.now() : new Date()).getTime();

  if (action === 'view') {
    const first = !offer.viewed_at;
    const recent = offer.events.filter((e) => e.type === 'viewed').slice(-1)[0];
    const log = !recent || recent.ip !== meta.ip || Date.now() - new Date(recent.at).getTime() > 10 * 60_000;
    const patch: Partial<Offer> = { views: (offer.views || 0) + 1 };
    if (first) patch.viewed_at = now();
    if (log && offer.events.length < 200) patch.events = [...offer.events, { at: now(), type: 'viewed', ip: meta.ip, ua: meta.ua }];
    if (offer.status === 'sent') patch.status = 'viewed';
    const cur = (await s.patch(offer.id, patch)) || offer;
    const messages = publicChat(await s.chat(app.id), offer.fields.company || '');
    return json({ ok: true, offer: { ...publicOffer(cur, app, expired), messages } });
  }

  if (action === 'message') {
    // Open whatever the offer's state: a candidate may write to ask for more time after it has expired.
    const text = cleanBody(body.body);
    if (!text) return fail('empty');
    const list = await s.chat(app.id);
    const day = list.filter((m) => m.sender === 'candidate' && Date.now() - new Date(m.created_at).getTime() < 86_400_000).length;
    if (day >= 30) return fail('too_many', 429);
    const msg = await s.addChat({
      application_id: app.id, job_id: offer.job_id, offer_id: offer.id, sender: 'candidate', author_email: app.email,
      author_name: app.name, body: text, meta: { ip: meta.ip, ua: meta.ua },
    });
    const f = offer.fields;
    const to = emails([f.manager_email, offer.sent_by, ...(f.cc || []), ...(await s.alertEmails())]).filter((x) => x !== app.email.toLowerCase());
    if (to.length) {
      const r = await mailTeamMessage(d, offer, app, msg, to);
      if (r.ok) await s.patchChat(msg.id, { emailed: to });
    }
    return json({ ok: true, messages: publicChat([...list, msg], f.company || '') });
  }

  if (action === 'file') {
    const which = body.file;
    let path = '', name = '';
    if (which === 'pdf') {
      if (offer.status !== 'signed' || !offer.pdf_path) return fail('not_found', 404);
      path = offer.pdf_path; name = `${fileName(`Signed offer - ${app.name}`)}.pdf`;
    } else {
      const a = offer.attachments[Number(which)];
      if (!a || offer.status === 'withdrawn') return fail('not_found', 404);
      path = a.path; name = a.name;
      if (offer.events.length < 200) await s.patch(offer.id, { events: [...offer.events, { at: now(), type: 'file', ip: meta.ip, note: a.name }] });
    }
    const url = await s.signedUrl(path, 600, name);
    return url ? json({ ok: true, url }) : fail('not_found', 404);
  }

  if (action === 'sign') {
    if (offer.status === 'signed') return fail('already_signed', 409);
    if (!['sent', 'viewed'].includes(offer.status)) return fail('not_open', 409);
    if (expired) return fail('expired', 409);
    if (body.consent !== true || body.read !== true) return fail('consent');
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (name.length < 2) return fail('name');
    const sig = (body.signature || {}) as { kind?: string; png?: string; text?: string };
    let png: Uint8Array | undefined;
    if (sig.kind === 'drawn') {
      const m = String(sig.png || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!m || m[1].length > 400_000) return fail('signature');
      png = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
      if (png.length < 100 || png[0] !== 0x89 || png[1] !== 0x50) return fail('signature');
    } else if (sig.kind !== 'typed') return fail('signature');
    const typed = sig.kind === 'typed' ? (String(sig.text || '').trim().slice(0, 120) || name) : undefined;
    const at = now();
    const signerMeta = { ...meta, tz: String(body.tz || '').slice(0, 64) || undefined };
    let sigPath: string | undefined;
    if (png) { sigPath = `${base(offer)}/signature.png`; await s.upload(sigPath, png, 'image/png'); }
    const signed = await s.patch(offer.id, {
      status: 'signed', signed_at: at, signer_name: name, signer_meta: signerMeta,
      signature: { kind: sig.kind as 'drawn' | 'typed', path: sigPath, text: typed },
      events: [...offer.events, { at, type: 'signed', ip: meta.ip, ua: meta.ua, note: `${name}, ${sig.kind === 'drawn' ? 'drawn signature' : 'typed signature'}${signerMeta.tz ? `, ${signerMeta.tz}` : ''}` }],
    }, ['sent', 'viewed']);
    if (!signed) return fail('already_signed', 409);
    await s.setStage(app.id, 'hired');
    const r = await finishSigned(d, signed, app, true, png);
    return json({ ok: true, pdf: r.ok, emailed: r.emailed });
  }

  if (action === 'decline') {
    if (expired) return fail('expired', 409);
    const reason = String(body.reason || '').trim().slice(0, 1000);
    const done = await s.patch(offer.id, {
      status: 'declined', declined_at: now(), decline_reason: reason || null,
      events: [...offer.events, { at: now(), type: 'declined', ip: meta.ip, ua: meta.ua, note: reason || undefined }],
    }, ['sent', 'viewed']);
    if (!done) return fail('not_open', 409);
    await mailTeam(d, done, app, '', 'declined');
    return json({ ok: true });
  }

  return fail('unknown_action');
}

/** What the candidate's page may see: no token, internal notes or other people's details. */
function publicOffer(o: Offer, app: App, expired: boolean) {
  const f = o.fields;
  return {
    id: o.id, status: o.status, expired: expired && !['signed', 'declined', 'withdrawn'].includes(o.status),
    company: f.company || '', company_address: f.company_address || '', position: f.position || '',
    summary: {
      position: f.position || '', employment_type: f.employment_type || '', start_date: f.start_date || '', pay: payText(f),
      pay_schedule: f.pay_schedule || '', schedule: f.schedule || '', location: f.location || '', expires: f.expires || '',
    },
    manager: { name: f.manager_name || '', title: f.manager_title || '', email: f.manager_email || '', phone: f.manager_phone || '' },
    candidate: { name: app.name, email: app.email },
    letter: o.final_letter || '', terms: o.final_terms || '',
    attachments: (o.attachments || []).map((a, i) => ({ id: i, name: a.name, size: a.size || null, type: a.type || '' })),
    sent_at: o.sent_at, signed_at: o.signed_at, signer_name: o.signer_name, declined_at: o.declined_at,
    signature_kind: o.signature?.kind || null, pdf: !!o.pdf_path, doc_hash: o.doc_hash,
  };
}

/** Builds the signed PDF, stores it and emails it to both sides. */
async function finishSigned(d: Deps, offer: Offer, app: App, email: boolean, png?: Uint8Array): Promise<{ ok: boolean; emailed?: boolean; error?: string }> {
  const s = d.store;
  const at = () => (d.now ? d.now() : new Date()).toISOString();
  try {
    if (!png && offer.signature?.kind === 'drawn' && offer.signature.path) png = (await s.download(offer.signature.path)) || undefined;
    const f = offer.fields;
    const pdf = await buildOfferPdf({
      offerId: offer.id, title: offerTitle(f), company: f.company || '', companyAddress: f.company_address, position: f.position || '',
      candidateName: app.name, candidateEmail: app.email, letter: offer.final_letter || '', terms: offer.final_terms || '',
      attachments: offer.attachments || [],
      manager: { name: f.manager_name || '', title: f.manager_title, email: f.manager_email || '', phone: f.manager_phone },
      sentAt: offer.sent_at || '', sentBy: offer.sent_by || '', signerName: offer.signer_name || app.name, signedAt: offer.signed_at || at(),
      signature: { kind: offer.signature?.kind || 'typed', png, text: offer.signature?.text }, signerMeta: offer.signer_meta || {},
      docHash: offer.doc_hash || '', events: offer.events,
    });
    const path = `${base(offer)}/signed-offer-${Date.now().toString(36)}.pdf`;
    await s.upload(path, pdf, 'application/pdf');
    let cur = (await s.patch(offer.id, { pdf_path: path, events: [...offer.events, { at: at(), type: 'pdf', note: `${Math.round(pdf.length / 1024)} KB` }] })) || offer;
    if (!email) return { ok: true };
    const attachment = { filename: `${fileName(`Signed offer - ${app.name} - ${f.company || ''}`)}.pdf`, content: b64(pdf) };
    const company = f.company || 'the company';
    const a = await d.send({
      to: [app.email], from_name: company, reply_to: f.manager_email,
      subject: `Signed: your offer from ${company}`,
      text: `Hi ${firstName(app.name)},\n\nThanks for signing. Your signed offer for ${f.position} is attached. Keep it for your records.\n\nYou can also open it here: ${d.site}/offer/${offer.token}\n\nQuestions? Reply to reach ${f.manager_name}.\n`,
      html: layout(heading('Your signed offer', `${esc(f.position)} · ${esc(company)}`) +
        paragraphs(`Hi ${firstName(app.name)},\n\nThanks for signing. Your signed offer is attached as a PDF, including the signature certificate. Keep it for your records.${f.start_date ? `\n\nYour start date is ${fmtDay(f.start_date)}.` : ''}\n\nQuestions? Reply to this email to reach ${f.manager_name}.`) +
        button(`${d.site}/offer/${offer.token}`, 'Open your offer'), `Your signed offer from ${company}.`),
      attachments: [attachment],
    });
    const b = await mailTeam(d, cur, app, '', 'signed', attachment);
    cur = (await s.patch(offer.id, { events: [...cur.events, { at: at(), type: a.ok && b ? 'copies' : 'email_failed', note: a.ok && b ? `to ${app.email} and ${f.manager_email}` : a.error || 'team email' }] })) || cur;
    return { ok: true, emailed: a.ok };
  } catch (e) {
    await s.patch(offer.id, { events: [...offer.events, { at: at(), type: 'email_failed', note: `PDF: ${String((e as Error)?.message || e).slice(0, 200)}` }] });
    return { ok: false, error: 'pdf' };
  }
}

/** The email that takes the candidate to their offer. */
function mailOffer(d: Deps, o: Offer, app: App, reminder: boolean) {
  const f = o.fields;
  const company = f.company || 'The hiring team';
  const link = `${d.site}/offer/${o.token}`;
  return d.send({
    to: [app.email], from_name: company, reply_to: f.manager_email,
    subject: `${reminder ? 'Reminder: ' : ''}Your offer from ${company}: ${f.position}`,
    text: `Hi ${firstName(app.name)},\n\n${company} would like to offer you the position of ${f.position}. Review the offer and its terms, then sign online:\n\n${link}\n\nThe offer is open until ${fmtDay(f.expires)}.\n\nQuestions? Message ${company} from your offer page: ${link}#messages\nYou can also reply to this email to reach ${f.manager_name}.\n`,
    html: layout(heading(reminder ? 'A reminder about your offer' : 'You have an offer', `${esc(f.position)} · ${esc(company)}`) +
      paragraphs(`Hi ${firstName(app.name)},\n\n${company} would like to offer you the position of ${f.position}. Review the offer, its terms and any attached documents, then sign online. It takes about five minutes.`) +
      table(row('Start date', esc(fmtDay(f.start_date))) + row('Pay', esc(payText(f))) + row('Open until', esc(fmtDay(f.expires))) +
        row('Contact', `${esc(f.manager_name)}${f.manager_email ? `, <a href="mailto:${esc(f.manager_email)}" style="color:#16151a">${esc(f.manager_email)}</a>` : ''}`)) +
      button(link, 'Review and sign your offer') +
      `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#16151a;">Questions? <a href="${esc(link)}#messages" style="color:#16151a;font-weight:600;">Message ${esc(company)}</a> from your offer page. You’ll get an email when they reply.</p>` +
      `<p style="margin:10px 0 0;font-size:12px;color:#6e6c73;">This link is just for you. You can also reply to this email to reach ${esc(f.manager_name)}.</p>`,
      `${company} would like to offer you the ${f.position} role.`),
  });
}

/** A copy of the offer for the people CC'd: the full letter and terms, but not the candidate's signing link,
 *  so only the candidate can open and sign it and the record stays theirs. */
function mailCopy(d: Deps, o: Offer, app: App, cc: string[]) {
  const f = o.fields;
  const company = f.company || 'The hiring team';
  const profile = `${d.site}/admin/candidates/${app.id}`;
  const note = `This is your copy of the offer ${company} sent to ${app.name} (${app.email}) on ${fmtStamp(o.sent_at)}. The signing link is only in ${firstName(app.name)}'s email, so the signature on record can only be theirs. When ${firstName(app.name)} signs, the signed PDF is emailed to you.`;
  return d.send({
    to: cc, from_name: company, reply_to: f.manager_email && !cc.includes(f.manager_email.toLowerCase()) ? f.manager_email : undefined,
    subject: `Copy: offer to ${app.name}, ${f.position}`,
    text: `${note}\n\n${o.final_letter || ''}\n\nTerms and conditions\n\n${o.final_terms || ''}\n\nTheir profile (hiring team only): ${profile}\n`,
    html: layout(heading(`Copy of the offer to ${app.name}`, `${esc(f.position)} · ${esc(company)}`) +
      `<p style="margin:0 0 16px;padding:12px 14px;background:#f5f3ee;border-radius:10px;font-size:13px;line-height:1.55;color:#3a3940;">${esc(note)}</p>` +
      table(row('Start date', esc(fmtDay(f.start_date))) + row('Pay', esc(payText(f))) + row('Open until', esc(fmtDay(f.expires)))) +
      `<div style="margin-top:18px;padding-top:6px;border-top:1px solid #e2ded4;">${mdEmail(o.final_letter || '', esc)}` +
      (o.final_terms ? `<p style="margin:18px 0 8px;font-size:16px;font-weight:700;">Terms and conditions</p>${mdEmail(o.final_terms, esc)}` : '') +
      ((o.attachments || []).length ? `<p style="margin:18px 0 8px;font-size:15px;font-weight:700;">Attachments</p><p style="margin:0;font-size:14px;">${o.attachments.map((a) => esc(a.name)).join('<br>')}</p>` : '') +
      `</div>` + button(profile, 'Open their profile (hiring team)'), `Your copy of the offer to ${app.name}.`),
  });
}

const quote = (text: string) =>
  `<div style="margin:4px 0 6px;padding:12px 14px;border-left:3px solid #ff5a1f;background:#f5f3ee;border-radius:8px;font-size:15px;line-height:1.6;color:#16151a;white-space:pre-wrap;">${esc(text)}</div>`;

/** A message from the hiring team, emailed to the candidate with a link back to the conversation. */
function mailCandidateMessage(d: Deps, o: Offer, app: App, msg: Chat) {
  const f = o.fields;
  const company = f.company || 'The hiring team';
  const link = `${d.site}/offer/${o.token}#messages`;
  const who = msg.author_name ? `${msg.author_name} at ${company}` : company;
  return d.send({
    to: [app.email], from_name: company, reply_to: f.manager_email,
    subject: `Message from ${company}: ${f.position}`,
    text: `Hi ${firstName(app.name)},\n\n${who} sent you a message:\n\n${msg.body}\n\nReply on your offer page so it stays with your offer: ${link}\n`,
    html: layout(heading(`A message from ${company}`, esc(f.position || '')) +
      paragraphs(`Hi ${firstName(app.name)},\n\n${who} sent you a message:`) + quote(msg.body) +
      button(link, `Reply to ${company}`) +
      `<p style="margin:14px 0 0;font-size:12px;color:#6e6c73;">Replying on your offer page keeps your messages with your offer. You can also reply to this email to reach ${esc(f.manager_name || company)}.</p>`,
      `${who}: ${msg.body.slice(0, 90)}`),
  });
}

/** Tells the team a candidate has written, with a button to reply in apply1234. */
function mailTeamMessage(d: Deps, o: Offer, app: App, msg: Chat, to: string[]) {
  const f = o.fields;
  const profile = `${d.site}/admin/candidates/${app.id}#messages`;
  return d.send({
    to, from_name: 'apply1234', reply_to: app.email,
    subject: `Message from ${app.name}: ${f.position}`,
    text: `${app.name} sent a message about their offer for ${f.position}:\n\n${msg.body}\n\nReply in apply1234: ${profile}\n\nReplying in apply1234 keeps the conversation on their profile and emails them your reply. Replying to this email goes straight to them but isn't saved in apply1234.\n`,
    html: layout(heading(`${app.name} sent a message`, `${esc(f.position || '')} · ${esc(f.company || '')}`) + quote(msg.body) +
      button(profile, 'Reply in apply1234') +
      `<p style="margin:14px 0 0;font-size:12px;color:#6e6c73;">Replying in apply1234 keeps the conversation on their profile and emails them your reply. Replying to this email goes straight to ${esc(firstName(app.name))} but isn’t saved in apply1234.</p>`,
      `${app.name}: ${msg.body.slice(0, 90)}`),
  });
}

/** Tells the hiring manager (and whoever sent the offer) what happened. */
async function mailTeam(d: Deps, o: Offer, app: App, sender: string, what: 'sent' | 'signed' | 'declined', attachment?: { filename: string; content: string }) {
  const f = o.fields;
  const cc = ccList(f.cc, app.email);
  // People CC'd on the offer already have a full copy of it, so they don't also get the "sent" notice.
  const to = [...new Set([f.manager_email, o.sent_by, sender, ...(what === 'sent' ? [] : cc)].filter((x): x is string => !!x && /@/.test(x)).map((x) => x.toLowerCase()))]
    .filter((x) => what !== 'sent' || !cc.includes(x));
  if (!to.length) return true;
  const profile = `${d.site}/admin/candidates/${app.id}`;
  const title = what === 'sent' ? `Offer sent to ${app.name}` : what === 'signed' ? `${app.name} signed the offer` : `${app.name} declined the offer`;
  const meta = o.signer_meta || {};
  const rows = row('Position', esc(f.position)) + row('Candidate', `${esc(app.name)} · ${esc(app.email)}`) +
    (what === 'sent' ? row('Open until', esc(fmtDay(f.expires))) + row('Sent by', esc(o.sent_by)) : '') +
    (what === 'signed' ? row('Signed', esc(fmtStamp(o.signed_at))) + row('From', esc(`${meta.ip ? `IP ${meta.ip}, ` : ''}${uaLabel(meta.ua)}`)) + row('Start date', esc(fmtDay(f.start_date))) : '') +
    (what === 'declined' ? row('Reason', esc(o.decline_reason || 'No reason given')) : '');
  const r = await d.send({
    to, from_name: 'apply1234', reply_to: what === 'sent' ? undefined : app.email,
    subject: `${title}: ${f.position}`,
    text: `${title} for ${f.position} at ${f.company}.\n\nTheir profile: ${profile}\n`,
    html: layout(heading(title, `${esc(f.position)} · ${esc(f.company)}`) + table(rows) +
      (what === 'signed' ? paragraphs('The signed offer, with its signature certificate, is attached. It is also on their profile with the signature and every attachment.') : '') +
      button(profile, 'Open their profile'), title),
    attachments: attachment ? [attachment] : undefined,
  });
  return r.ok;
}
