"""Capture guide screenshots from the real web build, with element boxes for numbered callouts."""
import asyncio, json, io, pathlib
from playwright.async_api import async_playwright
from PIL import Image

U = 'http://127.0.0.1:8765/'
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'guide' / 'img'; OUT.mkdir(parents=True, exist_ok=True)
META = {}
PW = 'Copper-Lantern-Meadow-42'; PC = '135790'

async def shot(pg, name, marks=(), clip=None, q=80):
    await pg.evaluate("document.getElementById('toasts').innerHTML=''")
    await pg.wait_for_timeout(250)
    vp = pg.viewport_size
    if clip:
        el = pg.locator(clip).first
        box = await el.bounding_box()
        png = await el.screenshot()
    else:
        box = {'x': 0, 'y': 0, 'width': vp['width'], 'height': vp['height']}
        png = await pg.screenshot()
    im = Image.open(io.BytesIO(png)).convert('RGB')
    im.save(OUT / f'{name}.webp', 'WEBP', quality=q, method=6)
    out = []
    for m in marks:
        sel, n, label = m[0], m[1], m[2]
        loc = pg.locator(sel).first
        try:
            b = await loc.bounding_box(timeout=2000)
        except Exception:
            b = None
        if not b:
            print('  !! no box for', name, sel); continue
        pad = m[3] if len(m) > 3 else 4
        x = max(b['x'] - pad, box['x']); y = max(b['y'] - pad, box['y'])
        x2 = min(b['x'] + b['width'] + pad, box['x'] + box['width']); y2 = min(b['y'] + b['height'] + pad, box['y'] + box['height'])
        out.append({'n': n, 'label': label, 'x': round((x - box['x']) / box['width'] * 100, 2), 'y': round((y - box['y']) / box['height'] * 100, 2),
                    'w': round((x2 - x) / box['width'] * 100, 2), 'h': round((y2 - y) / box['height'] * 100, 2)})
    META[name] = {'w': im.width, 'h': im.height, 'marks': out}
    print('shot', name, im.size, len(out), 'marks')

async def setup(pg, name='Alex Morgan', email='alex@example.com', snap=None):
    await pg.goto(U); await pg.wait_for_selector('#s-name', timeout=20000)
    await pg.fill('#s-name', name); await pg.fill('#s-email', email)
    if snap: await shot(pg, snap + '_1', [('#s-name', 1, 'Name'), ('[data-act="s-restore"]', 2, 'Restore')])
    await pg.click('[data-act="s-next"]')
    await pg.fill('#s-pw', PW); await pg.fill('#s-pw2', PW)
    if snap: await shot(pg, snap + '_2', [('#s-pw', 1, 'Password'), ('.meter', 2, 'Strength'), ('[data-act="s-suggest"]', 3, 'Suggest')])
    await pg.click('[data-act="s-next"]'); await pg.wait_for_selector('.keypad')
    for d in PC[:3]: await pg.click(f'.keypad [data-d="{d}"]')
    if snap: await shot(pg, snap + '_3', [('.seg', 1, 'Length'), ('.pins', 2, 'Dots'), ('.keypad', 3, 'Keypad')])
    for d in PC[3:]: await pg.click(f'.keypad [data-d="{d}"]')
    await pg.wait_for_timeout(200)
    for d in PC: await pg.click(f'.keypad [data-d="{d}"]')
    await pg.wait_for_selector('#rk', timeout=20000)
    await pg.check('#s-saved')
    if snap: await shot(pg, snap + '_4', [('#rk', 1, 'Key'), ('[data-act="s-rkcopy"]', 2, 'Copy'), ('#s-saved', 3, 'Confirm', 8), ('[data-act="s-finish"]', 4, 'Open')])
    await pg.click('[data-act="s-finish"]'); await pg.wait_for_selector('#shell', timeout=20000)
    await pg.wait_for_timeout(400)

