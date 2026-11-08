"""Local stand-ins for Supabase sync and the HIBP range API, with the same rules as
supabase/migrations/001_vaultleaf_sync.sql. Used by capture.py (and handy for tests)."""
import hashlib, json, re
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


async def add_mocks(ctx, webauthn_page=None):
    await ctx.route(SUPA + '**', supa_route)
    await ctx.route('https://api.pwnedpasswords.com/**', hibp_route)

async def add_authenticator(ctx, pg):
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('WebAuthn.enable', {'enableUI': False})
    await cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {'protocol': 'ctap2', 'ctap2Version': 'ctap2_1', 'transport': 'internal', 'hasResidentKey': True,
        'hasUserVerification': True, 'isUserVerified': True, 'hasPrf': True, 'automaticPresenceSimulation': True}})
