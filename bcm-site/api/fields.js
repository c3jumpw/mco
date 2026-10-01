// Vercel serverless function: /api/fields
//
// ONE-TIME SETUP HELPER. Visit this in your browser to discover:
//   - your Systeme.io custom field slugs (for urgency, pain, etc.)
//   - your tag IDs
//
// Usage:
//   https://<your-site>/api/fields?key=<SYSTEME_API_KEY>
//
// It's gated behind your own API key so it isn't publicly readable.
// Delete this file once you've captured the values you need.

const SYSTEME_BASE = 'https://api.systeme.io/api';

// Candidate paths for the "list contact custom fields" endpoint.
// Systeme.io documents this capability but the exact route varies by
// API version, so we probe and report whichever responds.
const FIELD_PATHS = [
  '/contact_fields',
  '/contacts/fields',
  '/contact-fields',
  '/fields',
];

async function tryGet(path, apiKey) {
  try {
    const resp = await fetch(SYSTEME_BASE + path, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
    });
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
    return { path, status: resp.status, ok: resp.ok, body: parsed };
  } catch (err) {
    return { path, status: 0, ok: false, error: String(err && err.message) };
  }
}

export default async function handler(req, res) {
  const apiKey = (req.query && req.query.key) || process.env.SYSTEME_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      error: 'no_key',
      hint: 'Set SYSTEME_API_KEY in Vercel, or pass ?key=YOUR_KEY',
    });
  }

  // If an env key exists, require the querystring key to match it so this
  // endpoint can't be enumerated by strangers.
  if (process.env.SYSTEME_API_KEY && req.query && req.query.key
      && req.query.key !== process.env.SYSTEME_API_KEY) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Probe each candidate custom-fields path
  const fieldAttempts = [];
  for (const p of FIELD_PATHS) {
    const result = await tryGet(p, apiKey);
    fieldAttempts.push(result);
    if (result.ok) break; // found it
  }

  const workingFields = fieldAttempts.find(a => a.ok);

  // Tags
  const tags = await tryGet('/tags', apiKey);

  // Build a friendly summary of slugs if we found the fields endpoint
  let slugSummary = null;
  if (workingFields && workingFields.body) {
    const items = workingFields.body.items || workingFields.body.data
                  || (Array.isArray(workingFields.body) ? workingFields.body : null);
    if (Array.isArray(items)) {
      slugSummary = items.map(f => ({
        slug: f.slug || f.id || f.name,
        label: f.name || f.label || f.title,
        type: f.type || f.fieldType,
      }));
    }
  }

  let tagSummary = null;
  if (tags.ok && tags.body) {
    const items = tags.body.items || tags.body.data
                  || (Array.isArray(tags.body) ? tags.body : null);
    if (Array.isArray(items)) {
      tagSummary = items.map(t => ({ id: t.id, name: t.name }));
    }
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify({
    readme: 'Copy the slugs below into Vercel env vars (SYSTEME_FIELD_URGENCY, SYSTEME_FIELD_PAIN, etc.) and the tag IDs into SYSTEME_TAG_* vars. Delete api/fields.js when done.',
    customFields: slugSummary,
    tags: tagSummary,
    _raw: {
      fieldAttempts,
      tags,
    },
  }, null, 2));
}