async def stage(pg):
    """Add realistic accounts and history, then clear the example flags so the banner doesn't show."""
    await pg.evaluate("""() => {
      const t = now(), D = 864e5;
      const items = [
        textToAccount('GitHub\\nAccount: Personal\\nWebsite: github.com\\nUsername: alexmorgan\\nEmail: alex@example.com\\nPassword: ' + genPassword({len:20,lower:true,upper:true,digits:true,symbols:true}).value + '\\nRecovery codes: 8f2k-1m9d 3j7q-p0x2 77ab-c4e1\\nLabels: Work/Dev'),
        textToAccount('Spotify\\nAccount: Duo plan\\nEmail: alex@example.com\\nPassword: sunshine2019\\nLabels: Streaming\\n\\nNotes:\\nShared with Sam.'),
        textToAccount('Chase bank\\nAccount: Joint checking\\nWebsite: chase.com\\nUsername: amorgan77\\nPassword: ' + genPassword({len:18,lower:true,upper:true,digits:true,symbols:true}).value + '\\nPIN: 4455\\nQ: Street you grew up on?\\nA: Elm\\nAdmin: Sam Morgan <sam@example.com> (Joint owner)\\nLabels: Finance/Banks\\n\\nNotes:\\nCard ending 4821. Call 1-800 number on the card if locked.'),
        textToAccount('Google Workspace\\nAccount: Company admin\\nWebsite: admin.google.com\\nUsername: it-admin@acme.example\\nPassword: ' + genPassword({len:22,lower:true,upper:true,digits:true,symbols:true}).value + '\\n2FA: JBSWY3DPEHPK3PXP\\nAdmin: Dana Ruiz <dana@acme.example> (Super admin)\\nAdmin: Lee Chen <lee@acme.example> (Billing)\\nLabels: Work/Admin\\nChange every: 90 days')
      ];
      items.forEach((it, i) => { const a = commitAccount(it, true, true); a.createdAt = t - (3 + i * 9) * D; a.updatedAt = t - (1 + i * 4) * D; a.pwChangedAt = a.createdAt; a.copies = [{id:uid(), at:t - (i + 1) * 3600e3, field:'Password'}, {id:uid(), at:t - (i + 1) * 3600e3 - 30e3, field:'Username'}]; a.lastCopiedAt = a.copies[0].at; });
      V().accounts.forEach(a => { a.example = false; });
      V().labels.forEach(l => { l.example = false; });
      const sp = V().accounts.find(a => a.tool === 'Spotify'); sp.createdAt = sp.pwChangedAt = t - 500 * D;
      const nf = V().accounts.find(a => a.tool === 'Netflix'); nf.fav = true;
      hayCache = new WeakMap(); persist(); renderApp();
    }""")
    await pg.wait_for_timeout(300)

