# MK Holding Co — mkc-site

Static marketing site deployed on Vercel from the `mkc-site/` directory of `c3jumpw/mco`.

```
mkc-site/
├── index.html          # The page
├── styles.css          # All styling
├── main.js             # Nav toggle + contact form
├── api/
│   └── contact.js      # Serverless function: receives the form, sends email
└── media/              # Images
```

Pushing to `main` redeploys automatically.

## Contact form

The form posts JSON to `/api/contact`, which validates the submission and relays it
by email through [Resend](https://resend.com). Replies go straight to the sender
because the function sets `reply_to` to whatever address they entered.

Protections in place: a hidden honeypot field, server-side length and format
validation, and a short-window rate limit per IP.

### Environment variables

Set these in Vercel under **Settings → Environment Variables**:

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Yes | — | From the Resend dashboard. Without it the form returns 503 and the page tells visitors to email directly. |
| `CONTACT_TO` | No | `contact@mkholdingco.com` | Where submissions land. |
| `CONTACT_FROM` | No | `MK Holding Co <onboarding@resend.dev>` | Must be on a Resend-verified domain. |

### Turning it on

1. Create a free account at [resend.com](https://resend.com) (3,000 emails/month).
2. **Domains → Add Domain → `mkholdingco.com`.** Resend gives you DKIM and SPF
   records; add them at your DNS provider and wait for verification.
3. **API Keys → Create API Key.** Copy it.
4. In Vercel, add `RESEND_API_KEY` with that value, and set
   `CONTACT_FROM` to `MK Holding Co <contact@mkholdingco.com>`.
5. Redeploy so the function picks up the new variables.

Until the domain is verified you can still test: leave `CONTACT_FROM` unset and
set `CONTACT_TO` to the email you signed up to Resend with. Resend's shared
testing sender only delivers to that address.

### Swapping in a different provider

`api/contact.js` makes one `fetch` call to Resend near the bottom. Point that at
Postmark, SendGrid, or Mailgun and the rest of the function is unchanged.

## Media

| File | Used for |
| --- | --- |
| `mkc-logo-1.png` | Header logo (dark, for light backgrounds) |
| `Untitled-design-e1774482509240.png` | Footer logo (white, for dark backgrounds) |
| `home-image.png` | Hero image |
| `pillar-1.svg` … `pillar-3.svg` | Standards icons |

The other files are WordPress-generated size variants, kept in case they're useful.

## Local preview

```bash
cd mkc-site
python3 -m http.server 8000
```

The static page works, but `/api/contact` needs the Vercel runtime. For the
full thing including the function:

```bash
npx vercel dev
```

## Custom domain

Add `mkholdingco.com` in **Vercel → Settings → Domains** and follow the DNS
instructions. Note that the project currently has Vercel Authentication enabled,
which puts a login wall on `*.vercel.app` URLs but not on custom domains — turn
it off under **Settings → Deployment Protection** if you want the preview URLs
public too.
