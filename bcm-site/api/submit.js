// Vercel serverless function: /api/submit
//
// Receives the book-a-call form and saves the lead to two independent places:
//   1. Systeme.io: creates (or updates) the contact, fills custom fields, tags it.
//   2. Your inbox: an optional notification email via Resend.
//
// The visitor sees success if EITHER one worked. If both fail, the function
// returns 502 and the form shows its "didn't go through, try again" screen,
// so a lead is never silently dropped.
//
// ── Systeme.io ──────────────────────────────────────────────────────────
//   SYSTEME_API_KEY          required for the CRM step
//   SYSTEME_FIELD_BUSINESS   custom field slugs (optional, skipped if unset)
//   SYSTEME_FIELD_URGENCY
//   SYSTEME_FIELD_PAIN
//   SYSTEME_FIELD_TEAMSIZE
//   SYSTEME_FIELD_TIMEOFDAY
//   SYSTEME_FIELD_NOTES
//   SYSTEME_FIELD_FIRSTNAME  defaults to "first_name"
//   SYSTEME_FIELD_PHONE      defaults to "phone_number"
//   SYSTEME_TAG_INQUIRY      tag ID applied to every inquiry
//   SYSTEME_TAG_URGENCY_ASAP | _90D | _EXPLORING          (optional)
//   SYSTEME_TAG_PAIN_CHAOS | _PLATEAU | _DEPENDENCE | _TIME | _OTHER
//
// ── Owner notification email ────────────────────────────────────────────
//   RESEND_API_KEY           from resend.com. Alerts are off until this is set.
//   NOTIFY_EMAIL             overrides the recipient (default admin@bcm.mambaykanu.com)
//   NOTIFY_FROM              overrides the sender
//                            (default "BCM Website <support@bcm.mambaykanu.com>";
//                            the domain must be verified in Resend)

const DEFAULT_NOTIFY_EMAIL = 'admin@bcm.mambaykanu.com';
const DEFAULT_NOTIFY_FROM = 'BCM Website <support@bcm.mambaykanu.com>';

const SYSTEME_BASE = 'https://api.systeme.io/api';
const CALL_TIMEOUT_MS = 6000;
const LOOKUP_PAGE_SIZE = 100;
const LOOKUP_MAX_PAGES = 5;

// Human-readable labels so the CRM and email show words, not internal codes.
const LABELS = {
  pain: {
    chaos:      'Systems chaos',
    plateau:    'Growth plateau',
    dependence: 'Team depends on owner',
    time:       'No time to grow',
    other:      'Other',
  },
  urgency: {
    asap:      'ASAP, within 30 days',
    '90d':     'Within 90 days',
    exploring: 'Just exploring',
  },
  teamSize: {
    solo:    'Just me',
    '2-5':   '2-5',
    '6-15':  '6-15',
    '16-50': '16-50',
    '50+':   '50+',
  },
  timeOfDay: {
    morning:   'Mornings',
    midday:    'Midday',
    afternoon: 'Afternoons',
    evening:   'Evenings',
  },
};

function label(group, value) {
  return (LABELS[group] && LABELS[group][value]) || value || '';
}

// fetch with a timeout, returning { ok, status, json, text } and never throwing.
async function call(url, options = {}) {
  try {
    const resp = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { ok: resp.ok, status: resp.status, json, text };
  } catch (err) {
    return { ok: false, status: 0, json: null, text: String(err && err.message) };
  }
}

