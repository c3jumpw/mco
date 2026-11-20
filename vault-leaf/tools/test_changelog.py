"""Browser tests for roles, the Admin page and change log, What's new after updates, and the move to the new address."""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mocks import add_mocks
U = 'http://localhost:8765/'; PW = 'Copper-Lantern-Meadow-42'; PC = '135790'
ok = []; bad = []
def check(name, cond):
    (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ') + name)

async def setup(pg):
    await pg.goto(U); await pg.wait_for_selector('#s-name', timeout=20000)
    await pg.click('[data-act="s-next"]'); await pg.fill('#s-pw', PW); await pg.fill('#s-pw2', PW); await pg.click('[data-act="s-next"]')
    await pg.wait_for_selector('.keypad')
    for d in PC + PC: await pg.click(f'.keypad [data-d="{d}"]'); await pg.wait_for_timeout(15)
    await pg.wait_for_selector('#rk', timeout=20000)
    await pg.check('#s-saved'); await pg.click('[data-act="s-finish"]'); await pg.wait_for_selector('#shell', timeout=20000)
    await pg.wait_for_timeout(700)
    if await pg.locator('.modal [data-act="mclose"]').count(): await pg.click('.modal [data-act="mclose"]')

async def relock(pg):
    # seenChange only grows when devices merge, so push the lowered test value to sync storage too
    await pg.evaluate("async () => { await persist(); if(syncOn()) await pushNow(); }"); await pg.wait_for_timeout(300)
    await pg.evaluate("lock()"); await pg.wait_for_selector('#l-pw'); await pg.fill('#l-pw', PW); await pg.press('#l-pw', 'Enter'); await pg.wait_for_selector('.keypad')
    for d in PC: await pg.click(f'.keypad [data-d="{d}"]')
    await pg.wait_for_selector('#shell', timeout=20000); await pg.wait_for_timeout(900)

async def sheet_titles(pg):
    return [t.strip() for t in await pg.locator('.upd-item b').all_text_contents()]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True); await add_mocks(ctx)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await setup(pg)
        info = await pg.evaluate("({n: CHANGES.length, w: writtenChanges().length, last: lastChangeN(), lastV: writtenChanges().pop().version})")
        check('change log loaded oldest first', await pg.evaluate("CHANGES.every((c, i) => !i || CHANGES[i - 1].at <= c.at)"))
        check('no What\'s new for a brand-new vault', await pg.locator('.upd').count() == 0)
        # roles
        check('everyday users have no Admin page', await pg.locator('.side-nav [data-v="admin"]').count() == 0)
        await pg.evaluate("S.tab = 'admin'; renderApp()")
        check('Admin page falls back to Settings for everyday users', await pg.locator('.admin-page').count() == 0)
        await pg.click('[data-act="role"][data-v="admin"]'); await pg.wait_for_timeout(200)
        check('role is saved in the vault', await pg.evaluate("V().profile.role") == 'admin')
        await pg.click('.side-nav [data-v="admin"]'); await pg.wait_for_selector('.admin-page')
        # the log
        shown = lambda: pg.locator('.log-item').count()
        check('Admin page lists every change', await shown() == info['n'])
        first = await pg.locator('.log-item b').first.text_content()
        await pg.click('[data-act="lg-order"][data-v="new"]')
        check('newest first reverses the order', await pg.locator('.log-item b').last.text_content() == first)
        await pg.click('[data-act="lg-order"][data-v="old"]')
        await pg.click('[data-act="lg-aud"][data-v="admin"]')
        check('Admins filter shows only admin changes', await pg.locator('.log-item .pill.all').count() == 0 and 0 < await shown() < info['n'])
        await pg.click('[data-act="lg-aud"][data-v="all"]')
        await pg.uncheck('#lg-auto')
        check('automatic entries can be hidden', await shown() == info['w'] and await pg.locator('.log-item.auto').count() == 0)
        await pg.check('#lg-auto')
        await pg.click('[data-act="lg-type"][data-v="added"]')
        check('kinds of change can be hidden', await pg.locator('.log-item.t-added').count() == 0)
        await pg.click('[data-act="lg-type"][data-v="added"]')
        await pg.fill('#lg-q', 'emergency'); await pg.wait_for_timeout(100)
        check('search finds emergency kits', await shown() >= 1 and 'Emergency' in (await pg.locator('.log-item b').first.text_content()))
        await pg.fill('#lg-q', ''); await pg.wait_for_timeout(100)
        for kind, needle in (('json', '"entries"'), ('csv', 'date_time,version,type'), ('md', '# Vaultleaf change log')):
            async with pg.expect_download() as dl:
                await pg.click(f'[data-act="lg-dl"][data-v="{kind}"]')
            path = await (await dl.value).path()
            body = open(path, encoding='utf-8').read()
            check(f'download as {kind.upper()} has every change', needle in body and (kind != 'json' or len(json.loads(body)['entries']) == info['n']))
        # preview does not mark anything seen
        await pg.evaluate("V().meta.seenChange = 1")
        await pg.click('[data-act="adm-preview"][data-v="everyone"]'); await pg.wait_for_selector('.upd')
        check('preview as everyone hides admin changes', await pg.locator('.upd .pill.adm').count() == 0 and 'Preview' in await pg.text_content('.tour-crumb'))
        await pg.click('.tour-foot [data-act="tour-close"]')
        await pg.click('[data-act="adm-preview"][data-v="admin"]'); await pg.wait_for_selector('.upd')
        check('preview as an admin includes admin changes', await pg.locator('.upd .pill.adm').count() > 0)
        await pg.click('.tour-foot [data-act="tour-close"]')
        check('previews leave What\'s new untouched', await pg.evaluate("V().meta.seenChange") == 1)
        # What's new on unlock: an admin who last saw 1.1
        await pg.evaluate("V().meta.seenChange = writtenChanges().filter(c => c.version === '1.1').pop().n")
        await relock(pg)
        await pg.wait_for_selector('.upd', timeout=5000)
        t = await sheet_titles(pg)
        check('admin sees What\'s new after unlocking', len(t) > 0)
        check('it includes admin changes', 'Admin page with the change log' in t)
        check('it leaves out what they already saw', 'Sync between devices' not in t)
        check('it has pictures', await pg.locator('.upd-thumb img').count() > 0)
        await pg.click('.tour-foot [data-act="tour-close"]'); await pg.wait_for_timeout(200)
        check('Got it marks everything seen', await pg.evaluate("V().meta.seenChange") == info['last'])
        await relock(pg)
        check('no What\'s new on the next unlock', await pg.locator('.upd').count() == 0)
        # an everyday user who last saw 1.1 doesn't see admin changes
        await pg.evaluate("V().profile.role = 'member'; V().profile.updatedAt = now(); V().meta.seenChange = writtenChanges().filter(c => c.version === '1.1').pop().n")
        await relock(pg)
        await pg.wait_for_selector('.upd', timeout=5000)
        t = await sheet_titles(pg)
        check('everyday users see changes for everyone', 'Choose your role' in t and 'Guided tour' in t)
        check('but no admin changes', 'Admin page with the change log' not in t and await pg.locator('.upd .pill.adm').count() == 0)
        await pg.click('.upd-item [data-act="upd-show"] >> nth=0'); await pg.wait_for_selector('.tour-fig')
        check('Show me opens the tour at that feature', await pg.locator('#tour-title').count() == 1)
        await pg.keyboard.press('Escape')
        check('Show me also marks What\'s new seen', await pg.evaluate("V().meta.seenChange") == info['last'])
        # only admin changes new: an everyday user isn't interrupted
        await pg.evaluate("V().meta.seenChange = writtenChanges().filter(c => c.audience === 'everyone').pop().n")
        only_admin_after = await pg.evaluate("writtenChanges().filter(c => c.n > V().meta.seenChange).every(c => c.audience === 'admin')")
        await relock(pg)
        if only_admin_after:
            check('admin-only changes don\'t interrupt everyday users', await pg.locator('.upd').count() == 0)
            check('and are marked seen', await pg.evaluate("V().meta.seenChange") == info['last'])
        # carry over what this device saw of the tour before the change log existed
        await pg.evaluate("V().meta.seenChange = 0; localStorage.setItem('vaultleaf.seen', JSON.stringify('1.2'))")
        await relock(pg)
        await pg.wait_for_selector('.upd', timeout=5000)
        t = await sheet_titles(pg)
        check('a device that saw 1.2 only hears about 1.3', 'Choose your role' in t and 'Guided tour' not in t)
        await pg.click('.tour-foot [data-act="tour-close"]')
        # seen is the furthest any device got
        check('devices keep the furthest seen change when syncing', await pg.evaluate("mergeVaults(V(), {...V(), meta:{...V().meta, seenChange:2}}).meta.seenChange") == info['last'])
        # moving from the old address
        check('no move banner while the new address isn\'t reachable', await pg.locator('.move-banner').count() == 0)
        await pg.route('https://vaultleaf.mkcworkspace.com/**', lambda r: r.fulfill(status=200, body='{}'))
        await pg.evaluate("window.__vlHost = OLD_HOST; S.moveChecked = false; checkNewAddress()")
        await pg.wait_for_selector('#list .move-banner', timeout=5000)
        check('old address shows the move banner once the new one works', True)
        await pg.click('#list .move-banner [data-act="move"]'); await pg.wait_for_selector('.move-steps')
        check('with sync on, move steps show the sync code', await pg.locator('.move-steps .rk').count() == 1)
        await pg.click('.modal [data-act="mclose"]')
        await pg.evaluate("V().settings.sync = false"); await pg.click('#list .move-banner [data-act="move"]'); await pg.wait_for_selector('.move-steps')
        check('with sync off, move steps offer to turn it on, or a backup', await pg.locator('[data-act="move-sync"]').count() == 1 and await pg.locator('.move-steps [data-act="m-backup"]').count() == 1)
        check('and link to the new address', await pg.get_attribute('.move-steps a', 'href') == 'https://vaultleaf.mkcworkspace.com/')
        await pg.click('.modal [data-act="mclose"]'); await pg.evaluate("V().settings.sync = true")
        await pg.click('#list .move-banner [data-act="move-later"]')
        check('Later hides the banner for now', await pg.locator('.move-banner').count() == 0)
        check('no page errors', not errs); errs and print(errs[:5])
        await ctx.close()
        # the new address: the setup screen points movers to their sync code or backup
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); await add_mocks(ctx)
        await ctx.add_init_script("window.__vlHost = 'vaultleaf.mkcworkspace.com'")
        pg = await ctx.new_page(); await pg.goto(U); await pg.wait_for_selector('#s-name', timeout=20000)
        txt = await pg.text_content('.auth-card')
        check('new address tells movers not to start over', 'mco-vault-leaf.vercel.app' in txt and 'sync code' in txt)
        await setup(pg)
        await pg.evaluate("V().meta.seenChange = writtenChanges().filter(c => c.version === '1.1').pop().n")
        await relock(pg); await pg.wait_for_selector('.upd', timeout=5000)
        card = await pg.locator('.tour-card').bounding_box(); foot = await pg.locator('.tour-foot').bounding_box()
        check('What\'s new fills a phone screen with its buttons in reach', card['width'] == 390 and foot['y'] + foot['height'] <= 844)
        await pg.screenshot(path='/tmp/vl-updates-phone.png')
        await ctx.close(); await b.close()
    print(f'\n{len(ok)} passed, {len(bad)} failed'); sys.exit(1 if bad else 0)
asyncio.run(main())
