/**
 * POST /api/subscribe
 *
 * Adds an address to The Anvil list.
 *
 * Environment variables:
 *   RESEND_API_KEY     (required) API key from https://resend.com
 *   RESEND_AUDIENCE_ID (optional) A Resend audience. When set, the address is
 *                                 added to it directly. When absent, the signup
 *                                 is emailed to CONTACT_TO instead, so nothing
 *                                 is silently dropped while the list is set up.
 *   CONTACT_TO         (optional) Fallback recipient. Defaults to contact@mambaykanu.com.
 */

const API_KEY = process.env.RESEND_API_KEY;
const AUDIENCE = process.env.RESEND_AUDIENCE_ID;
const TO = process.env.CONTACT_TO || 'contact@mambaykanu.com';
const FROM = process.env.CONTACT_FROM || 'Mambay Kanu <onboarding@resend.dev>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Best-effort burst control per warm instance.
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
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (err) { return null; }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const forwarded = req.headers['x-forwarded-for'] || '';
  const ip = String(forwarded).split(',')[0].trim() || 'unknown';
  if (overRate(ip)) {
    return res.status(429).json({ error: 'Too many attempts in a short window.' });
  }

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: 'Could not read that submission.' });

  // Honeypot: a real person never sees this field.
  if (typeof body.website === 'string' && body.website.trim()) {
    return res.status(200).json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '';
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ field: 'email', error: 'Enter a valid email address.' });
  }

  if (!API_KEY) {
    console.error('RESEND_API_KEY is not set; subscribe endpoint cannot run.');
    return res.status(503).json({ error: 'Signups are not switched on yet.' });
  }

  try {
    if (AUDIENCE) {
      const r = await fetch(`https://api.resend.com/audiences/${AUDIENCE}/contacts`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, unsubscribed: false })
      });
      // Resend returns 422 when the contact already exists. That is a success
      // from the subscriber's point of view, so do not surface it as an error.
      if (!r.ok && r.status !== 422) {
        const detail = await r.text();
        console.error('Resend audience rejected the contact:', r.status, detail);
        return res.status(502).json({ error: 'The signup could not be saved.' });
      }
      return res.status(200).json({ ok: true });
    }

    // No audience configured, so relay it by email rather than losing it.
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: '[The Anvil] New signup: ' + email,
        text: 'New Anvil signup: ' + email + '\n\nNo RESEND_AUDIENCE_ID is set, so this arrived by email instead of joining a list.',
        html: '<p>New Anvil signup: <strong>' + esc(email) + '</strong></p>'
             + '<p style="color:#8a8e95;font-size:12px">No RESEND_AUDIENCE_ID is set, so this arrived by email instead of joining a list.</p>'
      })
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend rejected the signup notification:', r.status, detail);
      return res.status(502).json({ error: 'The signup could not be saved.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Subscribe failed:', err);
    return res.status(502).json({ error: 'The signup could not be saved.' });
  }
};
