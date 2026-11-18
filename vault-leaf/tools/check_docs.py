"""Fail when the tour or guide falls behind the app.

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
for h in re.findall(r'panel-h"><h2>(.*?)</h2>', src):
    if '${' in h: names |= set(re.findall(r"'([^']+)'", h))
    else: names.add(h)
for n in sorted(names):
    if n.lower() not in covered: problems.append(f'"{n}" (a page or Settings panel) isn\'t covered: add it to a feature\'s "covers" in src/tour.json, with a tour step')

# the built site carries this tour
site = (ROOT / 'index.html').read_text()
if f'"version":"{tour["version"]}"' not in site: problems.append('index.html was built from an older tour: run tools/build.py')
if f"Vaultleaf {tour['version']} guide" not in guide: problems.append('guide/index.html was built from an older tour: run tools/build_guide.py')

if problems:
    print('Docs are out of date:'); [print(' -', p) for p in problems]; sys.exit(1)
print(f"Docs OK: {len(feats)} features, {len(slides)} tour steps, {len(names)} pages and panels covered, version {tour['version']}")
