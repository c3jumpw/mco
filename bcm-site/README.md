# The Brand Craftsman — Static Site

Deployed via Vercel from https://github.com/c3jumpw/mco (project root
is `bcm-site/`). Live at: https://mco-bcm-site.vercel.app

## Structure

```
.
├── index.html          # Homepage
├── styles.css          # Shared styles
├── book-a-call.html    # Multi-step intake form
├── book-a-call.css     # Form-only styles
├── book-a-call.js      # Form logic
├── api/
│   └── submit.js       # Vercel serverless function → Systeme.io
├── media/              # All site images (WordPress export)
└── README.md
```

## Book-a-call form

The form at `/book-a-call.html` collects:

1. First name
2. Business + what you do
3. Biggest friction (chaos / plateau / dependence / time / other)
4. Team size (solo / 2-5 / 6-15 / 16-50 / 50+)
5. Urgency (asap / 90d / exploring) + preferred time of day
6. Email + phone + optional notes

On submit it `POST`s JSON to `/api/submit`, which calls the Systeme.io API
server-side (so the API key never ships to the browser).

## Wiring up Systeme.io

In Vercel → Project `mco-bcm-site` → **Settings → Environment Variables**,
add the following for `Production` (and `Preview` if you want staging to
tag too):

| Variable                        | What to put                                                 | Required |
|---------------------------------|-------------------------------------------------------------|----------|
| `SYSTEME_API_KEY`               | Your Systeme.io API key (Settings → Public API keys)        | **Yes**  |
| `SYSTEME_TAG_INQUIRY`           | Tag ID applied to every submission (e.g. `new-inquiry`)     | optional |
| `SYSTEME_TAG_URGENCY_ASAP`      | Tag ID for "ASAP, next 30 days"                             | optional |
| `SYSTEME_TAG_URGENCY_90D`       | Tag ID for "Within 90 days"                                 | optional |
| `SYSTEME_TAG_URGENCY_EXPLORING` | Tag ID for "Just exploring"                                 | optional |
| `SYSTEME_TAG_PAIN_CHAOS`        | Tag ID for "Systems chaos"                                  | optional |
| `SYSTEME_TAG_PAIN_PLATEAU`      | Tag ID for "Growth plateau"                                 | optional |
| `SYSTEME_TAG_PAIN_DEPENDENCE`   | Tag ID for "Team depends on me"                             | optional |
| `SYSTEME_TAG_PAIN_TIME`         | Tag ID for "No time to grow"                                | optional |
| `SYSTEME_TAG_PAIN_OTHER`        | Tag ID for "Something else"                                 | optional |

Each tag ID is the numeric ID shown on the tag's edit screen in
Systeme.io. Any missing tag var is just skipped — the submission still
succeeds. If `SYSTEME_API_KEY` isn't set at all, submissions are still
accepted and logged in Vercel (**Project → Logs**) so nothing is lost
while you set things up.

The function also writes the full vetting answers as a **Note** on the
contact in Systeme.io, so you can see team size / urgency / preferred
time of day at a glance when the contact opens.

After changing env vars in Vercel, hit **Deployments → Redeploy** on the
latest production deploy so the function picks up the new values.

## Local development notes

Everything is static HTML + CSS + JS plus one serverless function; no
build step. Open `index.html` directly in a browser to preview most of
the site (the form submit will 404 locally — it only works on Vercel).
To test the function locally, install the Vercel CLI and run `vercel dev`.

## Custom domain

Vercel → Project → **Settings → Domains** → add `bcm.mambaykanu.com` (or
whatever) and update the CNAME at your DNS provider to
`cname.vercel-dns.com`. HTTPS is provisioned automatically.