function systeme(path, apiKey, { method = 'GET', body, contentType } = {}) {
  const headers = { 'X-API-Key': apiKey, 'Accept': 'application/json' };
  if (body !== undefined) headers['Content-Type'] = contentType || 'application/json';
  return call(SYSTEME_BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function logFail(step, r) {
  console.error('[book-a-call] systeme ' + step + ' failed',
    r.status, (r.text || '').slice(0, 800));
}

// Find a contact by EXACT email match. The list endpoint isn't documented to
// filter by email, so we pass the hint but never trust the result blindly:
// every candidate is compared to the address we were given, and we only
// return a contact whose email actually matches. Taking items[0] without that
// check could overwrite an unrelated contact.
async function findContactByEmail(email, apiKey) {
  const target = email.toLowerCase();
  let cursor = null;
  for (let page = 0; page < LOOKUP_MAX_PAGES; page++) {
    const qs = new URLSearchParams({ email, limit: String(LOOKUP_PAGE_SIZE) });
    if (cursor) qs.set('startingAfter', cursor);
    const r = await systeme('/contacts?' + qs.toString(), apiKey);
    if (!r.ok) { logFail('lookup', r); return null; }
    const items = (r.json && r.json.items) || [];
    const match = items.find(c => String(c.email || '').toLowerCase() === target);
    if (match) return match.id;
    if (!r.json || !r.json.hasMore || !items.length) return null;
    cursor = items[items.length - 1].id;
  }
  console.warn('[book-a-call] lookup gave up after', LOOKUP_MAX_PAGES, 'pages');
  return null;
}

// PATCH fields onto a contact. If Systeme rejects the batch, retry one field
// at a time so a single bad value can't drop the rest.
async function patchFields(contactId, fields, apiKey) {
  if (!fields.length) return { saved: [], rejected: [] };
  const patch = (f) => systeme('/contacts/' + contactId, apiKey, {
    method: 'PATCH',
    contentType: 'application/merge-patch+json',
    body: { fields: f },
  });

  const all = await patch(fields);
  if (all.ok) return { saved: fields.map(f => f.slug), rejected: [] };
  logFail('field batch update', all);

  const saved = [];
  const rejected = [];
  for (const f of fields) {
    const one = await patch([f]);
    if (one.ok) saved.push(f.slug);
    else { rejected.push(f.slug); logFail('field "' + f.slug + '"', one); }
  }
  return { saved, rejected };
}

// Create or update the contact, then tag it. Returns a result object; never throws.
async function saveToSysteme(lead, fields, tagIds, apiKey) {
  const result = { saved: false, contactId: null, mode: null,
                   fieldsSaved: [], fieldsRejected: [], tagsApplied: [], tagsFailed: [] };

  // 1. Try to create the contact with everything at once.
  const create = await systeme('/contacts', apiKey, {
    method: 'POST',
    body: { email: lead.email, locale: 'en', fields },
  });

  if (create.ok && create.json && create.json.id) {
    result.contactId = create.json.id;
    result.mode = 'created';
    result.fieldsSaved = fields.map(f => f.slug);
  } else {
    logFail('create', create);

    // 2. A failed create is either "email already exists" or a genuine
    //    validation error. Rather than guess from the status code, check
    //    whether the contact actually exists.
    const existingId = await findContactByEmail(lead.email, apiKey);

    if (existingId) {
      result.contactId = existingId;
      result.mode = 'updated';
      const p = await patchFields(existingId, fields, apiKey);
      result.fieldsSaved = p.saved;
      result.fieldsRejected = p.rejected;
    } else if (create.status >= 400 && create.status < 500) {
      // 3. Validation error on something other than a duplicate. Create a
      //    bare contact so the lead lands, then add fields individually.
      const bare = await systeme('/contacts', apiKey, {
        method: 'POST',
        body: { email: lead.email, locale: 'en' },
      });
      if (bare.ok && bare.json && bare.json.id) {
        result.contactId = bare.json.id;
        result.mode = 'created_minimal';
        const p = await patchFields(bare.json.id, fields, apiKey);
        result.fieldsSaved = p.saved;
        result.fieldsRejected = p.rejected;
      } else {
        logFail('minimal create', bare);
      }
    }
  }

  if (!result.contactId) return result;
  result.saved = true;

  // 4. Tags.
  for (const tagId of tagIds) {
    const t = await systeme('/contacts/' + result.contactId + '/tags', apiKey, {
      method: 'POST',
      body: { tagId },
    });
    if (t.ok) result.tagsApplied.push(tagId);
    else { result.tagsFailed.push(tagId); logFail('tag ' + tagId, t); }
  }

  return result;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Optional owner alert via Resend. Returns { sent, skipped }.
async function notifyOwner(lead, crm) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL;
  if (!key) return { sent: false, skipped: true };

  const rows = [
    ['Name',              lead.firstName],
    ['Email',             lead.email],
    ['Phone',             lead.phone || 'not given'],
    ['Business',          lead.business],
    ['Biggest friction',  label('pain', lead.pain)],
    ['Team size',         label('teamSize', lead.teamSize)],
    ['Urgency',           label('urgency', lead.urgency)],
    ['Best time of day',  label('timeOfDay', lead.timeOfDay)],
    ['Notes',             lead.notes || 'none'],
  ];

  const crmLine = crm.saved
    ? 'Saved to Systeme.io (' + crm.mode + ')'
      + (crm.fieldsRejected.length ? '. Fields rejected: ' + crm.fieldsRejected.join(', ') : '')
      + (crm.tagsFailed.length ? '. Tags failed: ' + crm.tagsFailed.join(', ') : '')
    : crm.attempted
      ? 'NOT saved to Systeme.io. Add this contact manually.'
      : 'Systeme.io not configured.';

  const urgent = lead.urgency === 'asap';
  const subject = (urgent ? '[ASAP] ' : '') + 'New inquiry: '
    + (lead.firstName || lead.email) + (lead.business ? ', ' + lead.business : '');

  const text = rows.map(([k, v]) => k + ': ' + v).join('\n')
    + '\n\n' + crmLine + '\n\nReply to this email to respond to ' + (lead.firstName || 'them') + ' directly.';

  const html = '<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">'
    + rows.map(([k, v]) =>
        '<tr><td style="padding:6px 14px 6px 0;color:#4a4a4b;vertical-align:top"><b>'
        + escapeHtml(k) + '</b></td><td style="padding:6px 0;white-space:pre-wrap">'
        + escapeHtml(v) + '</td></tr>').join('')
    + '</table><p style="font-family:sans-serif;font-size:13px;color:'
    + (crm.saved ? '#4a4a4b' : '#d14343') + '">' + escapeHtml(crmLine) + '</p>'
    + '<p style="font-family:sans-serif;font-size:13px;color:#9d9d9d">Reply to this email to respond directly.</p>';

  const r = await call('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || DEFAULT_NOTIFY_FROM,
      to: [to],
      reply_to: lead.email,
      subject,
      text,
      html,
    }),
  });

  if (!r.ok) console.error('[book-a-call] notify email failed', r.status, (r.text || '').slice(0, 500));
  return { sent: r.ok, skipped: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const lead = {
    email:     String(body.email     || '').trim(),
    firstName: String(body.firstName || '').trim(),
    phone:     String(body.phone     || '').trim(),
    business:  String(body.business  || '').trim(),
    pain:      String(body.pain      || '').trim(),
    teamSize:  String(body.teamSize  || '').trim(),
    urgency:   String(body.urgency   || '').trim(),
    timeOfDay: String(body.timeOfDay || '').trim(),
    notes:     String(body.notes     || '').trim(),
    source:    String(body.source    || 'book-a-call').trim(),
  };

  if (!lead.email || !/^\S+@\S+\.\S+$/.test(lead.email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  // Full record in the logs, so even a total failure is recoverable by hand.
  console.log('[book-a-call] new submission', lead);

  // ── Systeme.io ────────────────────────────────────────────────────────
  const apiKey = process.env.SYSTEME_API_KEY;
  let crm = { attempted: false, saved: false, fieldsRejected: [], tagsFailed: [] };

  if (apiKey) {
    const fields = [
      [process.env.SYSTEME_FIELD_FIRSTNAME || 'first_name',   lead.firstName],
      [process.env.SYSTEME_FIELD_PHONE     || 'phone_number', lead.phone],
      [process.env.SYSTEME_FIELD_BUSINESS,   lead.business],
      [process.env.SYSTEME_FIELD_URGENCY,    label('urgency',   lead.urgency)],
      [process.env.SYSTEME_FIELD_PAIN,       label('pain',      lead.pain)],
      [process.env.SYSTEME_FIELD_TEAMSIZE,   label('teamSize',  lead.teamSize)],
      [process.env.SYSTEME_FIELD_TIMEOFDAY,  label('timeOfDay', lead.timeOfDay)],
      [process.env.SYSTEME_FIELD_NOTES,      lead.notes],
    ]
      .filter(([slug, value]) => slug && value)
      .map(([slug, value]) => ({ slug, value: String(value) }));

    const painTags = {
      chaos:      process.env.SYSTEME_TAG_PAIN_CHAOS,
      plateau:    process.env.SYSTEME_TAG_PAIN_PLATEAU,
      dependence: process.env.SYSTEME_TAG_PAIN_DEPENDENCE,
      time:       process.env.SYSTEME_TAG_PAIN_TIME,
      other:      process.env.SYSTEME_TAG_PAIN_OTHER,
    };
    const urgencyTags = {
      asap:      process.env.SYSTEME_TAG_URGENCY_ASAP,
      '90d':     process.env.SYSTEME_TAG_URGENCY_90D,
      exploring: process.env.SYSTEME_TAG_URGENCY_EXPLORING,
    };
    const tagIds = [
      process.env.SYSTEME_TAG_INQUIRY,
      painTags[lead.pain],
      urgencyTags[lead.urgency],
    ].filter(Boolean).map(s => parseInt(s, 10)).filter(n => !isNaN(n));

    crm = { attempted: true, ...(await saveToSysteme(lead, fields, tagIds, apiKey)) };
  }

  // ── Owner email ───────────────────────────────────────────────────────
  const mail = await notifyOwner(lead, crm);

  const summary = {
    systeme: crm.attempted
      ? { saved: crm.saved, mode: crm.mode, contactId: crm.contactId,
          fieldsSaved: crm.fieldsSaved, fieldsRejected: crm.fieldsRejected,
          tagsApplied: crm.tagsApplied, tagsFailed: crm.tagsFailed }
      : 'not_configured',
    email: mail.skipped ? 'not_configured' : (mail.sent ? 'sent' : 'failed'),
  };
  console.log('[book-a-call] result', JSON.stringify(summary));

  // Nothing configured at all: setup mode, lead is in the logs.
  if (!crm.attempted && mail.skipped) {
    return res.status(200).json({ ok: true, delivered: 'log_only' });
  }

  // At least one destination holds the lead.
  if (crm.saved || mail.sent) {
    return res.status(200).json({ ok: true, ...summary });
  }

  // Every configured destination failed. Tell the visitor so they retry,
  // instead of showing a success screen for a lead nobody received.
  return res.status(502).json({ ok: false, error: 'not_saved', ...summary });
}
