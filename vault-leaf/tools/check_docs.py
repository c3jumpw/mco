"""Fail when the tour, guide or change log falls behind the app.

Checks that every feature in src/tour.json has a tour step and a guide section, that every step's
screenshots exist, that every page and Settings panel in the app is covered by a feature, and that
the built site carries the current tour. Run after build.py, capture.py and build_guide.py."""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
tour = json.loads((ROOT / 'src' / 'tour.json').read_text())
shots = json.loads((ROOT / 'tools' / 'shots.json').read_text())
guide = (ROOT / 'guide' / 'index.html').read_text()
src = '\n'.join((ROOT / 'src' / f).read_text() for f in sorted(p.name for p in (ROOT / 'src').glob('*.js')))
problems = []
vt = lambda v: tuple(int(x) for x in v.split('.'))

# releases
vers = [r['version'] for r in tour['releases']]
if vers != sorted(vers, key=vt) or len(set(vers)) != len(vers): problems.append('releases must be listed oldest first, each version once')
if tour['version'] != vers[-1]: problems.append(f"version {tour['version']} must match the newest release ({vers[-1]})")
for r in tour['releases']:
    if not re.fullmatch(r'\d{4}-\d\d-\d\d', r.get('date', '')) or not r.get('title') or not r.get('summary'): problems.append(f"release {r.get('version')} needs a date (YYYY-MM-DD), title and summary")

# slides
slides = [(k, s) for k, t in tour['tracks'].items() for s in t['slides']]
feats = {f['id']: f for f in tour['features']}
ids = [s['id'] for _, s in slides]
for i in set(i for i in ids if ids.count(i) > 1): problems.append(f'step id "{i}" is used twice')
for k, s in slides:
    if s.get('feature') not in feats: problems.append(f"step {s['id']}: unknown feature \"{s.get('feature')}\"")
    if not s.get('title') or not s.get('text'): problems.append(f"step {s['id']}: needs a title and text")
    for key in ('desk', 'phone'):
        n = s.get(key)
        if not n: problems.append(f"step {s['id']}: no {key} screenshot"); continue
        if n not in shots: problems.append(f"step {s['id']}: screenshot {n} isn't in tools/shots.json (add it to tools/capture.py)")
        if not (ROOT / 'guide' / 'img' / f'{n}.webp').exists(): problems.append(f"step {s['id']}: guide/img/{n}.webp is missing")

# features
for f in tour['features']:
    if f['since'] not in vers: problems.append(f"feature {f['id']}: since {f['since']} isn't a listed release")
    if f'id="{f["guide"]}"' not in guide: problems.append(f"feature {f['id']}: guide section #{f['guide']} doesn't exist in guide/index.html")
    if not any(s.get('feature') == f['id'] for _, s in slides): problems.append(f"feature {f['id']} has no tour step")

# every page and Settings panel in the app is covered by a feature
covered = {c.lower() for f in tour['features'] for c in f.get('covers', [])}
names = set()
m = re.search(r'const TABS = (\[.*?\]);', src)
if m: names |= {lab for _, lab in re.findall(r"\['(\w+)','([^']+)'", m.group(1))}
names.add('Guide')
if 'data-v="admin"' in src: names.add('Admin')
for h in re.findall(r'panel-h"><h2>(.*?)</h2>', src):
    if '${' in h: names |= set(re.findall(r"'([^']+)'", h))
    else: names.add(h)
for n in sorted(names):
    if n.lower() not in covered: problems.append(f'"{n}" (a page or Settings panel) isn\'t covered: add it to a feature\'s "covers" in src/tour.json, with a tour step')

# change log: written entries in order, valid, and covering every release
TYPES = {'added', 'improved', 'changed', 'fixed', 'security'}
log = json.loads((ROOT / 'src' / 'changelog.json').read_text())['entries']
autop = ROOT / 'src' / 'changelog-auto.json'
auto = json.loads(autop.read_text())['entries'] if autop.exists() else []
prev = ''
for i, c in enumerate(log, 1):
    where = f"change log entry {i} ({c.get('title', 'untitled')})"
    if not re.fullmatch(r'\d{4}-\d\d-\d\d(T\d\d:\d\d)?', c.get('at', '')): problems.append(f'{where}: "at" must be YYYY-MM-DD or YYYY-MM-DDTHH:MM')
    elif c['at'] < prev: problems.append(f'{where}: entries must stay oldest first; add new ones at the end')
    else: prev = c['at']
    if c.get('type') not in TYPES: problems.append(f'{where}: type must be one of {", ".join(sorted(TYPES))}')
    if c.get('audience') not in ('everyone', 'admin'): problems.append(f'{where}: audience must be everyone or admin')
    if c.get('version') not in vers: problems.append(f'{where}: version {c.get("version")} isn\'t a release in src/tour.json')
    if not c.get('title') or not c.get('text'): problems.append(f'{where}: needs a title and text')
    if c.get('feature') and c['feature'] not in feats: problems.append(f'{where}: unknown feature "{c["feature"]}"')
for v in vers:
    if not any(c.get('version') == v for c in log): problems.append(f'release {v} has no entry in src/changelog.json')
for c in auto:
    if not c.get('at') or not c.get('title') or not c.get('commit'): problems.append(f"automatic change log entry is incomplete: {c}")
md = (ROOT / 'CHANGELOG.md').read_text() if (ROOT / 'CHANGELOG.md').exists() else ''
if log and log[-1]['title'] not in md: problems.append('CHANGELOG.md is out of date: run tools/build.py')

# the built site carries this tour
site = (ROOT / 'index.html').read_text()
if f'"version":"{tour["version"]}"' not in site: problems.append('index.html was built from an older tour: run tools/build.py')
if f"Vaultleaf {tour['version']} guide" not in guide: problems.append('guide/index.html was built from an older tour: run tools/build_guide.py')

if problems:
    print('Docs are out of date:'); [print(' -', p) for p in problems]; sys.exit(1)
print(f"Docs OK: {len(feats)} features, {len(slides)} tour steps, {len(names)} pages and panels covered, {len(log)} written and {len(auto)} automatic change log entries, version {tour['version']}")
