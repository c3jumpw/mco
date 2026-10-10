# The Brand Craftsman: Static Site

Deployed via Vercel from https://github.com/c3jumpw/mco (project root
is `bcm-site/`). Live at: https://bcm.mambaykanu.com

## Structure

```
.
├── index.html          # Homepage
├── styles.css          # Shared styles
├── book-a-call.html    # Multi-step intake form
├── book-a-call.css     # Form-only styles
├── book-a-call.js      # Form logic
├── api/
│   └── submit.js       # Serverless function: Systeme.io + owner email
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

On submit it `POST`s JSON to `/api/submit`, which saves the lead to two
independent places, both server-side so no keys ship to the browser:

1. **Systeme.io**: creates the contact (or updates it if the email already
   exists), fills the custom fields, and applies tags.
2. **Your inbox** (optional): a notification email via Resend with every
   answer, reply-to set to the inquirer.

The visitor sees the success screen if **either** destination saved the
lead. If every configured destination fails, the function returns `502`
and the form shows "that didn't go through, try again", so a lead is never
shown a success screen that nobody received.

## Wiring up Systeme.io

In Vercel → Project `mco-bcm-site` → **Settings → Environment Variables**,
add the following for `Production` (and `Preview` if you want staging to
tag too):

| Variable                        | What to put                                                 | Required |
|---------------------------------|-------------------------------------------------------------|----------|
| `SYSTEME_API_KEY`               | Your Systeme.io API key (Settings → Public API keys)        | **Yes**  |
| `SYSTEME_FIELD_BUSINESS`        | Custom field slug (currently `business`)                    | optional |
| `SYSTEME_FIELD_PAIN`            | Custom field slug (currently `pain`)                        | optional |
| `SYSTEME_FIELD_URGENCY`         | Custom field slug (currently `urgency`)                     | optional |
| `SYSTEME_FIELD_TEAMSIZE`        | Custom field slug (currently `teamsize`)                    | optional |
| `SYSTEME_FIELD_TIMEOFDAY`       | Custom field slug (currently `timeofday`)                   | optional |
| `SYSTEME_FIELD_NOTES`           | Custom field slug for the free-text notes                   | optional |
| `SYSTEME_TAG_INQUIRY`           | Tag ID applied to every submission (currently `2205390`)    | optional |
| `SYSTEME_TAG_URGENCY_ASAP`      | Tag ID for "ASAP, next 30 days"                             | optional |
| `SYSTEME_TAG_URGENCY_90D`       | Tag ID for "Within 90 days"                                 | optional |
| `SYSTEME_TAG_URGENCY_EXPLORING` | Tag ID for "Just exploring"                                 | optional |
| `SYSTEME_TAG_PAIN_CHAOS`        | Tag ID for "Systems chaos"                                  | optional |
| `SYSTEME_TAG_PAIN_PLATEAU`      | Tag ID for "Growth plateau"                                 | optional |
| `SYSTEME_TAG_PAIN_DEPENDENCE`   | Tag ID for "Team depends on me"                             | optional |
| `SYSTEME_TAG_PAIN_TIME`         | Tag ID for "No time to grow"                                | optional |
| `SYSTEME_TAG_PAIN_OTHER`        | Tag ID for "Something else"                                 | optional |

Each tag ID is the numeric ID shown on the tag's edit screen in
Systeme.io. Any missing tag var is just skipped, the submission still
succeeds. If `SYSTEME_API_KEY` isn't set at all, submissions are still
accepted and logged in Vercel (**Project → Logs**) so nothing is lost
while you set things up.

Existing contacts are matched by **exact** email address before any
update, so a repeat inquiry updates that person's record and never anyone
else's. If Systeme.io rejects one field value (an oddly formatted phone
number, say), the contact is still created and the other fields still
save; the rejected field is named in the logs and in the owner email.

### Confirmation email to the inquirer

Set this up inside Systeme.io, not here: **Automations → Rules → Create**,
trigger **Tag added: new inquiry**, action **Send email**. Create the rule
*before* the next inquiry arrives, because it only fires on tags added
after the rule exists.

## Owner notification email (optional)

| Variable         | What to put                                                        |
|------------------|--------------------------------------------------------------------|
| `RESEND_API_KEY` | API key from resend.com                                            |
| `NOTIFY_EMAIL`   | The inbox inquiry alerts go to                                     |
| `NOTIFY_FROM`    | Sender. Defaults to `BCM Website <onboarding@resend.dev>`          |

The default sender only delivers to the address you signed up to Resend
with, which is fine for alerts to yourself. To send from your own domain,
verify `mambaykanu.com` in Resend and set `NOTIFY_FROM`, e.g.
`BCM Website <inquiries@mambaykanu.com>`.

Inquiries marked "ASAP" get an `[ASAP]` prefix in the subject line. The
email also says whether the lead made it into Systeme.io, so if the CRM
step ever fails you'll know to add the contact by hand.

## Troubleshooting

Every submission writes two lines to Vercel **Project → Logs**:
`[book-a-call] new submission` with the full answers, then
`[book-a-call] result` showing what was saved where. Any Systeme.io or
Resend rejection is logged with the status code and the service's own
error message.

After changing env vars in Vercel, hit **Deployments → Redeploy** on the
latest production deploy so the function picks up the new values.

## Local development notes

Everything is static HTML + CSS + JS plus one serverless function; no
build step. Open `index.html` directly in a browser to preview most of
the site (the form submit will 404 locally, it only works on Vercel).
To test the function locally, install the Vercel CLI and run `vercel dev`.

## Custom domain

Vercel → Project → **Settings → Domains** → add `bcm.mambaykanu.com` (or
whatever) and update the CNAME at your DNS provider to
`cname.vercel-dns.com`. HTTPS is provisioned automatically.
