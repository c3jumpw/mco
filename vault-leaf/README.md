# Vaultleaf

An encrypted password vault that runs in the browser. Vercel project **mco-vault-leaf** deploys this folder (Root Directory: `vault-leaf`) to https://mco-vault-leaf.vercel.app.

| Path | What it is |
| --- | --- |
| `index.html` | The built app (generated, don't edit by hand) |
| `guide/` | Illustrated user and admin guide, also shown inside the app |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and add-to-home-screen |
| `fonts/` | Self-hosted fonts (SIL Open Font License) |
| `vercel.json` | Security headers, including the Content Security Policy (generated) |
| `src/` | App source: `core.js` (crypto, storage, sync, parsing), `ui*.js`, `style.css`, `index.html` template |
| `tools/` | `build.py`, `build_guide.py`, `capture.py` (guide screenshots), `serve.py` (local server with the same headers), `test_features.py`, `mocks.py` |
| `supabase/migrations/` | Sync storage in the MKC-Admin project: `vaultleaf_` tables and functions |

`src/`, `tools/`, `supabase/` and this README are excluded from the deployment by `.vercelignore`.

## Features that use outside services

- **Sync between devices**: the browser encrypts the vault, then stores it through the `vaultleaf_*` functions in the MKC-Admin Supabase project. A device proves access with a token derived from the sync code; only its SHA-256 hash is stored. Up to 60 MB per vault.
- **Leak check**: on request, sends the first 5 characters of each password's SHA-1 to the Have I Been Pwned range API.
- **Face ID / fingerprint**: a passkey's PRF output wraps the vault key on that device only. No server involved.

These are the only hosts the Content Security Policy allows besides the site itself.

## Change the app

```
python3 tools/build.py          # rebuilds index.html, sw.js and vercel.json (CSP script hash)
python3 tools/serve.py 8765     # try it at http://localhost:8765 with production headers
python3 tools/test_features.py  # sync, files, Face ID, leak check and emergency kit, with local stand-ins
python3 tools/capture.py        # optional: retake guide screenshots (needs Playwright + the local server)
python3 tools/build_guide.py    # rebuild guide/index.html
```

Always rebuild rather than editing `index.html` directly: the Content Security Policy only allows the exact script that `build.py` produced.

User data never touches this repository or Vercel. Each vault is encrypted in the visitor's browser.

History: moved from c3jumpw/public on November 8, 2026.
