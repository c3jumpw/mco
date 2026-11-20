"""Turns the raw screenshots in shots/ into the WebP images in img/ and copies the callout boxes.

Phone screens become 520 px wide, pop-up windows 900 px, everything else at most 1100 px.
"""
import json, pathlib, shutil
from PIL import Image

HERE = pathlib.Path(__file__).parent
SHOTS, IMG = HERE / 'shots', HERE / 'img'
IMG.mkdir(exist_ok=True)
changed = []
for png in sorted(SHOTS.glob('*.png')):
    name = png.stem
    if name.startswith('test-'):      # pictures the checks take for review, not used in the guide
        continue
    im = Image.open(png).convert('RGB')
    w, h = im.size
    tw = 520 if name.startswith('cand-') else 700 if name == 'interview-records' else 900 if name in ('export', 'step-library', 'step-presets', 'offer-send') else min(w, 1100)
    if w != tw:
        im = im.resize((tw, round(h * tw / w)), Image.LANCZOS)
    out = IMG / f'{name}.webp'
    before = out.read_bytes() if out.exists() else b''
    im.save(out, 'WEBP', quality=80, method=6)
    if out.read_bytes() != before:
        changed.append(name)
boxes = SHOTS / 'boxes.json'
if boxes.exists():
    shutil.copy(boxes, HERE / 'boxes.json')
print(f'{len(changed)} images changed' + (': ' + ', '.join(changed) if changed else ''))
