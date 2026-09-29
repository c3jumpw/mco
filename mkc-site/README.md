# MK Holding Co — Static Site

A clean, static recreation of [mkholdingco.com](https://mkholdingco.com/), ready to deploy on GitHub Pages, Netlify, Vercel, or any static host.

## Project structure

```
.
├── index.html         # Single-page site
├── styles.css         # All styling
├── media/             # Drop your images here (logos, hero, etc.)
│   ├── mkc-logo-1.png
│   ├── hero.jpg
│   ├── about-1.jpg
│   ├── about-2.jpg
│   ├── pillar-1.svg
│   ├── pillar-2.svg
│   └── pillar-3.svg
└── README.md
```

## Media

Add your images to the `/media` folder using these filenames (or edit `index.html` to point at your own names):

| File | Where it appears |
| --- | --- |
| `mkc-logo-1.png` | Header + footer + favicon |
| `hero.jpg`       | Hero section (right side) |
| `about-1.jpg`    | "Partner & invest" section |
| `about-2.jpg`    | "Portfolio companies" section |
| `pillar-1.svg`   | Pillar 1 icon (Consistent systems) |
| `pillar-2.svg`   | Pillar 2 icon (Staff growth) |
| `pillar-3.svg`   | Pillar 3 icon (Relationships) |

Missing images are hidden automatically (`onerror` handler), so the site renders cleanly even before you upload media.

## Editing content

Everything is in **`index.html`**. Text lives directly in the HTML; the section IDs (`#about`, `#portfolio`, `#standards`, `#contact`) drive the nav anchors. To change the contact email, edit the `mailto:` link near the bottom of `index.html`.

## Local preview

Just open `index.html` in a browser. Or, for a proper local server:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

## Deploy via GitHub Pages

1. Create a new GitHub repo (e.g. `mkholdingco-site`).
2. Push these files to `main`:
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin git@github.com:YOUR-USERNAME/mkholdingco-site.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **`main`**, folder: **`/ (root)`**
   - Save.
4. GitHub gives you a URL like `https://YOUR-USERNAME.github.io/mkholdingco-site/`.

### Custom domain (mkholdingco.com)

1. In your repo, add a file named `CNAME` (no extension) containing exactly:
   ```
   mkholdingco.com
   ```
2. At your DNS provider, point the domain at GitHub Pages:
   - `A` records for `@` to:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` to `YOUR-USERNAME.github.io`
3. In **Settings → Pages**, enter the custom domain and enable **Enforce HTTPS** once the cert provisions.

## License

Copy is © Mambay, LLC. The scaffolding here is yours to modify.
