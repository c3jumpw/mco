"""Sample attachments used in the screenshots (an illustrated ID card and a short PDF). No real data."""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path('/tmp/vl-guide'); OUT.mkdir(parents=True, exist_ok=True)


def card():
    im = Image.new('RGB', (900, 560), '#E9EFEC'); d = ImageDraw.Draw(im)
    d.rounded_rectangle((20, 20, 880, 540), 28, fill='#F5E7C8', outline='#8A6A22', width=4)
    d.rectangle((60, 70, 300, 360), fill='#97A69C'); d.ellipse((120, 120, 240, 240), fill='#D2DCD7'); d.rectangle((110, 250, 250, 350), fill='#D2DCD7')
    for i, w in enumerate((420, 360, 300, 380, 260)):
        d.rectangle((340, 90 + i * 52, 340 + w, 112 + i * 52), fill='#776A46')
    d.rectangle((60, 410, 840, 430), fill='#A38B5A'); d.rectangle((60, 460, 640, 480), fill='#A38B5A')
    im.save(OUT / 'drivers-license.png', optimize=True)


def pdf():
    pages = []
    for p in range(3):
        im = Image.new('RGB', (1240, 1754), 'white'); d = ImageDraw.Draw(im)
        d.rectangle((120, 140, 1120, 200), fill='#1D5B44')
        for i in range(26):
            w = 1000 - (i * 37 % 300)
            d.rectangle((120, 300 + i * 52, 120 + w, 318 + i * 52), fill='#C9D2CC')
        d.rectangle((120, 1660, 300, 1676), fill='#8A9A90')
        pages.append(im)
    pages[0].save(OUT / 'account-agreement.pdf', save_all=True, append_images=pages[1:], resolution=150)


if __name__ == '__main__':
    card(); pdf()
    print('samples in', OUT, [f.name for f in OUT.iterdir()])
