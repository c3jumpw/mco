# RAMP: working notes

RAMP is the training, onboarding and HR app in this folder (Vite + React), deployed to Vercel as `mco-ramp` and
backed by the shared Supabase project `symbmscaajjmgywbifhv`. Only touch `ramp_` tables and functions there.

## Every change goes in the change log

The change log is the permanent record of what changed in RAMP and when. Admins read it at **Admin › Change log**,
and each person is shown the changes that affect them, once, the next time they sign in.

With **every** change people could notice, in the same commit:

1. Add to `src/changelog/changelog.json`, newest entry first.
   - A new release gets the next version (1.6 → 1.7; use 1.7.1 for a small fix), today's date
     and an id of `<date>-<short-slug>`.
   - Several commits on the same day can share one entry: add changes to it rather than starting another.
   - Each change has a `type` (`new`, `improved` or `fixed`) and `text` in plain, user-facing words.
   - Its `who` is any of `everyone`, `member`, `guest`, `coach`, `admin`, `client` or `platform`. Admins also count
     as coaches and members.
   - Add `requires` when it only matters with a feature on (`agency`, `tasks`, `chat`) or to some people (`work` =
     placed team members, `coaching` = coaches, `linkedClient`).
   - Optional fields: `link` (a page) and `guide` (a Guide section id).
   - Set `announce: true` when people should see it at sign-in. Add `slides` (screenshots, with their own
     `who`/`requires`) for anything visual.
   - Record `commits` (short hashes, can be added in a follow-up) and `migrations` (e.g. `"012"`).
2. Run `npm run changelog` to regenerate `CHANGELOG.md`.
3. Run `npm run guide:check`. The build runs it too, and it fails if the log is malformed or out of order, links to a
   missing page, Guide section or image, or if `CHANGELOG.md` is stale.

CI (`.github/workflows/ramp-guide.yml`) fails any push to `main` that changes `ramp/src` or `ramp/supabase` without
touching the change log. For changes nobody will notice (refactors, tooling), put `[no changelog]` in the commit
message instead.

## Guide, tours and screenshots

New pages need a Guide section (`src/guide/guide.json`) and an entry in `tools/guide/coverage.json`. Day-one features
get a tour slide in `src/guide/tours.ts`. Screenshots come from the sample-data preview and recipes in `tools/guide`.
Details are in `tools/guide/README.md`.

## Database

Migrations live in `supabase/migrations/NNN_ramp_*.sql`. Apply them with the Supabase tools only after the user says
go. Every table is workspace-scoped through `ramp_ws()`, apart from per-user state such as `ramp_user_state`.
