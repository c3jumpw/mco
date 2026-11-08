"""Builds the hiring guide into one self-contained HTML file.

    python3 scripts/guide/build.py

Reads template.html, embeds the screenshots in img/ as data URIs and draws the
numbered callouts from boxes.json. Writes src/admin/guide/guide.html, which the
admin app shows at /admin/guide.
"""
import base64, html, json, pathlib, re
from PIL import Image

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent.parent / 'src' / 'admin' / 'guide' / 'guide.html'
boxes = json.loads((HERE / 'boxes.json').read_text())

def data_uri(name):
    return 'data:image/webp;base64,' + base64.b64encode((HERE / 'img' / f'{name}.webp').read_bytes()).decode()

def size(name):
    with Image.open(HERE / 'img' / f'{name}.webp') as im:
        return im.size

def shot(m):
    parts = m.group(1).split('|')
    name, alt = parts[0].strip(), parts[1].strip()
    legend = [x.strip() for x in parts[2].split(';;')] if len(parts) > 2 and parts[2].strip() else []
    marks = boxes.get(name, []) if legend else []
    overlay = ''
    for i, b in enumerate(marks[:len(legend)]):
        if not b:
            continue
        overlay += (f'<span class="box" style="left:{b["x"]}%;top:{b["y"]}%;width:{b["w"]}%;height:{b["h"]}%"></span>'
                    f'<span class="num" style="left:{b["x"]}%;top:{b["y"]}%">{i + 1}</span>')
    w, h = size(name)
    fig = f'<figure><div class="shot"><img src="{data_uri(name)}" width="{w}" height="{h}" alt="{html.escape(alt)}">{overlay}</div>'
    if legend:
        fig += '<ol class="legend">' + ''.join(f'<li><span class="n">{i + 1}</span><span>{t}</span></li>' for i, t in enumerate(legend)) + '</ol>'
    return fig + '</figure>'

def phone(m):
    name, n, title, text = [x.strip() for x in m.group(1).split('|')]
    w, h = size(name)
    return (f'<figure class="phone"><div class="frame"><img src="{data_uri(name)}" width="{w}" height="{h}" alt="{html.escape(title)}: {html.escape(text)}"></div>'
            f'<figcaption class="cap"><span class="n">{n}</span><span><b>{title}</b>{text}</span></figcaption></figure>')

src = (HERE / 'template.html').read_text()
out = re.sub(r'@@SHOT (.+?)@@', shot, src)
out = re.sub(r'@@PHONE (.+?)@@', phone, out)
assert '@@' not in out, 'unexpanded placeholder'
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(out)
print(f'wrote {OUT} ({len(out) // 1024} KB)')
