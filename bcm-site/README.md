# The Brand Craftsman — Static Site

A GitHub Pages–ready recreation of https://bcm.mambaykanu.com

## Structure

```
.
├── index.html      # The full one-page site
├── styles.css      # All styling
├── media/          # Drop your images here (see below)
└── README.md
```

## Media files to upload to `/media/`

Rename the files from your current site to these names (or edit the `src`
paths in `index.html`) — the code references these filenames:

| Filename in `/media/` | Source on your current site                                    | Where it appears           |
|-----------------------|----------------------------------------------------------------|----------------------------|
| `logo.png`            | `/wp-content/uploads/2025/09/logo.png`                         | Header + footer            |
| `hero.jpg`            | `/wp-content/uploads/2025/09/Untitled-design.jpg`              | Hero image                 |
| `framework.png`       | `/wp-content/uploads/2025/09/Website-DB-1-2.png`               | 90-Day Framework diagram   |
| `case-1.jpg`          | `/wp-content/uploads/2025/09/2.jpg`                            | Case Study #1 (Printing)   |
| `case-2.jpg`          | `/wp-content/uploads/2025/09/3.jpg`                            | Case Study #2 (Tax)        |
| `case-3.jpg`          | `/wp-content/uploads/2025/09/4.jpg`                            | Case Study #3 (Real Estate)|
| `mambay.png`          | `/wp-content/uploads/2025/09/bcm-photo-1.png`                  | About section              |
| `dashboard.jpg`       | `/wp-content/uploads/2025/10/Website-DB.jpg`                   | Final CTA visual           |

## Deploy on GitHub Pages

1. Create a new repo on GitHub (e.g. `brandcraftsman-site`) and push these files:
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```
2. In the repo on GitHub go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   pick **`main` / `(root)`**, and save.
4. In a minute your site is live at
   `https://<your-username>.github.io/<repo>/`.

## Point your custom domain (optional)

If you want `bcm.mambaykanu.com` to serve this instead of the WordPress
site:

1. Add a `CNAME` file to the repo root containing exactly:
   ```
   bcm.mambaykanu.com
   ```
2. At your DNS provider, set a `CNAME` record for `bcm` →
   `<your-username>.github.io`.
3. Back in **Settings → Pages**, enter the domain and let it verify.
   HTTPS will provision automatically.

## Editing

- All copy lives in `index.html`.
- All colors, spacing, and typography live in the `:root` block at the top
  of `styles.css` — change those tokens to rebrand quickly.
- The two CTA buttons currently point to
  `https://brandcraftsman.mambayk.com/book-a-call/`. Change those `href`s
  if the URL moves.
