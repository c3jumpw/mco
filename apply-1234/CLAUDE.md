# apply1234: notes for whoever works on this next

## Keep the help current (every release)
People learn the app from three things, and they must match what's live:

1. **Getting-started tour** – `src/admin/tour/slides.ts`. One slide per screen or feature. If a screen
   or feature changes, change its slide (and add one for anything new). Bump `TOUR_UPDATED`.
2. **Change log and What's new** – `src/admin/changelog.ts` is the record of every update, shown under
   Help › Change log. Add an entry for every release (date, what changed in plain words, technical
   details and commit ids). Give it the next `version` when people can see the change: those entries
   are What's new, which admins see once after the update. `CHANGELOG.md` is written from it by
   `node scripts/changelog.mjs` (update.sh runs it).
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
- Offer letters run through `supabase/functions/hiring-offer` (JWT check off: it checks the login itself).
  Deploy all five files together. Test with `deno test -A supabase/functions/hiring-offer/core_test.ts`
  (add `--node-modules-dir=none`) and `scripts/guide/capture/offers_test.py`, which update.sh also runs.
  `offer.ts` is shared with the app, so the preview always matches what the candidate signs.
