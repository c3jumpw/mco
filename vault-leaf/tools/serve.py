# Local stand-in for Vercel: serves web/ and applies vercel.json headers, trailing-slash dirs.
import http.server, json, re, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
def rx(src): return re.compile('^' + src.replace('(.*)', '(.*)') + '$')
def rules():  # re-read on every request so a rebuild's new CSP hash applies at once
    return [(rx(h['source']), h['headers']) for h in json.loads((ROOT/'vercel.json').read_text())['headers']]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(s):
        path = s.path.split('?')[0]
        for r, hs in rules():
            if r.match(path):
                for h in hs: s.send_header(h['key'], h['value'])
        super().end_headers()
    def log_message(s, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
