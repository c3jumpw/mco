# Guide, tours and screenshots

RAMP's help has four parts, all built from the real app:

| What | Where | Who sees it |
|---|---|---|
| **Getting-started tours**: a slide show per role, a screenshot on every slide | `src/guide/tours.ts` (`TOURS`), shown by `src/guide/Tour.tsx` | Opens once on first sign-in; replay from Guide or More |
| **What's new**: a summary of changes (plus any screenshot slides), shown once after an update | `src/changelog/changelog.json` | The people each change applies to; replay from the Guide or More |
| **Change log**: every release, filterable and downloadable | `src/changelog/changelog.json`, `CHANGELOG.md` | Admins, at Admin › Change log |
| **The Guide**: every page and setting, with numbered callouts | `src/guide/guide.json`, `/guide` | Filtered to each person's role (clients, agency and platform sections included) |

## Screenshots

Screenshots come from a sample-data preview of the real app (`tools/guide`): the app's pages and routes from `src/`,
with the Supabase client and session swapped for in-memory sample data. Data sets: `work` (staff, mentors, team
members, clients, workspaces), `core` (agency admin), `money` (timesheets, invoices, payouts), `launch` (launch plans).

```bash
npm run guide:preview                  # browse the preview on http://localhost:5311 (?as=owner|admin|mentor|trainee|guest|va|coach|client, ?ws=super|support|owner|trial|setup, ?state=signed_out|no_access|account_pending|trial_ended, ?seen=<change log id> to see What's new)
npm run guide:shots                    # retake every screenshot into public/guide-media and refresh guide.json hotspots
npm run guide:shots -- tour-console    # only shots whose id starts with tour-console
npm run guide:check                    # fails if a page, image or the change log isn't right (also runs before every build)
npm run changelog                      # rewrite CHANGELOG.md from src/changelog/changelog.json
```

GitHub Actions (`.github/workflows/ramp-guide.yml`, at the repo root) checks coverage, retakes the screenshots on every push to `main` that touches the
app and commits any that changed, so the tours and Guide always show the current screens.

## When you add or change a feature

1. Add or update its Guide section in `src/guide/guide.json`, and map any new page in `tools/guide/coverage.json`.
   The build fails until every page in `src/App.tsx` is mapped.
2. Add a slide to the right tour in `src/guide/tours.ts` if it's something people should learn on day one.
3. Add a screenshot recipe in `tools/guide/tour-shots.cjs` (or `guide-shots.cjs` for a Guide shot with hotspots),
   and sample data in the matching data set if the page needs it. The check fails if an image has no recipe.
4. Add the change to `src/changelog/changelog.json` (see `CLAUDE.md`), with `announce: true` and slides if people
   should see it at sign-in, then run `npm run changelog`.
5. Run `npm run guide:shots -- <id>` and look at the result, or let CI retake it after you push.
