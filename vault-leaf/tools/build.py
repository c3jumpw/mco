"""Build Vaultleaf.
- tools/dist/index.html : single file for the Claude artifact (Google Fonts, Claude sync). Not committed.
- this folder           : the Vercel site (self-hosted fonts, home-screen install, offline, strict headers, guide).
"""
import base64, hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent  # the vault-leaf folder
SRC = ROOT / 'src'
css = (SRC / 'style.css').read_text()
js_src = '\n'.join((SRC / f).read_text() for f in ['core.js', 'ui1.js', 'ui2.js', 'ui3.js', 'ui4.js', 'ui5.js'])
js_src = js_src.replace('__EFF_WORDS__', (SRC / 'eff-wordlist.txt').read_text().strip())
tpl = (SRC / 'index.html').read_text()

GOOGLE = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;600&family=Atkinson+Hyperlegible+Next:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600..800&display=swap" rel="stylesheet">'''
WEBHEAD = '''<meta name="description" content="Vaultleaf: an encrypted password vault that reads like your notes.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#EEF2EF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1311" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Vaultleaf">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preload" href="/fonts/ahn-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">'''


def page(head, web):
    js = js_src.replace('/*__WEB__*/false', 'true' if web else 'false')
    html = tpl.replace('<!--__HEAD__-->', head).replace('/*__CSS__*/', css).replace('/*__JS__*/', js)
    return html, js


# artifact build
(ROOT / 'tools' / 'dist').mkdir(exist_ok=True)
art, _ = page(GOOGLE, False)
(ROOT / 'tools' / 'dist' / 'index.html').write_text(art)

# web build
web = ROOT
html, _ = page(WEBHEAD, True)
script = html.split('<script>', 1)[1].split('</script>', 1)[0]
sha = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
(web / 'index.html').write_text(html)
version = hashlib.sha256(html.encode()).hexdigest()[:10]
sw = (ROOT / 'sw.js').read_text()
import re
sw = re.sub(r"const CACHE = 'vaultleaf-[^']*';", f"const CACHE = 'vaultleaf-{version}';", sw).replace('__VERSION__', version)
(web / 'sw.js').write_text(sw)

APP_CSP = ("default-src 'none'; script-src 'self' 'sha256-%s'; style-src 'self' 'unsafe-inline'; font-src 'self'; "
           "img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-src 'self'; "
           "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'") % sha
GUIDE_CSP = ("default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; "
             "frame-ancestors 'self'; base-uri 'none'; form-action 'none'; object-src 'none'")
common = [
    {"key": "X-Content-Type-Options", "value": "nosniff"},
    {"key": "Referrer-Policy", "value": "no-referrer"},
    {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"},
    {"key": "X-Robots-Tag", "value": "noindex, nofollow"},
]
vercel = {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "trailingSlash": True,
    "headers": [
        {"source": "/(.*)", "headers": common},
        {"source": "/", "headers": [{"key": "Content-Security-Policy", "value": APP_CSP}, {"key": "X-Frame-Options", "value": "DENY"},
                                    {"key": "Cross-Origin-Opener-Policy", "value": "same-origin"}, {"key": "Cache-Control", "value": "no-cache"}]},
        {"source": "/index.html", "headers": [{"key": "Content-Security-Policy", "value": APP_CSP}, {"key": "X-Frame-Options", "value": "DENY"},
                                              {"key": "Cache-Control", "value": "no-cache"}]},
        {"source": "/guide/(.*)", "headers": [{"key": "Content-Security-Policy", "value": GUIDE_CSP}, {"key": "X-Frame-Options", "value": "SAMEORIGIN"}]},
        {"source": "/sw.js", "headers": [{"key": "Cache-Control", "value": "no-cache"}, {"key": "Service-Worker-Allowed", "value": "/"}]},
        {"source": "/fonts/(.*)", "headers": [{"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}]},
    ],
}
(web / 'vercel.json').write_text(json.dumps(vercel, indent=2) + '\n')
print('artifact', len(art), '| web', len(html), '| sha', sha[:12], '| version', version)
