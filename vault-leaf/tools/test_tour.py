"""Browser tests for the guided tour, What's new and entry points."""
import asyncio, sys, json, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from playwright.async_api import async_playwright
from mocks import add_mocks
U = 'http://localhost:8765/'; PW = 'Copper-Lantern-Meadow-42'; PC = '135790'
ok = []; bad = []

async def wait_js(pg, expr, timeout=10):
    """Poll a JS expression (the app's CSP blocks Playwright's eval-based wait_for_function)."""
    for _ in range(int(timeout * 20)):
        if await pg.evaluate(expr): return
        await pg.wait_for_timeout(50)
    raise TimeoutError('timed out waiting for ' + expr)
def check(name, cond):
    (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ') + name)

async def setup(pg, sync=False):
    await pg.goto(U); await pg.wait_for_selector('#s-name', timeout=20000)
    await pg.click('[data-act="s-next"]'); await pg.fill('#s-pw', PW); await pg.fill('#s-pw2', PW); await pg.click('[data-act="s-next"]')
    await pg.wait_for_selector('.keypad')
    for d in PC + PC: await pg.click(f'.keypad [data-d="{d}"]'); await pg.wait_for_timeout(15)
    await pg.wait_for_selector('#rk', timeout=20000)
    if not sync and await pg.locator('[data-sf="sync"]').count(): await pg.uncheck('[data-sf="sync"]')
    await pg.check('#s-saved'); await pg.click('[data-act="s-finish"]'); await pg.wait_for_selector('#shell', timeout=20000)
    await pg.wait_for_timeout(600)
    if await pg.locator('.modal [data-act="mclose"]').count(): await pg.click('.modal [data-act="mclose"]')

async def unlock(pg):
    await pg.wait_for_selector('#l-pw'); await pg.fill('#l-pw', PW); await pg.press('#l-pw', 'Enter'); await pg.wait_for_selector('.keypad')
    for d in PC: await pg.click(f'.keypad [data-d="{d}"]')
    await pg.wait_for_selector('#shell', timeout=20000); await pg.wait_for_timeout(500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}); await add_mocks(ctx)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        # auth screen entry
        await pg.goto(U); await pg.wait_for_selector('#s-name', timeout=20000)
        await pg.click('.auth-card [data-act="tour"]'); await pg.wait_for_selector('.tour-track')
        check('tour opens from the setup screen', await pg.locator('.tour-track').count() == 3)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        check('Esc closes the tour', await pg.locator('#tour').count() == 0)
        # fresh vault shows the welcome banner
        await setup(pg)
        check('welcome banner after setup', await pg.locator('.tour-nudge [data-act="tour"]').count() == 1)
        check('version remembered as seen', await pg.evaluate("JSON.parse(localStorage.getItem('vaultleaf.seen'))") == await pg.evaluate('APP_VERSION'))
        await pg.click('.tour-nudge [data-act="tour"]'); await pg.wait_for_selector('.tour-track')
        check('banner gone once the tour is opened', await pg.locator('.tour-nudge').count() == 0)
        await pg.click('[data-act="tour-go"][data-v="everyone"]'); await pg.wait_for_selector('.tour-fig img')
        n = await pg.evaluate('TOUR.tracks.everyone.slides.length')
        check('starts at step 1', (await pg.text_content('.tour-count')).strip() == f'1 of {n}')
        # walk every step with the keyboard, checking each screenshot loads
        broken = []
        for i in range(n):
            await wait_js(pg, "!document.querySelector('.tour-fig img') || document.querySelector('.tour-fig img').complete")
            ok_img = await pg.evaluate("(() => { const i = document.querySelector('.tour-fig img'); return !i || i.naturalWidth > 0; })()")
            if not ok_img: broken.append(i)
            if i < n - 1: await pg.keyboard.press('ArrowRight')
        check('every Everyday screenshot loads', not broken)
        check('reached the last step', (await pg.text_content('.tour-count')).strip() == f'{n} of {n}')
        check('last button says Finish', (await pg.text_content('[data-act="tour-next"]')).strip() == 'Finish')
        await pg.keyboard.press('ArrowLeft'); check('ArrowLeft goes back', (await pg.text_content('.tour-count')).strip() == f'{n-1} of {n}')
        # chapter jump
        await pg.select_option('#tour-chap', 'Stay safe'); await pg.wait_for_timeout(100)
        t = await pg.text_content('#tour-title'); check('chapter menu jumps to Stay safe', t == 'Make strong passwords')
        # focus stays inside
        for _ in range(8): await pg.keyboard.press('Tab')
        check('focus stays in the tour', await pg.evaluate("document.getElementById('tour').contains(document.activeElement)"))
        # admin track
        await pg.click('[data-act="tour-pick"]'); await pg.click('[data-act="tour-go"][data-v="admin"]'); await pg.wait_for_selector('.tour-fig img')
        na = await pg.evaluate('TOUR.tracks.admin.slides.length'); broken = []
        for i in range(na):
            await wait_js(pg, "document.querySelector('.tour-fig img').complete")
            if not await pg.evaluate("document.querySelector('.tour-fig img').naturalWidth > 0"): broken.append(i)
            await pg.click('[data-act="tour-next"]')
        check('every admin screenshot loads and Finish closes', not broken and await pg.locator('#tour').count() == 0)
        # entry points inside the app
        await pg.click('.side-nav [data-v="settings"]'); await pg.click('.page > .banner [data-act="tour"]'); await pg.wait_for_selector('.tour-track')
        check('Settings opens the tour', True); await pg.click('[data-act="tour-close"]')
        await pg.click('.side-nav [data-v="guide"]'); await pg.wait_for_selector('.guide-bar [data-act="tour"]')
        await pg.click('.guide-bar [data-act="tour"]'); await pg.wait_for_selector('.tour-track'); check('Guide page opens the tour', True)
        await pg.click('.tour-pick-f button'); await pg.wait_for_timeout(200)
        check('"Read the full guide" goes to the Guide', await pg.locator('#tour').count() == 0 and await pg.locator('.guide-frame').count() == 1)
        # What's new after an update: pretend this device last saw 1.0
        await pg.evaluate("localStorage.setItem('vaultleaf.seen', JSON.stringify('1.0'))")
        await pg.click('.side-nav [data-v="vault"]'); await pg.click('#ltActs [data-act="lock"]'); await unlock(pg)
        check('What\'s new banner after an update', await pg.locator('.tour-nudge [data-act="tour-new"]').count() == 1)
        await pg.click('.tour-nudge [data-act="tour-new"]'); await pg.wait_for_selector('.tour-rel')
        rel = await pg.locator('.tour-rel .rel').count(); check('shows releases 1.1 and 1.2', rel == 2)
        titles = []
        cnt = int((await pg.text_content('.tour-count')).split(' of ')[1])
        for _ in range(cnt - 1): await pg.click('[data-act="tour-next"]'); titles.append(await pg.text_content('#tour-title'))
        print('   what\'s new steps:', titles)
        check('What\'s new includes sync, files and the tour', any('Sync' in t for t in titles) and any('Attach' in t for t in titles) and any('tour' in t.lower() for t in titles))
        check('What\'s new skips 1.0 features', not any(t == 'Password health' for t in titles))
        await pg.click('[data-act="tour-next"]'); await pg.wait_for_timeout(100)
        check('seen updated after What\'s new', await pg.evaluate("JSON.parse(localStorage.getItem('vaultleaf.seen'))") == await pg.evaluate('APP_VERSION'))
        await pg.click('#ltActs [data-act="lock"]'); await unlock(pg)
        check('no banner on the next unlock', await pg.locator('.tour-nudge').count() == 0)
        # an older vault with no record on this device: created before 1.2
        await pg.evaluate("localStorage.removeItem('vaultleaf.seen'); const h = JSON.parse(localStorage.getItem('vaultleaf.header')); h.createdAt = Date.parse('2026-11-10T12:00:00Z'); localStorage.setItem('vaultleaf.header', JSON.stringify(h));")
        await pg.click('#ltActs [data-act="lock"]'); await unlock(pg)
        check('vault from 1.1 sees What\'s new', await pg.locator('.tour-nudge [data-act="tour-new"]').count() == 1)
        await pg.click('.tour-nudge [data-act="tour-dismiss"]')
        check('dismiss hides it and records seen', await pg.locator('.tour-nudge').count() == 0 and await pg.evaluate("JSON.parse(localStorage.getItem('vaultleaf.seen'))") == await pg.evaluate('APP_VERSION'))
        check('no page errors', not errs); errs and print(errs[:5])
        await ctx.close()
        # phone
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); await add_mocks(ctx)
        pg = await ctx.new_page(); await setup(pg)
        await pg.tap('.tour-nudge [data-act="tour"]'); await pg.tap('[data-act="tour-go"][data-v="everyone"]'); await pg.wait_for_selector('.tour-fig img')
        box = await pg.locator('.tour-card').bounding_box(); check('phone tour fills the screen', box['width'] == 390)
        nb = await pg.locator('[data-act="tour-next"]').bounding_box(); check('Next is on screen', nb['y'] + nb['height'] <= 844)
        hb = await pg.locator('.tour-head').bounding_box(); check('header is one line', hb['height'] < 70)
        src = await pg.get_attribute('.tour-fig img', 'src'); check('phone picture used', '/p_' in src)
        # swipe
        await pg.evaluate("""() => { const el = document.getElementById('tour'); const t = (x) => new Touch({identifier:1, target:el, clientX:x, clientY:400});
          el.dispatchEvent(new TouchEvent('touchstart', {touches:[t(300)], changedTouches:[t(300)], bubbles:true}));
          el.dispatchEvent(new TouchEvent('touchend', {touches:[], changedTouches:[t(120)], bubbles:true})); }""")
        await pg.wait_for_timeout(100)
        check('swipe left goes to step 2', (await pg.text_content('.tour-count')).startswith('2 of'))
        await pg.screenshot(path='/tmp/vl-tour-phone.png')
        await ctx.close(); await b.close()
    print(f'\n{len(ok)} passed, {len(bad)} failed'); sys.exit(1 if bad else 0)
asyncio.run(main())
