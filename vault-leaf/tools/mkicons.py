import pathlib
import asyncio
from playwright.async_api import async_playwright
LEAF='M6 42C6 20 20 6 42 6c0 22-14 36-36 36z'
HOLE='M24 14.5a4.6 4.6 0 0 1 2.7 8.3l1.6 8.7h-8.6l1.6-8.7A4.6 4.6 0 0 1 24 14.5z'
def svg(size, pad, radius):
    inner = size - 2*pad
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
<rect width="{size}" height="{size}" rx="{radius}" fill="#1D5B44"/>
<g transform="translate({pad},{pad}) scale({inner/48})"><path d="{LEAF}" fill="#EEF2EF"/><path d="{HOLE}" fill="#1D5B44"/></g></svg>'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        for name, size, pad, rad in [('icon-192.png',192,34,0),('icon-512.png',512,90,0),('icon-maskable-512.png',512,130,0),('apple-touch-icon.png',180,32,0)]:
            await pg.set_viewport_size({'width':size,'height':size})
            await pg.set_content(f'<html><body style="margin:0">{svg(size,pad,rad)}</body></html>')
            await pg.screenshot(path=str(pathlib.Path(__file__).resolve().parent.parent / 'icons') + '/'+name, omit_background=False)
        await b.close()
asyncio.run(main())
open(str(pathlib.Path(__file__).resolve().parent.parent / 'icons' / 'favicon.svg'),'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#1D5B44"/><g transform="translate(7,7) scale(0.7083)"><path d="{LEAF}" fill="#EEF2EF"/><path d="{HOLE}" fill="#1D5B44"/></g></svg>')
print('icons ok')
