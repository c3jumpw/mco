# apply1234: notes for whoever works on this next

## Keep the help current (every release)
People learn the app from three things, and they must match what's live:

1. **Getting-started tour** – `src/admin/tour/slides.ts`. One slide per screen or feature. If a screen
   or feature changes, change its slide (and add one for anything new). Bump `TOUR_UPDATED`.
2. **What's new** – `src/admin/tour/whatsnew.ts`. Add an entry with the next `version` for every change
   people can see. Admins see new entries once, after the update.
3. **Full guide** – `scripts/guide/template.html` (built into `src/admin/guide/guide.html`), also
   published as the shared "apply1234 Guide" artifact (slug `43800eb8-8ad7-4bf9-8f23-765b231b570a`):
   republish it after changing the guide.

Pictures for all three come from one command:

    scripts/guide/update.sh

It builds the app, serves it, takes every screenshot with made-up data and a neutral admin
(`alex@yourcompany.com`), runs the tour checks, converts the pictures and rebuilds the guide.
Never put a real person's email or real candidate data in screenshots: the pictures ship in the app.

## Shipping
- Database changes: `supabase/migrations/NNN_*.sql`, tested locally first, applied with one approval.
- Code goes to `main` of c3jumpw/mco (Vercel project mco-apply1234, root `apply-1234`). Other projects
  push to `main` too, so fetch and rebase before pushing.
- The email function is `supabase/functions/hiring-notify` (deploy it when it changes).
