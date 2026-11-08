"""New features end to end: sync between devices (mock Supabase with the same rules as the SQL functions),
encrypted files, leak check (mock HIBP), Face ID/fingerprint (virtual authenticator with PRF), emergency kit."""
import asyncio, hashlib, json, re, io
from playwright.async_api import async_playwright
from PIL import Image

U = 'http://localhost:8765/'
PW, PC = 'Copper-Lantern-Meadow-42', '135790'
SUPA = 'https://symbmscaajjmgywbifhv.supabase.co/rest/v1/rpc/'
V, B = {}, {}   # vaults: id -> {th, header, meta}; blobs: (id, name, part) -> data
CALLS = []
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()

def rpc(fn, a):
    i, t = a.get('p_id'), a.get('p_token')
    ok = i in V and V[i]['th'] == sha(t or '')
    if fn == 'vaultleaf_head':
        if not ok: return None
        files = {}
        for (vid, name, part) in B:
            if vid == i and name.startswith('f-'): files[name[2:]] = files.get(name[2:], 0) + 1
        return {'header': V[i]['header'], 'meta': V[i]['meta'], 'files': files}
    if fn == 'vaultleaf_blob_get':
        if not ok: return None
        parts = sorted((k[2], d) for k, d in B.items() if k[0] == i and k[1] == a['p_name'])
        return ''.join(d for _, d in parts) if parts else None
    if fn == 'vaultleaf_blob_put':
        if not ok: return False
        assert len(a['p_data']) <= 1100000 and re.fullmatch(r'(b|f)-[a-z0-9]{6,40}', a['p_name']), a['p_name']
        B[(i, a['p_name'], a['p_part'])] = a['p_data']; return True
    if fn == 'vaultleaf_blob_delete':
        if not ok: return False
        for k in [k for k in B if k[0] == i and k[1] == a['p_name']]: del B[k]
        return True
    if fn == 'vaultleaf_commit':
        rev = a['p_meta'].get('rev')
        assert rev and re.fullmatch(r'[a-z0-9]{6,40}', rev), rev
        if a['p_create'] and i not in V:
            V[i] = {'th': sha(t), 'header': a['p_header'], 'meta': a['p_meta']}; return {'ok': True, 'created': True}
        if not ok: return {'error': 'not_found'}
        cur = V[i]['meta'].get('rev')
        if a['p_base_rev'] != cur and cur is not None: return {'conflict': True, 'meta': V[i]['meta']}
        V[i]['header'], V[i]['meta'] = a['p_header'], a['p_meta']
        for k in [k for k in B if k[0] == i and k[1].startswith('b-') and k[1] != 'b-' + rev]: del B[k]
        return {'ok': True}
    if fn == 'vaultleaf_drop':
        if not ok: return False
        del V[i]
        for k in [k for k in B if k[0] == i]: del B[k]
        return True
    raise Exception('unknown ' + fn)

LEAKED = 'sunshine2019'
async def supa_route(route):
    req = route.request
    if req.method == 'OPTIONS': return await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
    fn = req.url.split('/rpc/')[1]
    CALLS.append(fn)
    res = rpc(fn, json.loads(req.post_data or '{}'))
    await route.fulfill(status=200, body=json.dumps(res), headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
async def hibp_route(route):
    pre = route.request.url.rsplit('/', 1)[1]
    h = hashlib.sha1(LEAKED.encode()).hexdigest().upper()
    lines = ['0000000000000000000000000000000000A:0', '1111111111111111111111111111111111B:3']
    if pre == h[:5]: lines.append(h[5:] + ':1234')
    await route.fulfill(status=200, body='\r\n'.join(lines), headers={'content-type': 'text/plain', 'access-control-allow-origin': '*'})

async def device(b, mobile=False, webauthn=False):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 820}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    await ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:8765')
    await ctx.route(SUPA + '**', supa_route)
    await ctx.route('https://api.pwnedpasswords.com/**', hibp_route)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    if webauthn:
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('WebAuthn.enable', {'enableUI': False})
        await cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {'protocol': 'ctap2', 'ctap2Version': 'ctap2_1', 'transport': 'internal', 'hasResidentKey': True,
            'hasUserVerification': True, 'isUserVerified': True, 'hasPrf': True, 'automaticPresenceSimulation': True}})
    return ctx, pg, errs

