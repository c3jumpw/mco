# apply1234 hiring app

Candidate side (public, on apply1234.com):
- `/<secret-link>` — the activity page for a live job (welcome → Loom setup → video answers → submit)
- any other path — a "Nothing here" page; every attempt is logged and matched to the closest live job
- `/p/<id>` — optional shareable posting page

Admin side: `/admin` — new-job wizard (`/admin/new`: notes → link → AI prompt → paste reply → launch), jobs, posting editor with hidden link pieces, activity page builder, questions,
interview kit, candidate pipeline, reviews, notes, behavior timeline, Markdown/HTML exports.

Stack: Vite + React + Tailwind, Supabase (tables prefixed `hiring_` in the MKC-Admin project), Vercel.
`api/loom.js` looks up Loom video titles and lengths through Loom's public oEmbed endpoint.
Database schema: `supabase/migrations/` (001 base schema, 002 job-board link variants).

Job-board links: `apply1234.com/<slug>-<code>` resolves to the job and records the board as the candidate's source.
