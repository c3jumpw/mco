"""Illustrations for the admin track of the tour. They are schematic (no real dashboards, no account
details beyond the project names), so they stay accurate and can be regenerated with every release."""

FONT = '<link rel="stylesheet" href="/fonts/fonts.css">'  # pages are served from the local site so the fonts load
BASE = """
:root{--paper:#EEF2EF;--surface:#fff;--sunken:#E3E9E5;--ink:#15201B;--muted:#56665D;--line:#D2DBD5;--leaf:#1D5B44;--leaf-soft:#D9EADF;--brass:#966A0E;--brass-soft:#F4E8C8;--bad:#B42318}
*{box-sizing:border-box}html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:var(--paper);color:var(--ink);font:18px/1.45 "Atkinson Hyperlegible Next",system-ui,sans-serif}
h1{font:800 40px/1.1 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.02em;margin:0}
.mono{font-family:"Atkinson Hyperlegible Mono",ui-monospace,monospace}
.wrap{padding:56px 64px;height:100%;display:flex;flex-direction:column;justify-content:center;gap:28px}
.sub{color:var(--muted);font-size:20px;margin:-14px 0 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 1px 2px rgba(21,32,27,.06),0 14px 34px rgba(21,32,27,.08)}
.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:99px;background:var(--surface);border:1px solid var(--line);font-weight:700;font-size:17px}
.crumbs{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.crumbs .sep{color:var(--muted)}
.hl{outline:3px solid var(--brass);outline-offset:4px;border-radius:12px}
.note{background:var(--brass-soft);border-radius:14px;padding:14px 18px;font-size:17px}
.ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--leaf-soft);color:var(--leaf);font:800 20px "Bricolage Grotesque",system-ui,sans-serif}
h3{font:800 24px/1.2 "Bricolage Grotesque",system-ui,sans-serif;margin:14px 0 6px}
.ic svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.row{display:flex;gap:20px;align-items:stretch}
.toggle{width:64px;height:36px;border-radius:99px;background:var(--leaf);position:relative;flex:none}.toggle::after{content:"";position:absolute;right:4px;top:4px;width:28px;height:28px;border-radius:50%;background:#fff}
.toggle.off{background:var(--line)}.toggle.off::after{right:auto;left:4px}
.arrow{align-self:center;flex:none;font:800 34px "Bricolage Grotesque";color:var(--leaf)}
table{border-collapse:collapse;width:100%;font-size:16px}th,td{text-align:left;padding:10px 12px;border-top:1px solid var(--line)}th{background:var(--sunken);border-top:0}
.btn{display:inline-flex;padding:10px 16px;border-radius:12px;background:var(--ink);color:#fff;font-weight:700;font-size:16px}
.ok{color:var(--leaf);font-weight:800}
"""

def page(body):
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{FONT}<style>{BASE}</style></head><body>{body}</body></html>'

