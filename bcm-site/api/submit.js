// Vercel serverless function: /api/submit
// Receives the book-a-call form, pushes the contact into Systeme.io, tags it.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   SYSTEME_API_KEY         Your Systeme.io API key (keep this server-side only)
//
// Optional env vars (map form answers → Systeme.io tag IDs):
//   SYSTEME_TAG_INQUIRY     Tag applied to every submission (e.g. "new-inquiry")
//   SYSTEME_TAG_URGENCY_ASAP
//   SYSTEME_TAG_URGENCY_90D
//   SYSTEME_TAG_URGENCY_EXPLORING
//   SYSTEME_TAG_PAIN_CHAOS
//   SYSTEME_TAG_PAIN_PLATEAU
//   SYSTEME_TAG_PAIN_DEPENDENCE
//   SYSTEME_TAG_PAIN_TIME
//   SYSTEME_TAG_PAIN_OTHER
//
// Each tag ID should be the numeric Systeme.io tag ID (visible on the tag's edit screen).
// Any missing tag var is just skipped — the submission still succeeds.

const SYSTEME_BASE = 'https://api.systeme.io/api';

export default async function handler(req, res) {
  // Only POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Minimum: email
  const email = String(body.email || '').trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const firstName = String(body.firstName || '').trim();
  const phone     = String(body.phone     || '').trim();
  const business  = String(body.business  || '').trim();
  const pain      = String(body.pain      || '').trim();
  const teamSize  = String(body.teamSize  || '').trim();
  const urgency   = String(body.urgency   || '').trim();
  const timeOfDay = String(body.timeOfDay || '').trim();
  const notes     = String(body.notes     || '').trim();
  const source    = String(body.source    || 'book-a-call').trim();

  // Always log server-side so nothing is lost even if Systeme.io is misconfigured
  console.log('[book-a-call] new submission', {
    email, firstName, business, pain, teamSize, urgency, timeOfDay, source
  });

  const apiKey = process.env.SYSTEME_API_KEY;
  if (!apiKey) {
    // No key set: don't fail the user — log and move on. Owner can wire it up later.
    console.warn('[book-a-call] SYSTEME_API_KEY not set; submission logged only.');
    return res.status(200).json({ ok: true, delivered: 'log_only' });
  }

  try {
    // 1. Create (or upsert) the contact
    //    Systeme.io: POST /api/contacts  — body: { email, locale, fields: [{slug, value}] }
    //    If the email exists, API returns 422; we fetch the existing contact id as fallback.
    const fields = [
      firstName && { slug: 'first_name',   value: firstName },
      phone     && { slug: 'phone_number', value: phone     },
      business  && { slug: 'company_name', value: business  },
    ].filter(Boolean);

    const createResp = await fetch(SYSTEME_BASE + '/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ email, locale: 'en', fields }),
    });

    let contactId;
    if (createResp.ok) {
      const created = await createResp.json();
      contactId = created.id;
    } else if (createResp.status === 422) {
      // Already exists — look it up
      const lookupResp = await fetch(
        SYSTEME_BASE + '/contacts?email=' + encodeURIComponent(email),
        { headers: { 'X-API-Key': apiKey } }
      );
      if (lookupResp.ok) {
        const lookup = await lookupResp.json();
        const item = (lookup.items && lookup.items[0]) || null;
        contactId = item && item.id;
      }
    } else {
      const txt = await createResp.text();
      console.error('[book-a-call] systeme create failed', createResp.status, txt);
    }

    if (!contactId) {
      // Still report success to the user; the submission is in the logs.
      return res.status(200).json({ ok: true, delivered: 'logged_create_failed' });
    }

    // 2. Apply tags
    const painTagMap = {
      chaos:      process.env.SYSTEME_TAG_PAIN_CHAOS,
      plateau:    process.env.SYSTEME_TAG_PAIN_PLATEAU,
      dependence: process.env.SYSTEME_TAG_PAIN_DEPENDENCE,
      time:       process.env.SYSTEME_TAG_PAIN_TIME,
      other:      process.env.SYSTEME_TAG_PAIN_OTHER,
    };
    const urgencyTagMap = {
      asap:      process.env.SYSTEME_TAG_URGENCY_ASAP,
      '90d':     process.env.SYSTEME_TAG_URGENCY_90D,
      exploring: process.env.SYSTEME_TAG_URGENCY_EXPLORING,
    };

    const tagIds = [
      process.env.SYSTEME_TAG_INQUIRY,
      painTagMap[pain],
      urgencyTagMap[urgency],
    ].filter(Boolean).map(s => parseInt(s, 10)).filter(n => !isNaN(n));

    const tagResults = await Promise.allSettled(
      tagIds.map(tagId =>
        fetch(SYSTEME_BASE + '/contacts/' + contactId + '/tags', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({ tagId }),
        })
      )
    );
    tagResults.forEach((r, i) => {
      if (r.status === 'rejected' || (r.value && !r.value.ok)) {
        console.warn('[book-a-call] tag apply failed for id', tagIds[i]);
      }
    });

    // 3. Also push the vetting answers as a note on the contact so they survive
    //    even if custom fields aren't configured in the account.
    const noteBody = [
      '--- Book-a-call submission ---',
      'Business: ' + business,
      'Team size: ' + teamSize,
      'Biggest friction: ' + pain,
      'Urgency: ' + urgency,
      'Preferred time of day: ' + timeOfDay,
      notes ? '\nNotes:\n' + notes : '',
      '\nSource: ' + source,
    ].filter(Boolean).join('\n');

    try {
      await fetch(SYSTEME_BASE + '/contacts/' + contactId + '/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ content: noteBody }),
      });
    } catch (noteErr) {
      // Notes endpoint may not be enabled on every plan — not fatal.
      console.warn('[book-a-call] note failed (non-fatal)', noteErr && noteErr.message);
    }

    return res.status(200).json({ ok: true, contactId });
  } catch (err) {
    console.error('[book-a-call] handler error', err && err.stack || err);
    // Still return 200 so the user sees the success screen — their info IS in the logs.
    return res.status(200).json({ ok: true, delivered: 'logged_error' });
  }
}
