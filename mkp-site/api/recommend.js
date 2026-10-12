/**
 * POST /api/recommend
 *
 * Takes a book recommendation for the library. Sends two emails: the
 * recommendation to CONTACT_TO, and a thank-you back to whoever sent it,
 * inviting them into The Anvil.
 *
 * Environment variables:
 *   RESEND_API_KEY (required) API key from https://resend.com
 *   CONTACT_TO     (optional) Where recommendations land. Defaults to contact@mambaykanu.com.
 *   CONTACT_FROM   (optional) Sender. Must be on a Resend-verified domain.
 */

const API_KEY = process.env.RESEND_API_KEY;
const TO = process.env.CONTACT_TO || 'contact@mambaykanu.com';
const FROM = process.env.CONTACT_FROM || 'Mambay Kanu <onboarding@resend.dev>';
const SITE = 'https://mambaykanu.com';

const LIMITS = { title: 160, author: 120, name: 100, email: 200, note: 1200 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (err) { return null; }
  }
  return req.body;
}

function send(payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const forwarded = req.headers['x-forwarded-for'] || '';
  const ip = String(forwarded).split(',')[0].trim() || 'unknown';
  if (overRate(ip)) {
    return res.status(429).json({ error: 'Too many recommendations in a short window.' });
  }

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: 'Could not read that submission.' });

  // Honeypot
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });

  const title = clean(body.title, LIMITS.title);
  const author = clean(body.author, LIMITS.author);
  const name = clean(body.name, LIMITS.name);
  const email = clean(body.email, LIMITS.email);
  const note = clean(body.note, LIMITS.note);

  if (!title) {
    return res.status(400).json({ field: 'title', error: 'Which book do you mean?' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ field: 'email', error: 'Enter a valid email address.' });
  }

  if (!API_KEY) {
    console.error('RESEND_API_KEY is not set; recommendations cannot be relayed.');
    return res.status(503).json({ error: 'Recommendations are not switched on yet.' });
  }

  const who = name || email;

  const inbound = {
    from: FROM,
    to: [TO],
    reply_to: email,
    subject: '[Library] ' + title + (author ? ' by ' + author : ''),
    text: [
      'Book recommendation for the library',
      '',
      'Title: ' + title,
      'Author: ' + (author || 'Not given'),
      'From: ' + who,
      'Email: ' + email,
      '',
      note || '(no note)'
    ].join('\n'),
    html: '<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16191a;line-height:1.6">'
        + '<h2 style="font-size:17px;margin:0 0 16px">Book recommendation for the library</h2>'
        + '<table style="border-collapse:collapse;margin-bottom:18px">'
        + '<tr><td style="padding:4px 16px 4px 0;color:#6b6f76;font-size:13px">Title</td><td style="padding:4px 0;font-size:14px"><strong>' + esc(title) + '</strong></td></tr>'
        + '<tr><td style="padding:4px 16px 4px 0;color:#6b6f76;font-size:13px">Author</td><td style="padding:4px 0;font-size:14px">' + esc(author || 'Not given') + '</td></tr>'
        + '<tr><td style="padding:4px 16px 4px 0;color:#6b6f76;font-size:13px">From</td><td style="padding:4px 0;font-size:14px">' + esc(who) + '</td></tr>'
        + '<tr><td style="padding:4px 16px 4px 0;color:#6b6f76;font-size:13px">Email</td><td style="padding:4px 0;font-size:14px">' + esc(email) + '</td></tr>'
        + '</table>'
        + (note ? '<div style="border-left:3px solid #c2342b;padding:4px 0 4px 14px;white-space:pre-wrap;font-size:14px">' + esc(note) + '</div>' : '')
        + '</div>'
  };

  const greeting = name ? 'Hi ' + esc(name) + ',' : 'Hi,';
  const reply = {
    from: FROM,
    to: [email],
    reply_to: TO,
    subject: 'Thanks for the recommendation',
    text: [
      (name ? 'Hi ' + name + ',' : 'Hi,'),
      '',
      'Thank you for sending over ' + title + (author ? ' by ' + author : '') + '. It has gone on the list, and if it earns its place it will end up on the shelf at ' + SITE + '/library.',
      '',
      'If you enjoy trading ideas like this, The Anvil is where I share the rest: transformation stories from real businesses, the templates and systems coming out of client work, and the occasional thing I got wrong and had to rebuild. You would be welcome in it.',
      '',
      'Join here: ' + SITE + '/#anvil',
      '',
      'Mambay'
    ].join('\n'),
    html: '<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16191a;line-height:1.65;max-width:560px">'
        + '<p>' + greeting + '</p>'
        + '<p>Thank you for sending over <strong>' + esc(title) + '</strong>' + (author ? ' by ' + esc(author) : '') + '. '
        + 'It has gone on the list, and if it earns its place it will end up on the shelf.</p>'
        + '<p>If you enjoy trading ideas like this, The Anvil is where I share the rest: transformation stories '
        + 'from real businesses, the templates and systems coming out of client work, and the occasional thing '
        + 'I got wrong and had to rebuild. You would be welcome in it.</p>'
        + '<p style="margin:26px 0"><a href="' + SITE + '/#anvil" style="background:#c2342b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:2px;font-weight:500;display:inline-block">Join The Anvil</a></p>'
        + '<p style="color:#51575a">Mambay</p>'
        + '</div>'
  };

  try {
    const r1 = await send(inbound);
    if (!r1.ok) {
      const detail = await r1.text();
      console.error('Resend rejected the recommendation:', r1.status, detail);
      return res.status(502).json({ error: 'The recommendation could not be sent.' });
    }

    // The thank-you is a courtesy. If it fails the recommendation still arrived,
    // so log it and report success rather than asking them to send it twice.
    try {
      const r2 = await send(reply);
      if (!r2.ok) console.error('Thank-you reply failed:', r2.status, await r2.text());
    } catch (err) {
      console.error('Thank-you reply threw:', err);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Recommendation failed:', err);
    return res.status(502).json({ error: 'The recommendation could not be sent.' });
  }
};
