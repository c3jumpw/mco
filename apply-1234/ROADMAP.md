# apply1234 → Re-Crew-IT roadmap

apply1234 is the working hiring tool. Re-Crew-IT is the future product: the same process, offered to other
business owners as their own recruiting workspace.

## Now: apply1234 (single team)

- Hidden-link puzzle on apply1234.com, wrong-link logging, Loom video answers with automatic checks
- Admin: jobs, posting editor with link pieces and versions, activity page builder, questions,
  interview kit, candidate pipeline, rubric scores, notes, behavior timeline, AI-ready exports

### Setup checklist
- [ ] Supabase → Authentication → URL Configuration: Site URL `https://www.apply1234.com`,
      Redirect URLs `https://www.apply1234.com/**`, `https://apply1234.com/**`
- [ ] Custom email sender (Resend SMTP) so auth emails come from apply1234, not Supabase
- [ ] Supabase → Authentication → Passwords: turn on leaked-password protection
- [ ] Note: auth settings are project-wide in MKC-Admin (shared with frontrow/booking/core)

## Next: Re-Crew-IT (many businesses)

1. **Workspaces (multi-tenancy):** each business gets private jobs, candidates, team and branding.
   Start Re-Crew-IT on its own Supabase project so client data and auth emails are separate.
2. **Custom domains per client:** the puzzle only works on a domain the client controls.
3. **Activity library:** the puzzle + Loom flow is the flagship template; add writing tests,
   scheduling scenarios, spreadsheet tasks. AI drafts new activities from the role; a human approves them.
4. **Bring-your-own AI key (Gemini):** a settings box unlocks AI audit summaries, candidate comparisons
   and stats help. Keys stored encrypted server-side, never in the browser. AI assists reviewers; it
   doesn't make hiring decisions.
5. **Talent pool:** strong past candidates stay searchable so clients can re-hire from people already vetted.
6. **Light onboarding module (optional per client):** on "Hired", generate a first-week checklist, welcome
   email and a 90-day plan from the job notes, interview scorecard and the candidate's own answers.
7. **Value reporting:** quarterly reports with hours saved per hire, puzzle drop-off vs. completion,
   and cost per qualified shortlist.
8. **Billing and white-label:** low monthly platform fee (talent pool + reporting) plus a per-job or per-hire
   fee; client branding on candidate pages. Test pricing with real clients first.

## Pitch notes (for marketing)

What makes the process different from a standard recruiting company:
- Activities test **how people think and adapt**, not just their résumé: following instructions,
  attention to detail, resourcefulness, picking up a new tool.
- Answers are **on video**, so there's nowhere to hide behind polished text.
- Evaluation combines skill with process signals: how long each step took, wrong attempts, hesitation
  between steps, task completion, and how clearly they explain a topic.

### Compliance guardrails to keep in the pitch and product
- Measure **process behavior** (timing, attempts, completion) rather than inferring personality or
  emotion from faces or voices; the latter is legally risky and scientifically weak.
- Where AI analyzes candidate videos (e.g. Illinois), give notice, explain the AI, get consent first, and
  delete videos on request within 30 days. Keep the consent checkbox on every activity.
- Offer an accommodations contact on every activity page.
