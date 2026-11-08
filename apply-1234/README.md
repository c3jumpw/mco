# apply1234 hiring app

Candidate side (public, on apply1234.com):
- `/<secret-link>` — the activity page for a live job (welcome → Loom setup → video answers → submit)
- any other path — a "Nothing here" page; every attempt is logged and matched to the closest live job
- `/p/<id>` — optional shareable posting page

Admin side: `/admin` — jobs, posting editor with hidden link pieces, activity page builder, questions,
interview kit, candidate pipeline, reviews, notes, behavior timeline, Markdown/HTML exports.

Stack: Vite + React + Tailwind, Supabase (tables prefixed `hiring_` in the MKC-Admin project), Vercel.
`api/loom.js` looks up Loom video titles and lengths through Loom's public oEmbed endpoint.
Database schema: `supabase/migrations/001_hiring_schema.sql`.
