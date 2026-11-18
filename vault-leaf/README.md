# Vaultleaf

An encrypted password vault that runs in the browser. Vercel project **mco-vault-leaf** deploys this folder (Root Directory: `vault-leaf`) to https://mco-vault-leaf.vercel.app.

| Path | What it is |
| --- | --- |
| `index.html` | The built app (generated, don't edit by hand) |
| `guide/` | Illustrated user and admin guide, also shown inside the app. `guide/img/` also feeds the in-app tour |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and add-to-home-screen |
| `fonts/` | Self-hosted fonts (SIL Open Font License) |
| `vercel.json` | Security headers, including the Content Security Policy (generated) |
| `src/` | App source: `core.js` (crypto, storage, sync, parsing), `ui*.js`, `style.css`, `index.html` template, and `tour.json` (releases, features, tour steps) |
| `tools/` | `build.py`, `build_guide.py`, `capture.py` (screenshots), `admin_art.py` (admin tour pictures), `samples.py`, `check_docs.py`, `test_tour.py`, `serve.py` (local server with the same headers), `test_features.py`, `mocks.py` |
| `supabase/migrations/` | Sync storage in the MKC-Admin project: `vaultleaf_` tables and functions |

`src/`, `tools/`, `supabase/` and this README are excluded from the deployment by `.vercelignore`.

## Features that use outside services

- **Sync between devices**: the browser encrypts the vault, then stores it through the `vaultleaf_*` functions in the MKC-Admin Supabase project. A device proves access with a token derived from the sync code; only its SHA-256 hash is stored. Up to 60 MB per vault.
- **Leak check**: on request, sends the first 5 characters of each password's SHA-1 to the Have I Been Pwned range API.
- **Face ID / fingerprint**: a passkey's PRF output wraps the vault key on that device only. No server involved.

These are the only hosts the Content Security Policy allows besides the site itself.

## Guided tour and What's new

The app has a step-by-step tour (Settings › Take the tour, the Guide tab, or "How Vaultleaf works" on the unlock screen) with three tracks: **Everyday use**, **For admins**, and **What's new**. Steps show real screenshots from `guide/img/` with the same numbered callouts as the guide. After an update, each device shows a What's new banner on its next unlock, covering only features added since it last looked.

Everything comes from `src/tour.json`:

- `version` and `releases`: the current version and a dated entry per release.
- `features`: every feature, the release it arrived in (`since`), its guide section (`guide`), and the pages or Settings panels it covers (`covers`).
- `tracks`: the steps. Each names its feature, a desktop and a phone screenshot (`desk`, `phone`), and its text.

### Keeping it current

The **Vaultleaf docs** GitHub Actions workflow (`.github/workflows/vault-leaf-docs.yml` at the repository root) runs on every push to `main` that changes `vault-leaf/src`, `vault-leaf/tools` or the workflow. It builds the app, retakes every screenshot, redraws the admin pictures, rebuilds the guide and the tour, runs `check_docs.py`, and commits the refreshed files. Vercel then deploys them. It can also be run by hand from the Actions tab.

`check_docs.py` fails the run when a feature has no tour step or guide section, a step's screenshot is missing, or a page or Settings panel isn't covered by any feature.

**Release checklist** for a new feature:

1. Build it in `src/`. If it has a new screen, add a capture to `tools/capture.py` and callout text to `LEG` in `tools/build_guide.py`.
2. In `src/tour.json`: bump `version`, add a `releases` entry, add the feature (with `since` and `guide`), and add a step to a track.
3. Add a guide section in `tools/build_guide.py` with the id you used for `guide`.
4. Push to `main`. The workflow does the rest. Locally, the same steps are below.

## Change the app

```
python3 tools/build.py          # rebuilds index.html, sw.js and vercel.json (CSP script hash)
python3 tools/serve.py 8765     # try it at http://localhost:8765 with production headers
python3 tools/test_features.py  # sync, files, Face ID, leak check and emergency kit, with local stand-ins
python3 tools/test_tour.py      # the tour, What's new and their entry points, on a computer and a phone
python3 tools/capture.py        # retake screenshots and admin pictures (needs Playwright + the local server)
python3 tools/build_guide.py    # rebuild guide/index.html
python3 tools/build.py          # again, so the tour picks up the new callout positions
python3 tools/check_docs.py     # every feature has a tour step, a guide section and screenshots
```

Always rebuild rather than editing `index.html` directly: the Content Security Policy only allows the exact script that `build.py` produced.

User data never touches this repository or Vercel. Each vault is encrypted in the visitor's browser.

History: moved from c3jumpw/public on November 8, 2026.