async def desktop(b):
    ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1.5)
    await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    pg = await ctx.new_page()
    await setup(pg)
    await stage(pg)
    # main tour
    await pg.click('.card:has-text("AWS")'); await pg.wait_for_timeout(1300)
    await pg.evaluate("document.getElementById('list').scrollTop = 0")
    await shot(pg, 'd_main', [('.side-nav', 1, 'Sections'), ('#side .side-lbl[data-v="all"]', 2, 'Labels'), ('.search', 3, 'Search'), ('#ltActs .seg', 4, 'View'), ('#ltActs [data-act="lock"]', 5, 'Lock', 2), ('.add-btn', 6, 'Add'),
                              ('.card .quick', 7, 'Quick copy', 2), ('#detail .d-body', 8, 'Open account', -2), ('#sort', 9, 'Sort', 2), ('.side-foot', 10, 'Status')])
    await shot(pg, 'd_detail', [('.d-top [data-act="fav"]', 1, 'Pin', 2), ('.d-top [data-act="edit"]', 2, 'Edit', 2), ('.d-top [data-act="more"]', 3, 'More', 2), ('.frow[data-k="url"] a', 4, 'Open site', 2),
                                ('.frow[data-k="password"] .fl', 5, 'Strength', 2), ('.frow[data-k="password"] [data-act="reveal"]', 6, 'Show', 2), ('.frow[data-k="password"] .fa button[data-act="copy"]', 7, 'Copy', 2), ('[data-totp]', 8, '2FA', 6)], clip='#detail')
    await pg.click('.frow[data-k="password"] [data-act="reveal"]'); await pg.wait_for_timeout(200)
    await shot(pg, 'd_revealed', [('.frow[data-k="password"] .fv', 1, 'Shown')], clip='.frow[data-k="password"]', q=88)
    await pg.evaluate("document.getElementById('detail').scrollTop = 99999"); await pg.wait_for_timeout(200)
    await pg.click('[data-act="dtab"][data-v="secrets"]'); await pg.wait_for_timeout(200)
    await pg.evaluate("document.getElementById('detail').scrollTop = 99999"); await pg.wait_for_timeout(200)
    await shot(pg, 'd_history', [('.meta-grid', 1, 'Record'), ('[data-act="dtab"][data-v="changes"]', 2, 'Changes', 2), ('[data-act="dtab"][data-v="secrets"]', 3, 'Old values', 2), ('[data-act="dtab"][data-v="copies"]', 4, 'Copies', 2)], clip='#detail')
    # classic
    await pg.click('#ltActs [data-v="classic"]'); await pg.wait_for_timeout(300)
    await pg.click('.note-row:has-text("Chase bank")'); await pg.wait_for_timeout(300)
    await shot(pg, 'd_classic', [('#side .side-lbl[data-v="all"]', 1, 'Folders'), ('.group-h', 2, 'Date groups'), ('.note-row[aria-current="true"]', 3, 'Note'), ('.paper .when', 4, 'Stored'),
                                 ('.paper .nline:has(.v.secret)', 5, 'Hidden value', 2), ('.paper .nline .acts', 6, 'Copy', 2)])
    await pg.click('.d-top [data-act="edit"]'); await pg.wait_for_selector('#ce'); await pg.wait_for_timeout(200)
    await shot(pg, 'd_classic_edit', [('#ce', 1, 'Type'), ('[data-act="ed-insertpw"]', 2, 'Insert password', 2), ('[data-act="ed-kind"]', 3, 'Form', 2), ('.d-top [data-act="ed-save"]', 4, 'Save', 2), ('.cheat', 5, 'Cheat sheet')], clip='#detail')
    await pg.click('.d-top [data-act="ed-cancel"]'); await pg.wait_for_timeout(200)
    if await pg.locator('[data-act="m-ok"]').count(): await pg.click('[data-act="m-ok"]')
    await pg.click('#ltActs [data-v="modern"]'); await pg.wait_for_timeout(200)
    # templates + editor
    await pg.click('#ltActs [data-act="new"]'); await pg.wait_for_selector('.menu')
    await shot(pg, 'd_templates', [('[data-act="tpl"][data-v="login"]', 1, 'Login'), ('[data-act="tpl"][data-v="wallet"]', 2, 'Wallet'), ('[data-act="tpl"][data-v="note"]', 3, 'Note'), ('.menu [data-act="import-notes"]', 4, 'Import')], clip='.modal')
    await pg.click('[data-act="tpl"][data-v="email"]'); await pg.wait_for_selector('#ed-tool')
    await pg.fill('#ed-tool', 'Outlook'); await pg.fill('#ed-accountName', 'Personal mail'); await pg.fill('#ed-email', 'alex@outlook.example')
    await pg.click('[data-act="ed-gen"][data-p="password"]'); await pg.wait_for_timeout(200)
    await shot(pg, 'd_editor', [('#ed-tool', 1, 'Name'), ('#ed-accountName', 2, 'Account name'), ('#ed-created', 3, 'Date stored'), ('#ed-password', 4, 'Password'), ('[data-act="ed-gen"][data-p="password"]', 5, 'Generate', 2), ('#ed-meter', 6, 'Strength', 6)], clip='#detail')
    await pg.evaluate("document.getElementById('detail').scrollTop = document.querySelector('.addbar').offsetTop - 220"); await pg.wait_for_timeout(200)
    await pg.click('[data-act="ed-addrow"][data-list="admins"]'); await pg.fill('[data-bind="admins.0.name"]', 'Jordan Lee'); await pg.fill('[data-bind="admins.0.email"]', 'jordan@example.com'); await pg.fill('[data-bind="admins.0.role"]', 'Family admin')
    await pg.evaluate("document.getElementById('detail').scrollTop = document.querySelector('.addbar').offsetTop - 160"); await pg.wait_for_timeout(200)
    await shot(pg, 'd_editor2', [('.addbar', 1, 'Add a field'), ('[data-act="ed-addrow"][data-list="qa"]', 2, 'Questions', 2), ('[data-act="ed-addrow"][data-list="admins"]', 3, 'Admins', 2), ('.rowcard:has([data-bind="admins.0.name"])', 4, 'Admin row')], clip='#detail')
    await pg.evaluate("document.getElementById('detail').scrollTop = 99999"); await pg.wait_for_timeout(200)
    await shot(pg, 'd_editor3', [('.labelpick', 1, 'Labels'), ('#ed-newlabel', 2, 'New label'), ('#ed-rot', 3, 'Reminder'), ('.ed-foot [data-act="ed-save"]', 4, 'Save', 2)], clip='#detail')
    await pg.click('.ed-foot [data-act="ed-save"]'); await pg.wait_for_timeout(300)
    # import
    await pg.click('.side-nav [data-v="settings"]'); await pg.wait_for_timeout(200)
    await pg.click('.page [data-act="import-notes"]'); await pg.wait_for_selector('#in-text')
    await pg.fill('#in-text', 'Amazon\nuser: alex@example.com\npass: Pr1me-Day-2024\n---\nVerizon\nAccount: Family plan\nPIN: 0921\nAdmin: Alex <alex@example.com>\nNotes: account # 4400-1122')
    await pg.wait_for_timeout(400)
    await shot(pg, 'd_import', [('#in-text', 1, 'Paste'), ('.modal .seg', 2, 'Separator'), ('#in-label', 3, 'Label'), ('.preview-list', 4, 'Preview'), ('#in-go', 5, 'Import', 2)], clip='.modal')
    await pg.click('[data-act="mclose"]')
    # labels
    await pg.click('#side [data-act="label-new"]'); await pg.wait_for_selector('#lb-name'); await pg.fill('#lb-name', 'Taxes'); await pg.select_option('#lb-parent', label='Finance')
    await shot(pg, 'd_label', [('#lb-name', 1, 'Name'), ('#lb-parent', 2, 'Inside'), ('.swatches', 3, 'Color')], clip='.modal')
    await pg.click('[data-act="mclose"]')
    # pages
    await pg.click('.side-nav [data-v="generator"]'); await pg.wait_for_timeout(300)
    await shot(pg, 'd_generator', [('#gen-out', 1, 'Result'), ('#gen-meta', 2, 'Strength'), ('[data-act="gen-new"]', 3, 'New', 2), ('[data-act="gen-copy"]', 4, 'Copy', 2), ('[data-act="gen-use"]', 5, 'Use', 2), ('.page .seg', 6, 'Kind'), ('#g-len', 7, 'Length', 8)])
    await pg.click('.side-nav [data-v="health"]'); await pg.wait_for_timeout(300)
    await shot(pg, 'd_health', [('.score-dial', 1, 'Score'), ('.stat-row', 2, 'Counts'), ('.page .hrow', 3, 'Fix this')])
    await pg.click('.side-nav [data-v="activity"]'); await pg.wait_for_timeout(300)
    await shot(pg, 'd_activity', [('.page .seg', 1, 'Filter'), ('.page .log li', 2, 'Event'), ('.page .log li .when', 3, 'Time', 2)])
    await pg.click('.side-nav [data-v="settings"]'); await pg.wait_for_timeout(300)
    await shot(pg, 'd_settings', [('.page > .banner', 1, 'Guide'), ('#p-name', 2, 'Profile'), ('[data-act="m-chpw"]', 3, 'Password', 2), ('[data-act="m-chpc"]', 4, 'Passcode', 2), ('[data-act="m-newrk"]', 5, 'Recovery key', 2), ('#set-settings-autoLockMin', 6, 'Auto-lock', 2)])
    await pg.evaluate("document.getElementById('page').scrollTop = document.querySelector('[data-act=\"m-backup\"]').closest('.panel').offsetTop - 120"); await pg.wait_for_timeout(200)
    await shot(pg, 'd_settings2', [('[data-act="m-backup"]', 1, 'Back up', 2), ('[data-act="m-restore"]', 2, 'Restore', 2), ('.page [data-act="import-notes"]', 3, 'Import notes', 2), ('[data-act="import-csv"]', 4, 'Import CSV', 2), ('[data-act="m-export"]', 5, 'Export', 2)])
    await pg.evaluate("document.getElementById('page').scrollTop = document.querySelector('.labels-tree').closest('.panel').offsetTop - 260"); await pg.wait_for_timeout(200)
    await shot(pg, 'd_settings3', [('.page [data-act="theme"][data-v="auto"]', 1, 'Theme', 2), ('.labels-tree', 2, 'Labels'), ('.labels-tree [data-act="label-edit"]', 3, 'Edit label', 2)])
    await pg.click('[data-act="m-chpw"]'); await pg.wait_for_selector('#cp-pw')
    await shot(pg, 'd_chpw', [('#cp-pw', 1, 'Current'), ('#cp-pc', 2, 'Passcode'), ('#cp-new', 3, 'New')], clip='.modal')
    await pg.click('[data-act="mclose"]')
    await pg.click('[data-act="m-backup"]'); await pg.wait_for_selector('[data-act="bk-copy"]')
    await shot(pg, 'd_backup', [('[data-act="bk-dl"]', 1, 'Download', 2), ('[data-act="bk-copy"]', 2, 'Copy', 2)], clip='.modal')
    await pg.click('[data-act="mclose"]')
    await pg.click('[data-act="m-restore"]'); await pg.wait_for_selector('#rs-file')
    await shot(pg, 'd_restore', [('#rs-file', 1, 'File'), ('#rs-text', 2, 'Or paste'), ('.modal .seg', 3, 'Unlock with'), ('#rs-creds', 4, 'Credentials')], clip='.modal')
    await pg.click('[data-act="mclose"]')
    # trash
    await pg.click('.side-nav [data-v="vault"]'); await pg.click('.card:has-text("Outlook")'); await pg.wait_for_timeout(200)
    await pg.click('.d-top [data-act="more"]'); await pg.wait_for_selector('.menu')
    await shot(pg, 'd_more', [('.menu [data-kind="note"]', 1, 'Edit as note'), ('.menu [data-act="dup"]', 2, 'Duplicate'), ('.menu [data-act="trash"]', 3, 'Delete')], clip='.modal')
    await pg.click('.menu [data-act="trash"]'); await pg.wait_for_timeout(200)
    await pg.click('#side .side-lbl[data-v="trash"]'); await pg.click('.card:has-text("Outlook")'); await pg.wait_for_timeout(200)
    await shot(pg, 'd_trash', [('#side .side-lbl[data-v="trash"]', 1, 'Recently deleted'), ('[data-act="restore"]', 2, 'Restore', 2), ('[data-act="purge"]', 3, 'Delete forever', 2)])
    await pg.click('[data-act="restore"]')
    # dark
    await pg.click('.side-nav [data-v="settings"]'); await pg.click('.page [data-act="theme"][data-v="dark"]')
    await pg.click('.side-nav [data-v="vault"]'); await pg.click('.card:has-text("Google Workspace")'); await pg.wait_for_timeout(1300)
    await shot(pg, 'd_dark')
    await pg.click('.side-nav [data-v="settings"]'); await pg.click('.page [data-act="theme"][data-v="auto"]')
    # guide embed (taken later once guide exists)
    await ctx.close()

