// Vercel serverless function: /api/submit
// Receives the book-a-call form, pushes the contact into Systeme.io,
// fills custom fields, and tags it.
//
// ── Required ────────────────────────────────────────────────────────────
//   SYSTEME_API_KEY          Your Systeme.io API key (server-side only)
//
// ── Custom field slugs (optional) ───────────────────────────────────────
// Set each to the slug of the matching custom field in your Systeme.io
// account. Run /api/fields once to discover your real slugs.
//   SYSTEME_FIELD_URGENCY    e.g. "urgency"
//   SYSTEME_FIELD_PAIN       e.g. "pain_point"
//   SYSTEME_FIELD_BUSINESS   e.g. "business"
//   SYSTEME_FIELD_TEAMSIZE   e.g. "team_size"
//   SYSTEME_FIELD_TIMEOFDAY  e.g. "preferred_time"
//   SYSTEME_FIELD_NOTES      e.g. "inquiry_notes"
//   SYSTEME_FIELD_FIRSTNAME  defaults to "first_name"
//   SYSTEME_FIELD_PHONE      defaults to "phone_number"
//
// ── Tag IDs (optional) ──────────────────────────────────────────────────
//   SYSTEME_TAG_INQUIRY
//   SYSTEME_TAG_URGENCY_ASAP | _90D | _EXPLORING
//   SYSTEME_TAG_PAIN_CHAOS | _PLATEAU | _DEPENDENCE | _TIME | _OTHER
//
// Anything not set is simply skipped, the submission still succeeds.

const SYSTEME_BASE = 'https://api.systeme.io/api';

// Human-readable labels so the CRM shows words, not internal codes.
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

  // Always log so nothing is lost even if Systeme.io is misconfigured
  console.log('[book-a-call] new submission', {
    email, firstName, business, pain, teamSize, urgency, timeOfDay, source
  });

  const apiKey = process.env.SYSTEME_API_KEY;
  if (!apiKey) {
    console.warn('[book-a-call] SYSTEME_API_KEY not set; submission logged only.');
    return res.status(200).json({ ok: true, delivered: 'log_only' });
  }

  try {
    // ── Build the custom field payload ──────────────────────────────────
    // Each entry only included when BOTH a slug env var and a value exist.
    const fieldSpec = [
      [process.env.SYSTEME_FIELD_FIRSTNAME || 'first_name',   firstName],
      [process.env.SYSTEME_FIELD_PHONE     || 'phone_number', phone],
      [process.env.SYSTEME_FIELD_BUSINESS,   business],
      [process.env.SYSTEME_FIELD_URGENCY,    label('urgency',   urgency)],
      [process.env.SYSTEME_FIELD_PAIN,       label('pain',      pain)],
      [process.env.SYSTEME_FIELD_TEAMSIZE,   label('teamSize',  teamSize)],
      [process.env.SYSTEME_FIELD_TIMEOFDAY,  label('timeOfDay', timeOfDay)],
      [process.env.SYSTEME_FIELD_NOTES,      notes],
    ];

    const fields = fieldSpec
      .filter(([slug, value]) => slug && value)
      .map(([slug, value]) => ({ slug, value: String(value) }));

    // ── 1. Create (or find) the contact ─────────────────────────────────
    const createResp = await fetch(SYSTEME_BASE + '/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ email, locale: 'en', fields }),
    });

    let contactId;
    let createdFresh = false;

    if (createResp.ok) {
      const created = await createResp.json();
      contactId = created.id;
      createdFresh = true;
    } else if (createResp.status === 422) {
      // Already exists: look it up, then PATCH the fields on
      const lookupResp = await fetch(
        SYSTEME_BASE + '/contacts?email=' + encodeURIComponent(email),
        { headers: { 'X-API-Key': apiKey } }
      );
      if (lookupResp.ok) {
        const lookup = await lookupResp.json();
        const item = (lookup.items && lookup.items[0]) || null;
        contactId = item && item.id;
      }

      // Update the existing contact's fields with the fresh answers
      if (contactId && fields.length) {
        const patchResp = await fetch(SYSTEME_BASE + '/contacts/' + contactId, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/merge-patch+json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({ fields }),
        });
        if (!patchResp.ok) {
          console.warn('[book-a-call] field update failed',
            patchResp.status, await patchResp.text());
        }
      }
    } else {
      console.error('[book-a-call] systeme create failed',
        createResp.status, await createResp.text());
    }

    if (!contactId) {
      return res.status(200).json({ ok: true, delivered: 'logged_create_failed' });
    }

    // ── 2. Apply tags ───────────────────────────────────────────────────
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

    // ── 3. Belt-and-braces: also write the answers as a note ────────────
    // Harmless duplication, but it means the data survives even if a slug
    // is wrong. Set SYSTEME_SKIP_NOTE=1 once your fields are confirmed.
    if (process.env.SYSTEME_SKIP_NOTE !== '1') {
      const noteBody = [
        '--- Book-a-call submission ---',
        'Business: '              + business,
        'Team size: '             + label('teamSize',  teamSize),
        'Biggest friction: '      + label('pain',      pain),
        'Urgency: '               + label('urgency',   urgency),
        'Preferred time of day: ' + label('timeOfDay', timeOfDay),
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
        console.warn('[book-a-call] note failed (non-fatal)',
          noteErr && noteErr.message);
      }
    }

    return res.status(200).json({
      ok: true,
      contactId,
      createdFresh,
      fieldsSent: fields.map(f => f.slug),
      tagsSent: tagIds,
    });
  } catch (err) {
    console.error('[book-a-call] handler error', (err && err.stack) || err);
    return res.status(200).json({ ok: true, delivered: 'logged_error' });
  }
}
