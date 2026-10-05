# MK Holding Co (mkc-site)

Static marketing site deployed on Vercel from the `mkc-site/` directory of `c3jumpw/mco`.
Pushing to `main` redeploys automatically.

```
mkc-site/
├── index.html          # The page
├── 404.html            # Not-found page
├── styles.css          # All styling
├── main.js             # Nav toggle + contact form
├── vercel.json         # Security headers + media caching
├── robots.txt
├── sitemap.xml
├── api/
│   └── contact.js      # Serverless function: receives the form, sends email
└── media/              # Images
```

## Contact form

The form posts JSON to `/api/contact`, which validates the submission and relays it
by email through [Resend](https://resend.com). Replies go straight to the sender,
because the function sets `reply_to` to whatever address they entered.

Protections in place: a hidden honeypot field, server-side length and format
validation, and a short-window rate limit per IP.

### Status

`RESEND_API_KEY` is **not yet set**, so the endpoint returns 503 and the page tells
visitors to email `contact@mkholdingco.com` directly. The form will not deliver
anything until the steps below are done.

### Environment variables

Set these in Vercel under **Settings → Environment Variables**:

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Yes | none | From the Resend dashboard. |
| `CONTACT_TO` | No | `contact@mkholdingco.com` | Already set on the project. |
| `CONTACT_FROM` | No | `MK Holding Co <onboarding@resend.dev>` | Must be on a Resend-verified domain. |

### Turning it on

1. Create a free account at [resend.com](https://resend.com), which covers 3,000 emails a month.
2. Go to **Domains → Add Domain** and enter `mkholdingco.com`. Resend gives you DKIM
   and SPF records. Add them at your DNS provider and wait for verification.
3. Go to **API Keys → Create API Key** and copy it.
4. In Vercel, add `RESEND_API_KEY` with that value, and set `CONTACT_FROM` to
   `MK Holding Co <contact@mkholdingco.com>`.
5. Redeploy so the function picks up the new variables.

To test before the domain is verified, leave `CONTACT_FROM` unset and point
`CONTACT_TO` at the address you signed up to Resend with. The shared testing
sender only delivers to that one address.

### Using a different provider

`api/contact.js` makes a single `fetch` call to Resend near the bottom. Point that
at Postmark, SendGrid, or Mailgun and the rest of the function is unchanged.

## Media

Images are served as WebP with a PNG or JPEG fallback through `<picture>`.

| File | Used for |
| --- | --- |
| `home-image.webp` / `.jpg` | Hero image |
| `mkc-logo.webp`, `mkc-logo-1.png` | Header logo, dark, for light backgrounds |
| `mkc-logo-white.webp`, `Untitled-design-e1774482509240.png` | Footer logo, white, for dark backgrounds |
| `pillar-1.svg` to `pillar-3.svg` | Standards icons |

The remaining files are WordPress-generated size variants, kept in case they are useful.
They are not referenced by the page.

**Note on the hero:** the source image is only 709x399 pixels, so it is being
upscaled on wide screens and will look soft on high-density displays. If a larger
original exists, drop it in and regenerate the WebP and JPEG.

## Local preview

```bash
cd mkc-site
python3 -m http.server 8000
```

The static page works this way, but `/api/contact` needs the Vercel runtime:

```bash
npx vercel dev
```

## Domain

See the DNS section in the project notes. In short: add `mkholdingco.com` under
**Vercel → Settings → Domains**, then point your DNS at Vercel. Note that Vercel
Authentication is currently enabled, which puts a login wall on `*.vercel.app`
URLs but never on a custom domain.
