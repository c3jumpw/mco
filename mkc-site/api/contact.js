/**
 * POST /api/contact
 *
 * Receives a contact-form submission and emails it on via Resend.
 *
 * Environment variables:
 *   RESEND_API_KEY  (required)  API key from https://resend.com
 *   CONTACT_TO      (optional)  Recipient. Defaults to contact@mkholdingco.com
 *   CONTACT_FROM    (optional)  Sender. Must be on a Resend-verified domain.
 *                               Defaults to Resend's shared testing sender.
 */

const TO = process.env.CONTACT_TO || 'contact@mkholdingco.com';
const FROM = process.env.CONTACT_FROM || 'MK Holding Co <onboarding@resend.dev>';
const API_KEY = process.env.RESEND_API_KEY;

const LIMITS = { name: 100, email: 200, company: 120, interest: 80, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Best-effort burst control. Serverless instances are short-lived and not
// shared, so this blunts rapid repeats rather than guaranteeing a global cap.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;
const seen = new Map();

function overRate(ip) {
  const now = Date.now();
  const rec = seen.get(ip);

  if (!rec || now - rec.start > WINDOW_MS) {
    if (seen.size > 2000) seen.clear();
    seen.set(ip, { start: now, count: 1 });
    return false;
  }

  rec.count += 1;
  return rec.count > MAX_PER_WINDOW;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch];
  });
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      return null;
    }
  }
  return req.body;
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const forwarded = req.headers['x-forwarded-for'] || '';
  const ip = String(forwarded).split(',')[0].trim() || 'unknown';

  if (overRate(ip)) {
    return res.status(429).json({ error: 'Too many messages in a short window.' });
  }

  const body = readBody(req);
  if (!body) {
    return res.status(400).json({ error: 'Could not read that submission.' });
  }

  // Honeypot: a real person never sees or fills this field.
  if (clean(body.website, 200)) {
    // Answer as though it worked so bots get no signal.
    return res.status(200).json({ ok: true });
  }

  const name = clean(body.name, LIMITS.name);
  const email = clean(body.email, LIMITS.email);
  const company = clean(body.company, LIMITS.company);
  const interest = clean(body.interest, LIMITS.interest);
  const message = clean(body.message, LIMITS.message);

  if (!name) {
    return res.status(400).json({ field: 'name', error: 'Enter your name.' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ field: 'email', error: 'Enter a valid email address.' });
  }
  if (message.length < 10) {
    return res.status(400).json({ field: 'message', error: 'Add a bit more detail so we can route your note.' });
  }

  if (!API_KEY) {
    console.error('RESEND_API_KEY is not set; contact form cannot send.');
    return res.status(503).json({ error: 'Email delivery is not configured.' });
  }

  const rows = [
    ['Name', name],
    ['Email', email],
    ['Company', company || 'Not provided'],
    ['Regarding', interest || 'General enquiry']
  ];

  const html = [
    '<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#191b1e;line-height:1.6">',
    '<h2 style="font-size:17px;margin:0 0 16px">New enquiry from mkholdingco.com</h2>',
    '<table style="border-collapse:collapse;margin-bottom:20px">',
    rows
      .map(function (row) {
        return (
          '<tr>' +
          '<td style="padding:4px 16px 4px 0;color:#6b6f76;font-size:13px;vertical-align:top">' + esc(row[0]) + '</td>' +
          '<td style="padding:4px 0;font-size:14px">' + esc(row[1]) + '</td>' +
          '</tr>'
        );
      })
      .join(''),
    '</table>',
    '<div style="border-left:3px solid #b78628;padding:4px 0 4px 14px;white-space:pre-wrap;font-size:14px">',
    esc(message),
    '</div>',
    '<p style="margin-top:24px;color:#8a8e95;font-size:12px">Reply directly to this email to respond to ' + esc(name) + '.</p>',
    '</div>'
  ].join('');

  const text = [
    'New enquiry from mkholdingco.com',
    '',
    'Name: ' + name,
    'Email: ' + email,
    'Company: ' + (company || 'Not provided'),
    'Regarding: ' + (interest || 'General enquiry'),
    '',
    message
  ].join('\n');

  try {
    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: (interest ? '[' + interest + '] ' : '') +
          'Website enquiry from ' + name + (company ? ' (' + company + ')' : ''),
        html: html,
        text: text
      })
    });

    if (!resend.ok) {
      const detail = await resend.text();
      console.error('Resend rejected the message:', resend.status, detail);
      return res.status(502).json({ error: 'The message could not be delivered.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form failed:', err);
    return res.status(502).json({ error: 'The message could not be delivered.' });
  }
};