async def phone(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    await setup(pg, snap='p_setup')
    await stage(pg)
    await shot(pg, 'p_list', [('.search', 1, 'Search'), ('#chips', 2, 'Labels'), ('#ltActs .seg', 3, 'View', 2), ('#ltActs [data-act="lock"]', 4, 'Lock', 2), ('.card .quick', 5, 'Quick copy', 2), ('.fab', 6, 'Add', 2), ('#bnav', 7, 'Sections', 0)])
    await pg.tap('.card:has-text("Ledger")'); await pg.wait_for_timeout(300)
    await pg.tap('.frow:has-text("Secret phrase") [data-act="reveal"]'); await pg.wait_for_timeout(200)
    await shot(pg, 'p_detail', [('[data-act="close-detail"]', 1, 'Back', 2), ('.words', 2, 'Phrase grid'), ('.frow:has-text("Secret phrase") .fa', 3, 'Hide or copy', 2)])
    await pg.tap('[data-act="close-detail"]')
    await pg.tap('#ltActs [data-v="classic"]'); await pg.wait_for_timeout(200)
    await shot(pg, 'p_classic', [('#list .group-h >> nth=1', 1, 'Date group'), ('#list .note-row >> nth=1', 2, 'Note')])
    await pg.tap('.note-row:has-text("Home Wi-Fi")'); await pg.wait_for_timeout(300)
    await shot(pg, 'p_note', [('.paper h2', 1, 'Name'), ('.paper .nline:has(.v.secret)', 2, 'Tap to show', 2)])
    await pg.tap('[data-act="close-detail"]'); await pg.tap('#ltActs [data-v="modern"]')
    await pg.tap('#bnav [data-v="health"]'); await pg.wait_for_timeout(300)
    await shot(pg, 'p_health')
    await pg.tap('#bnav [data-v="settings"]'); await pg.wait_for_timeout(300)
    await shot(pg, 'p_settings', [('.page [data-act="lock"]', 1, 'Lock', 2), ('.page > .banner', 2, 'Guide')])
    await pg.tap('.page [data-act="lock"]')
    await pg.wait_for_selector('#l-pw'); await pg.fill('#l-pw', PW)
    await shot(pg, 'p_login1', [('#l-pw', 1, 'Password'), ('[data-act="go-recover"]', 2, 'Forgot', 2)])
    await pg.press('#l-pw', 'Enter'); await pg.wait_for_selector('.keypad')
    for d in PC[:2]: await pg.tap(f'.keypad [data-d="{d}"]')
    await shot(pg, 'p_login2', [('.pins', 1, 'Digits'), ('.keypad', 2, 'Keypad'), ('[data-act="l-back"]', 3, 'Back', 2)])
    await pg.tap('[data-act="l-back"]'); await pg.wait_for_selector('[data-act="go-recover"]')
    await pg.tap('[data-act="go-recover"]'); await pg.fill('#r-key', 'NKWD-XPEJ-WKPC-W3PE-DOBE-UPVI-QHGO-K37V')
    await shot(pg, 'p_recover', [('#r-key', 1, 'Key'), ('[data-act="r-go"]', 2, 'Check', 2)])
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await desktop(b)
        await phone(b)
        await b.close()
    (ROOT / 'tools' / 'shots.json').write_text(json.dumps(META, indent=1))
    total = sum(f.stat().st_size for f in OUT.glob('*.webp'))
    print('total images', len(list(OUT.glob('*.webp'))), round(total / 1024), 'KB')
asyncio.run(main())