async def keypad(pg, digits):
    for d in digits: await pg.click(f'.keypad [data-d="{d}"]')

async def setup(pg, sync=True):
    await pg.goto(U); await pg.wait_for_selector('#s-name', timeout=20000)
    await pg.fill('#s-name', 'Alex Morgan'); await pg.click('[data-act="s-next"]')
    await pg.fill('#s-pw', PW); await pg.fill('#s-pw2', PW); await pg.click('[data-act="s-next"]')
    await keypad(pg, PC); await pg.wait_for_timeout(150); await keypad(pg, PC)
    await pg.wait_for_selector('#rk', timeout=20000); await pg.check('#s-saved')
    if not sync: await pg.uncheck('[data-sf="sync"]')
    await pg.click('[data-act="s-finish"]'); await pg.wait_for_selector('#shell', timeout=20000)

async def unlock(pg, pw=PW, pc=PC):
    await pg.wait_for_selector('#l-pw', timeout=20000); await pg.fill('#l-pw', pw); await pg.press('#l-pw', 'Enter')
    await pg.wait_for_selector('.keypad'); await keypad(pg, pc); await pg.wait_for_selector('#shell', timeout=20000)

async def names(pg):
    return sorted(await pg.evaluate("V().accounts.filter(a=>!a.trashedAt).map(a=>a.tool + (a.accountName ? ' / ' + a.accountName : ''))"))

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: check.failed = True