ART = {
'a_role': page("""<div class="wrap"><h1>You run the website, not the vaults</h1><p class="sub">Three places to look after. Every vault stays private to its owner.</p>
<div class="row">
 <div class="card" style="flex:1"><div class="ic">V</div><h3>The website</h3><p style="margin:0;color:var(--muted)">Vercel project</p><p class="mono" style="margin:6px 0 0">mco-vault-leaf</p><p style="margin:12px 0 0">Who can open it, deploys, rollbacks.</p></div>
 <div class="card" style="flex:1"><div class="ic">G</div><h3>The code</h3><p style="margin:0;color:var(--muted)">GitHub repository</p><p class="mono" style="margin:6px 0 0">c3jumpw/mco › vault-leaf</p><p style="margin:12px 0 0">Changes, the docs workflow, history.</p></div>
 <div class="card" style="flex:1"><div class="ic">S</div><h3>Sync storage</h3><p style="margin:0;color:var(--muted)">Supabase project</p><p class="mono" style="margin:6px 0 0">MKC-Admin › vaultleaf_*</p><p style="margin:12px 0 0">Encrypted copies only.</p></div>
</div>
<div class="card" style="display:flex;gap:18px;align-items:center;background:var(--ink);color:#fff;border:0"><div class="ic" style="background:#2b3a33;color:#fff"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div><div><b style="font-size:21px">Each person's vault</b><br><span style="opacity:.8">Encrypted on their own devices with their password and passcode. Admins can't open, read or reset it.</span></div></div>
</div>"""),
'a_access': page("""<div class="wrap"><h1>Choose who can open the site</h1>
<div class="crumbs"><span class="chip">Vercel</span><span class="sep">›</span><span class="chip">mco-vault-leaf</span><span class="sep">›</span><span class="chip">Settings</span><span class="sep">›</span><span class="chip hl">Deployment Protection</span></div>
<div class="card" style="display:grid;gap:18px">
 <div style="display:flex;justify-content:space-between;align-items:center;gap:20px"><div><b style="font-size:22px">Vercel Authentication</b><br><span style="color:var(--muted)">Visitors must be logged in to Vercel with access to your team</span></div><div class="toggle"></div></div>
 <div class="row">
  <div class="note" style="flex:1"><b>Standard Protection, the current setting.</b> Covers <span class="mono">mco-vault-leaf.vercel.app</span> and preview links. <span class="mono">vaultleaf.mkcworkspace.com</span> opens for anyone with the link.</div>
  <div class="note hl" style="flex:1;background:var(--leaf-soft)"><b>All Deployments.</b> Covers the workspace address too, so only your Vercel team can open Vaultleaf anywhere.</div>
 </div>
 <p style="margin:0;color:var(--muted)">Either way, each person gets their own empty, private vault and can't see anyone else's.</p>
</div></div>"""),
'a_publish': page("""<div class="wrap"><h1>Publish an update</h1><p class="sub">Push to main. The site and its documentation update on their own.</p>
<div class="row">
 <div class="card" style="flex:1"><div class="ic">1</div><b style="display:block;font-size:21px;margin-top:12px">Change the source</b><p class="mono" style="margin:8px 0 0;font-size:16px">vault-leaf/src/</p><p style="margin:8px 0 0;color:var(--muted)">Add a change log entry, and a tour step for new features.</p></div>
 <div class="arrow">›</div>
 <div class="card" style="flex:1"><div class="ic">2</div><b style="display:block;font-size:21px;margin-top:12px">Push to main</b><p class="mono" style="margin:8px 0 0;font-size:16px">c3jumpw/mco</p><p style="margin:8px 0 0;color:var(--muted)">Vercel deploys in under a minute.</p></div>
 <div class="arrow">›</div>
 <div class="card hl" style="flex:1.2"><div class="ic">3</div><b style="display:block;font-size:21px;margin-top:12px">Docs workflow runs</b><p style="margin:8px 0 0">Rebuilds the app, retakes every screenshot, rebuilds the tour and guide, then commits.</p></div>
 <div class="arrow">›</div>
 <div class="card" style="flex:1"><div class="ic">4</div><b style="display:block;font-size:21px;margin-top:12px">Live with fresh docs</b><p style="margin:8px 0 0;color:var(--muted)">People see What's new on their next unlock.</p></div>
</div>
<div class="note">Saved vaults are never touched by an update. They live in each person's browser and sync storage, encrypted.</div>
</div>"""),
'a_rollback': page("""<div class="wrap"><h1>Roll back if something breaks</h1>
<div class="crumbs"><span class="chip">Vercel</span><span class="sep">›</span><span class="chip">mco-vault-leaf</span><span class="sep">›</span><span class="chip hl">Deployments</span></div>
<div class="card" style="padding:0;overflow:hidden"><table>
<tr><th>Deployment</th><th>Branch</th><th>Status</th><th>When</th><th></th></tr>
<tr><td><b>Vaultleaf: new feature</b><br><span style="color:var(--muted);font-size:15px">Current production</span></td><td class="mono">main</td><td><span style="color:var(--bad);font-weight:700">Problem found</span></td><td>2 min ago</td><td></td></tr>
<tr><td><b>Vaultleaf: refresh tour and guide</b><br><span style="color:var(--muted);font-size:15px">Last good version</span></td><td class="mono">main</td><td class="ok">Ready</td><td>yesterday</td><td><span class="btn hl">Instant Rollback</span></td></tr>
<tr><td><b>Vaultleaf: sync and Face ID</b></td><td class="mono">main</td><td class="ok">Ready</td><td>last week</td><td></td></tr>
</table></div>
<div class="note">Pick the last good deployment, then choose Instant Rollback. Fix the problem, push again, and the new version replaces the rollback.</div>
</div>"""),
'a_storage': page("""<div class="wrap"><h1>Sync storage holds only scrambled data</h1>
<div class="crumbs"><span class="chip">Supabase</span><span class="sep">›</span><span class="chip">MKC-Admin</span><span class="sep">›</span><span class="chip">Table editor</span><span class="sep">›</span><span class="chip hl">vaultleaf_vaults</span></div>
<div class="card" style="padding:0;overflow:hidden"><table class="mono">
<tr><th>id</th><th>header</th><th>meta</th><th>updated_at</th></tr>
<tr><td>3f9c…a71e</td><td>{"kdf":…,"wrap":{"ct":"Qm9x…"}}</td><td>{"rev":"rmh2…","iv":"9s1…"}</td><td>2026-11-18 09:42</td></tr>
<tr><td>b02d…44c8</td><td>{"kdf":…,"wrap":{"ct":"Ze7P…"}}</td><td>{"rev":"rmh1…","iv":"Lk2…"}</td><td>2026-11-17 21:05</td></tr>
</table></div>
<div class="row"><div class="note" style="flex:1"><b>vaultleaf_blobs</b> holds the encrypted vault bodies and attached files, in parts of up to 1 MB. Up to 60 MB per vault.</div>
<div class="note" style="flex:1"><b>Delete a row</b> in vaultleaf_vaults to stop that vault syncing. Every device keeps its own copy.</div></div>
</div>"""),
'a_changelog': page("""<div class="wrap"><h1>Add an entry with each change</h1><p class="sub">Append to the end of <span class="mono">vault-leaf/src/changelog.json</span>, oldest first.</p>
<div class="row">
 <div class="card" style="flex:1.35;font-size:16px"><pre class="mono" style="margin:0;white-space:pre-wrap;line-height:1.55">{
  "at": "2026-12-02T14:30",
  "version": "1.4",
  "type": "<b style="color:var(--leaf)">added</b>",
  "audience": "<b style="color:var(--brass)">everyone</b>",
  "title": "Share a login with family",
  "text": "Send one account to someone you trust.",
  "feature": "sharing"
}</pre></div>
 <div style="flex:1;display:grid;gap:14px;align-content:start">
  <div class="note"><b>type</b>: added, improved, changed, fixed or security</div>
  <div class="note"><b>audience</b>: everyone, or admin for changes only admins need to hear about</div>
  <div class="note" style="background:var(--leaf-soft)"><b>Written entries</b> appear in What's new. Anything pushed without one is logged automatically, for admins only.</div>
 </div>
</div></div>"""),
'a_docs': page("""<div class="wrap"><h1>The tour and guide update themselves</h1><p class="sub">GitHub workflow “Vaultleaf docs” runs on every push that changes Vaultleaf.</p>
<div class="card" style="display:grid;gap:14px;font-size:20px">
 <div><span class="ok">✓</span> Log the change in the change log</div>
 <div><span class="ok">✓</span> Build the app and its security headers</div>
 <div><span class="ok">✓</span> Retake every screenshot, on a computer and a phone, light and dark</div>
 <div><span class="ok">✓</span> Redraw these admin illustrations</div>
 <div><span class="ok">✓</span> Rebuild the illustrated guide and this tour</div>
 <div class="hl" style="padding:4px 8px"><span class="ok">✓</span> Check every feature has a tour slide and a guide section, or fail the run</div>
 <div><span class="ok">✓</span> Commit the refreshed files, which Vercel then deploys</div>
</div>
<div class="note">Adding a feature? Write it in <span class="mono">src/changelog.json</span>, add a step to <span class="mono">src/tour.json</span> and a guide section. People see it in What's new.</div>
</div>"""),
}
