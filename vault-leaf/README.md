# Vaultleaf

An encrypted password vault that runs in the browser. Vercel project **mco-vault-leaf** deploys this folder (Root Directory: `vault-leaf`) to **https://vaultleaf.mkcworkspace.com**, its main address since November 20, 2026. The earlier address, https://mco-vault-leaf.vercel.app, keeps working so people can move their vaults: a vault lives in one browser at one address, so the app shows "Move my vault" there once the new address answers. Don't redirect the old address until everyone has moved.

DNS for mkcworkspace.com is at GoDaddy. `vaultleaf` is a CNAME to the value Vercel shows for the domain (Project › Settings › Domains).

| Path | What it is |
| --- | --- |
| `index.html` | The built app (generated, don't edit by hand) |
| `CHANGELOG.md` | Every change, oldest first (generated from `src/changelog*.json`) |
| `guide/` | Illustrated user and admin guide, also shown inside the app. `guide/img/` also feeds the in-app tour |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and add-to-home-screen |
| `fonts/` | Self-hosted fonts (SIL Open Font License) |
| `vercel.json` | Security headers, including the Content Security Policy (generated) |
| `src/` | App source: `core.js` (crypto, storage, sync, parsing), `ui*.js`, `style.css`, `index.html` template, `tour.json` (releases, features, tour steps), `changelog.json` (written change log) and `changelog-auto.json` (logged by the workflow) |
| `tools/` | `build.py`, `build_guide.py`, `capture.py` (screenshots), `admin_art.py` (admin tour pictures), `samples.py`, `check_docs.py`, `log_changes.py`, `test_tour.py`, `test_changelog.py`, `serve.py` (local server with the same headers), `test_features.py`, `mocks.py` |
| `supabase/migrations/` | Sync storage in the MKC-Admin project: `vaultleaf_` tables and functions |

`src/`, `tools/`, `supabase/` and this README are excluded from the deployment by `.vercelignore`.

## Features that use outside services

- **Sync between devices**: the browser encrypts the vault, then stores it through the `vaultleaf_*` functions in the MKC-Admin Supabase project. A device proves access with a token derived from the sync code; only its SHA-256 hash is stored. Up to 60 MB per vault.
- **Leak check**: on request, sends the first 5 characters of each password's SHA-1 to the Have I Been Pwned range API.
- **Face ID / fingerprint**: a passkey's PRF output wraps the vault key on that device only. No server involved.

These are the only hosts the Content Security Policy allows besides the site itself.

## Change log, roles and What's new

**Change log.** Every change since launch, oldest first, from two files:

- `src/changelog.json`: written entries. Add one at the end for every change people should hear about: `at` (YYYY-MM-DDTHH:MM, US Eastern), `version`, `type` (added, improved, changed, fixed, security), `audience` (`everyone` or `admin`), `title`, `text`, and optionally `feature` (a feature id from `tour.json`, for the picture and Show me) and `commit`. Never reorder or remove entries.
- `src/changelog-auto.json`: written by `tools/log_changes.py` in the docs workflow. Any commit that changed Vaultleaf without adding to `changelog.json` gets an admin-only entry here, so nothing goes unrecorded.

Site admins read it on the **Admin** page, with filters, search and downloads (JSON, CSV, Markdown). The build also writes `CHANGELOG.md`, and the guide has a Change log section.

**Roles.** Vaultleaf has no server accounts, so each person sets their role in Settings › Your role (Everyday user or Site admin). It's stored in their encrypted vault and syncs. Admins get the Admin page and admin changes in What's new. A role never grants access to anyone's vault.

**What's new.** The first time someone unlocks after an update, a summary lists the written entries they haven't seen that apply to their role, with pictures from the tour. What they've seen is kept in the vault (`meta.seenChange`), so each person sees it once across their devices. A new vault starts with everything marked seen and offers the tour instead.

## Guided tour

The app has a step-by-step tour (Settings › Take the tour, the Guide tab, or "How Vaultleaf works" on the unlock screen) with three tracks: **Everyday use**, **For admins**, and **What's new**. Steps show real screenshots from `guide/img/` with the same numbered callouts as the guide. The What's new track tours the features added in recent releases.

Everything comes from `src/tour.json`:

- `version` and `releases`: the current version and a dated entry per release.
- `features`: every feature, the release it arrived in (`since`), its guide section (`guide`), and the pages or Settings panels it covers (`covers`).
- `tracks`: the steps. Each names its feature, a desktop and a phone screenshot (`desk`, `phone`), and its text.

### Keeping it current

The **Vaultleaf docs** GitHub Actions workflow (`.github/workflows/vault-leaf-docs.yml` at the repository root) runs on every push to `main` that changes anything under `vault-leaf/` except generated files, or the workflow. It logs changes that have no written entry, builds the app, retakes every screenshot, redraws the admin pictures, rebuilds the guide and the tour, runs `check_docs.py`, and commits the refreshed files. Vercel then deploys them. It can also be run by hand from the Actions tab.

`check_docs.py` fails the run when a feature has no tour step or guide section, a step's screenshot is missing, a page or Settings panel isn't covered by any feature, or the change log is out of order, invalid or missing a release.

**Release checklist:**

1. Add an entry to the end of `src/changelog.json` for anything people should hear about. Small fixes can go without one; the workflow logs them for admins.
2. For a new feature, build it in `src/`. If it has a new screen, add a capture to `tools/capture.py` and callout text to `LEG` in `tools/build_guide.py`.
3. In `src/tour.json`: bump `version`, add a `releases` entry, add the feature (with `since` and `guide`), and add a step to a track.
4. Add a guide section in `tools/build_guide.py` with the id you used for `guide`.
5. Push to `main`. The workflow does the rest. Locally, the same steps are below.

## Change the app

```
python3 tools/build.py          # rebuilds index.html, sw.js and vercel.json (CSP script hash)
python3 tools/serve.py 8765     # try it at http://localhost:8765 with production headers
python3 tools/test_features.py  # sync, files, Face ID, leak check and emergency kit, with local stand-ins
python3 tools/test_tour.py      # the tour and its entry points, on a computer and a phone
python3 tools/test_changelog.py # roles, Admin page and change log, What's new, moving to the new address
python3 tools/capture.py        # retake screenshots and admin pictures (needs Playwright + the local server)
python3 tools/build_guide.py    # rebuild guide/index.html
python3 tools/build.py          # again, so the tour picks up the new callout positions
python3 tools/check_docs.py     # every feature has a tour step, a guide section and screenshots
```

Always rebuild rather than editing `index.html` directly: the Content Security Policy only allows the exact script that `build.py` produced.

User data never touches this repository or Vercel. Each vault is encrypted in the visitor's browser.

History: moved from c3jumpw/public on November 8, 2026.