async def main():
    img = Image.new('RGB', (320, 200), (29, 91, 68)); buf = io.BytesIO(); img.save(buf, 'PNG'); open('/tmp/id-scan.png', 'wb').write(buf.getvalue())
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- device A: set up with sync ----------
        ca, A, ea = await device(b, webauthn=True)
        await setup(A, sync=True)
        await A.wait_for_selector('.modal .rk', timeout=15000)
        code = (await A.inner_text('.modal .rk')).replace('\n', '').strip()
        check(re.fullmatch(r'([A-Z2-7]{4}-){7}[A-Z2-7]{4}', code) is not None, 'sync code shown after setup: ' + code)
        await A.screenshot(path='/tmp/vl-test-f_synccode.png')
        await A.click('.modal [data-act="mclose"]')
        await A.wait_for_timeout(1500)
        check(len(V) == 1 and any(k[1].startswith('b-') for k in B), f'vault uploaded (vaults={len(V)}, blobs={len(B)})')
        check('Netflix' not in json.dumps(V) + json.dumps(list(B.values())), 'nothing readable stored on the server')
        # file on Netflix
        await A.click('.card:has-text("Netflix")'); await A.wait_for_timeout(300)
        await A.set_input_files('input[data-acc]', '/tmp/id-scan.png'); await A.wait_for_timeout(1200)
        check(await A.locator('[data-act="file-open"]').count() == 1, 'file row appears')
        await A.click('[data-act="file-open"]'); await A.wait_for_selector('.file-img', timeout=5000)
        nat = await A.evaluate("document.querySelector('.file-img').naturalWidth")
        check(nat == 320, f'file opens decrypted (width {nat})')
        await A.screenshot(path='/tmp/vl-test-f_fileview.png'); await A.click('[data-act="mclose"]')
        await A.evaluate("document.getElementById('detail').scrollTop = 99999"); await A.wait_for_timeout(200)
        await A.screenshot(path='/tmp/vl-test-f_files.png')
        await A.wait_for_timeout(2500)
        check(any(k[1].startswith('f-') for k in B), 'file uploaded to sync')
        # leak check
        await A.click('.side-nav [data-v="health"]'); await A.click('[data-act="leak-check"]'); await A.wait_for_timeout(1500)
        txt = await A.inner_text('#page')
        check('Seen 1,234 times' in txt, 'leaked password found by Health')
        await A.screenshot(path='/tmp/vl-test-f_leaks.png')
        await A.click('.side-nav [data-v="vault"]'); await A.click('.card:has-text("Netflix")'); await A.wait_for_timeout(300)
        check('Found in breaches' in await A.inner_text('#detail'), 'leak pill on the account')
        # Face ID / fingerprint
        await A.click('.side-nav [data-v="settings"]'); await A.wait_for_timeout(300)
        await A.click('#s-bio'); await A.wait_for_timeout(2500)
        bio = await A.evaluate("!!Bio.rec()")
        check(bio, 'Face ID / fingerprint enrolled (virtual authenticator with PRF)')
        await A.screenshot(path='/tmp/vl-test-f_settings_sync.png')
        await A.click('.side-foot [data-act="lock"]'); await A.wait_for_selector('[data-act="l-bio"]', timeout=5000)
        await A.screenshot(path='/tmp/vl-test-f_login_bio.png')
        await A.click('[data-act="l-bio"]'); await A.wait_for_selector('#shell', timeout=20000)
        check(True, 'unlocked with Face ID / fingerprint')
        # emergency kit with the Finance label
        await A.click('.side-nav [data-v="settings"]'); await A.click('[data-act="kit-new"]'); await A.wait_for_selector('[data-act="kit-scope"][data-v="labels"]')
        await A.click('[data-act="kit-scope"][data-v="labels"]'); await A.click('#kit-labels .chip:has-text("Finance")')
        await A.screenshot(path='/tmp/vl-test-f_kit_builder.png')
        await A.click('[data-act="kit-make"]'); await A.wait_for_selector('.modal .rk', timeout=20000)
        kcode = (await A.inner_text('.modal .rk')).replace('\n', '').strip()
        await A.screenshot(path='/tmp/vl-test-f_kit_made.png')
        async with A.expect_download() as dl: await A.click('[data-act="kit-dl"]')
        d = await dl.value; await d.save_as('/tmp/kit.json')
        kit = json.load(open('/tmp/kit.json'))
        check(kit['kind'] == 'emergency' and kit['count'] == 1 and 'Ledger' not in json.dumps(kit), f'kit file made, encrypted, {kit["count"]} account')
        await A.click('[data-act="mclose"]')
        # ---------- device B (phone): link with the code ----------
        cb, Bp, eb = await device(b, mobile=True)
        await Bp.goto(U); await Bp.wait_for_selector('[data-act="s-link"]', timeout=20000)
        await Bp.click('[data-act="s-link"]'); await Bp.fill('#lk-code', code.lower().replace('-', ' '))
        await Bp.screenshot(path='/tmp/vl-test-f_link.png')
        await Bp.click('[data-act="lk-go"]'); await Bp.wait_for_selector('#l-pw', timeout=15000)
        await unlock(Bp)
        check(await names(Bp) == await names(A), 'phone has the same accounts after linking')
        await Bp.wait_for_timeout(2500)
        await Bp.click('.card:has-text("Netflix")'); await Bp.wait_for_timeout(500)
        await Bp.click('[data-act="file-open"]'); await Bp.wait_for_selector('.file-img', timeout=8000)
        check(await Bp.evaluate("document.querySelector('.file-img').naturalWidth") == 320, 'file synced to the phone and opens')
        await Bp.click('[data-act="mclose"]'); await Bp.click('[data-act="close-detail"]')
        # edits on both sides, then sync: both survive
        await Bp.evaluate("(() => { const a = V().accounts.find(x => x.tool === 'AWS'); const d = clone(a); d.accountName = 'Production (phone edit)'; commitAccount(d, false); renderApp(); })()")
        await A.evaluate("(() => { const a = V().accounts.find(x => x.tool === 'Home Wi-Fi'); const d = clone(a); d.accountName = 'Upstairs (desktop edit)'; commitAccount(d, false); renderApp(); })()")
        await A.wait_for_timeout(3000); await Bp.wait_for_timeout(3000)
        await A.evaluate("syncNow()"); await A.wait_for_timeout(2500)
        await Bp.evaluate("syncNow()"); await Bp.wait_for_timeout(2500)
        await A.evaluate("syncNow()"); await A.wait_for_timeout(2500)
        na, nb = await names(A), await names(Bp)
        check(na == nb and any('phone edit' in x for x in na) and any('desktop edit' in x for x in na), 'edits from both devices merged on both: ' + str(na))
        # new code on A: phone stops syncing, then relinks with the new code
        await A.click('.side-nav [data-v="settings"]'); await A.click('[data-act="sync-rotate"]'); await A.click('[data-act="m-ok"]')
        await A.wait_for_selector('.modal .rk', timeout=15000)
        code2 = (await A.inner_text('.modal .rk')).replace('\n', '').strip(); await A.click('.modal [data-act="mclose"]')
        check(code2 != code and len(V) == 1, 'new sync code replaces the old one on the server')
        await Bp.evaluate("syncNow()"); await Bp.wait_for_timeout(1500)
        check(await Bp.evaluate("V().settings.sync") is False, 'phone notices the old code stopped working')
        await Bp.click('#bnav [data-v="settings"]'); await Bp.click('[data-act="sync-link"]'); await Bp.fill('#lk-code', code2); await Bp.click('[data-act="lk-go"]')
        await Bp.wait_for_timeout(3000)
        check(await Bp.evaluate("V().settings.sync") is True, 'phone relinked with the new code')
        await Bp.screenshot(path='/tmp/vl-test-f_phone_settings.png')
        # turn off sync on A
        await A.click('[data-act="sync-off"]'); await A.click('[data-act="m-ok"]'); await A.wait_for_timeout(1500)
        check(len(V) == 0 and len(B) == 0, 'turning sync off deletes the synced copy')
        # ---------- device C: open the emergency kit ----------
        cc, C, ec = await device(b)
        await C.goto(U); await C.wait_for_selector('[data-act="s-restore"]', timeout=20000)
        await C.click('[data-act="s-restore"]'); await C.set_input_files('#rs-file', '/tmp/kit.json')
        await C.click('[data-act="rs-go"]'); await C.wait_for_timeout(300)
        check('emergency kit' in (await C.inner_text('#m-err')).lower(), 'asks for the emergency code when a kit is picked')
        await C.click('[data-act="rs-mode"][data-v="ec"]'); await C.fill('#rs-ec-in', kcode); await C.click('[data-act="rs-go"]')
        await C.wait_for_selector('#s-pw', timeout=20000)
        await C.screenshot(path='/tmp/vl-test-f_kit_open.png')
        await C.fill('#s-pw', 'Trusted-Person-Pass-77'); await C.fill('#s-pw2', 'Trusted-Person-Pass-77'); await C.click('[data-act="s-next"]')
        await keypad(C, '246810'); await C.wait_for_timeout(150); await keypad(C, '246810')
        await C.wait_for_selector('#rk', timeout=20000); await C.check('#s-saved'); await C.uncheck('[data-sf="sync"]')
        await C.click('[data-act="s-finish"]'); await C.wait_for_selector('#shell', timeout=20000)
        check(await names(C) == ['Ledger wallet / Cold storage'], 'trusted person sees only the kit accounts: ' + str(await names(C)))
        print('calls', {k: CALLS.count(k) for k in set(CALLS)})
        print('errors A', ea, 'B', eb, 'C', ec)
        await b.close()
    print('RESULT', 'FAILED' if getattr(check, 'failed', False) else 'ALL PASSED')

asyncio.run(main())
