/* ================= Vaultleaf UI ================= */
const root = document.getElementById('root');
const modalsEl = document.getElementById('modals');
const toastsEl = document.getElementById('toasts');
const $ = (s, r = document) => r.querySelector(s);
const HOST_THEME = document.documentElement.getAttribute('data-theme');

const ICONS = {
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20.5 20.5 16 16',
  lock:'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  copy:'M9 9h11v11H9zM5 15H4V4h11v1',
  eye:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6z',
  eyeoff:'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  plus:'M12 5v14M5 12h14',
  star:'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  trash:'M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5M14 11v5',
  edit:'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  key:'M8 11a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM11 12.5 20 3.5M16.5 7l3 3M14.5 9l2 2',
  shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  activity:'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8M12 7.5V12l3 2',
  sliders:'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
  dice:'M5 5h14v14H5zM9 8.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6zM15 14.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6zM15 8.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6zM9 14.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6z',
  left:'M15 5l-7 7 7 7',
  right:'M9 5l7 7-7 7',
  ext:'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  cards:'M4 5h16v6H4zM4 14h16v6H4z',
  notes:'M6 3h9l4 4v14H6zM14.5 3v4.5H19M9 11h7M9 14.5h7M9 18h4',
  tag:'M3.5 12.5V4h8.5l9 9-8.5 8.5zM8 8h.01',
  more:'M5 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6zM19 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6z',
  check:'M5 12.5l4.5 4.5L19 7.5',
  x:'M6 6l12 12M18 6 6 18',
  upload:'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  download:'M12 4v12M7 11l5 5 5-5M4 16v4h16v-4',
  refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  user:'M12 12a4 4 0 1 0 0-8 4 4 0 1 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0',
  users:'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 1 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.6M18.5 14a6 6 0 0 1 3 6',
  mail:'M3 6h18v12H3zM3.5 7l8.5 6 8.5-6',
  warn:'M12 3.5l9.5 17h-19zM12 10v4.5M12 17.5h.01',
  cloud:'M7 18.5a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z',
  question:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .9-1 1.6M12 17h.01',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7.5V12l3 2',
  phone:'M7 2.5h10v19H7zM11 18h2',
  folder:'M3 6h6l2 2h10v11H3z',
  layers:'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  import:'M14 3H6v18h12V7zM14 3v4h4M12 10.5v6.5M9 14l3 3 3-3',
  phrase:'M10 6h10M10 12h10M10 18h10M4.5 6h1M4.5 12h1M4.5 18h1',
  restore:'M4 12a8 8 0 1 0 2.3-5.7M4 4v4.5h4.5'
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;
const MARK = (size = 40) => `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><path class="leafbody" d="M6 42C6 20 20 6 42 6c0 22-14 36-36 36z"/><path class="hole" d="M24 14.5a4.6 4.6 0 0 1 2.7 8.3l1.6 8.7h-8.6l1.6-8.7A4.6 4.6 0 0 1 24 14.5z"/></svg>`;

/* ---------- state ---------- */
const S = {
  phase:'boot', header:null, body:null, vault:null, dek:null, dekRaw:null, cloudHeader:null, downloads:null, hasClaude:!!(window.claude && window.claude.use),
  tab:'vault', filter:'all', q:'', selId:null, mode:'view', editKind:'form', draft:null, orig:'', dtab:'changes',
  revealed:new Set(), revealTimers:new Map(), edPeek:new Set(), totpNow:new Map(), actFilter:'all',
  auth:{step:1, pw:'', pc:'', err:'', info:'', busy:false},
  setup:null, m:null, pulling:false
};
const V = () => S.vault;
const acct = id => S.vault && S.vault.accounts.find(a => a.id === id);
const view = () => (S.vault && S.vault.settings.view) || 'modern';
const isSecret = t => !!ftype(t).secret;

/* ---------- labels ---------- */
let hayCache = new WeakMap();
const labelById = id => V().labels.find(l => l.id === id);
function labelPath(id){ const parts = []; let l = labelById(id), g = 0; while(l && g++ < 8){ parts.unshift(l.name); l = l.parentId ? labelById(l.parentId) : null; } return parts.join(' / '); }
function labelDesc(id){ const set = new Set([id]); let added = true; while(added){ added = false; for(const l of V().labels) if(l.parentId && set.has(l.parentId) && !set.has(l.id)){ set.add(l.id); added = true; } } return set; }
function labelColor(id){ const l = labelById(id); return l ? l.color : COLORS[6]; }
function ensureLabelPath(path){
  const parts = String(path).split('/').map(s => s.trim()).filter(Boolean);
  let parent = null;
  for(const p of parts){
    let l = V().labels.find(x => x.name.toLowerCase() === p.toLowerCase() && (x.parentId || null) === parent);
    if(!l){ l = {id:uid(), name:p, parentId:parent, color:parent ? labelColor(parent) : COLORS[V().labels.filter(x => !x.parentId).length % COLORS.length], updatedAt:now()}; V().labels.push(l); hayCache = new WeakMap(); }
    parent = l.id;
  }
  return parent;
}
function labelTree(){ const out = []; const walk = (pid, d) => { V().labels.filter(l => (l.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name)).forEach(l => { out.push({l, d}); if(d < 6) walk(l.id, d + 1); }); }; walk(null, 0); return out; }
function resolveLabels(a){ if(a._labelPaths){ const ids = a._labelPaths.map(ensureLabelPath).filter(Boolean); a.labels = [...new Set(ids)]; } delete a._labelPaths; return a; }

/* ---------- toasts & modals ---------- */
function toast(msg, icon = 'check'){
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = ic(icon) + `<span>${esc(msg)}</span>`;
  toastsEl.appendChild(el); setTimeout(() => el.remove(), 2800);
  while(toastsEl.children.length > 3) toastsEl.firstChild.remove();
}
function openModal(m){
  S.m = m;
  modalsEl.innerHTML = `<div class="scrim" data-scrim="1"><div class="modal ${m.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <div class="m-h"><h2 id="m-title">${esc(m.title)}</h2><button class="icon-btn" data-act="mclose" aria-label="Close">${ic('x')}</button></div>
    <div class="m-b" id="m-body">${m.body}</div>${m.foot ? `<div class="m-f" id="m-foot">${m.foot}</div>` : ''}</div></div>`;
  const f = modalsEl.querySelector('[autofocus]') || modalsEl.querySelector('.m-b input, .m-b textarea, .m-b button');
  if(f && !matchMedia('(pointer:coarse)').matches) setTimeout(() => f.focus(), 30);
}
function setModal(body, foot){ const b = $('#m-body'); if(b && body !== undefined) b.innerHTML = body; const f = $('#m-foot'); if(f && foot !== undefined) f.innerHTML = foot; }
function closeModal(){ modalsEl.innerHTML = ''; const m = S.m; S.m = null; if(m && m.onClose) m.onClose(); }
function confirmBox({title, text, ok = 'Confirm', danger = false, onOk}){
  openModal({title, body:`<p>${text}</p>`, foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-act="m-ok">${esc(ok)}</button>`, onOk});
}

/* ---------- clipboard ---------- */
function copyText(text){
  let p;
  try{ p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(); }catch(e){ p = Promise.reject(e); }
  return p.then(() => true).catch(() => {
    try{ const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; }catch(e){ return false; }
  });
}
let clipTimer = null;
function scheduleClipClear(){
  const s = V() ? V().settings.clipSec : 0; clearTimeout(clipTimer);
  if(s > 0) clipTimer = setTimeout(() => { try{ navigator.clipboard.writeText(' ').catch(() => {}); }catch(e){} }, s * 1000);
}
function resolveValue(a, key){
  if(['url','username','email','password','tool','accountName'].includes(key)) return {label:{url:'Website', username:'Username', email:'Email', password:'Password', tool:'Name', accountName:'Account name'}[key], value:a[key]};
  const [kind, id] = key.split(':');
  if(kind === 'f'){ const f = a.fields.find(x => x.id === id); if(!f) return {}; const label = f.label || ftype(f.type).name; if(f.type === 'totp') return {label, value:S.totpNow.get(a.id + '|' + key) || ''}; return {label, value:f.value}; }
  if(kind === 'a'){ const q = a.qa.find(x => x.id === id); return q ? {label:'Answer', value:q.a} : {}; }
  if(kind === 'q'){ const q = a.qa.find(x => x.id === id); return q ? {label:'Question', value:q.q} : {}; }
  if(kind === 'ad'){ const d = a.admins.find(x => x.id === id); return d ? {label:d.email ? 'Admin email' : 'Admin', value:d.email || d.name} : {}; }
  if(kind === 'h'){ const h = a.secrets.find(x => x.id === id); return h ? {label:'Old ' + h.label.toLowerCase(), value:h.value} : {}; }
  if(key === 'labels') return {label:'Labels', value:a.labels.map(labelPath).join(', ')};
  if(key === 'rotate') return {label:'Reminder', value:a.rotateDays + ' days'};
  return {};
}
function doCopy(a, key, el){
  const {label, value} = resolveValue(a, key);
  if(!value){ toast('Nothing to copy yet', 'warn'); return; }
  copyText(value).then(ok => {
    if(!ok){ toast('Your browser blocked copying. Reveal it and copy by hand.', 'warn'); return; }
    const s = V().settings.clipSec;
    toast(label + ' copied' + (s > 0 && isSecretKey(a, key) ? '. Clearing in ' + s + 's' : ''), 'copy');
    a.copies.unshift({id:uid(), at:now(), field:label}); a.copies.length = Math.min(a.copies.length, 100); a.lastCopiedAt = now();
    persist();
    if(isSecretKey(a, key)) scheduleClipClear();
    if(el){ const row = el.closest('.frow, .nline, .card'); if(row){ row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } }
    if(S.selId === a.id && S.dtab === 'copies') refreshDetailKeepScroll();
    updateMetaCopies(a);
  });
}
function isSecretKey(a, key){
  if(key === 'password') return true;
  const [kind, id] = key.split(':');
  if(kind === 'f'){ const f = a.fields.find(x => x.id === id); return !!(f && isSecret(f.type)); }
  return kind === 'a' || kind === 'h';
}
function updateMetaCopies(a){ const el = document.getElementById('meta-copied'); if(el && S.selId === a.id){ el.textContent = ago(a.lastCopiedAt); } const c = document.getElementById('meta-copies'); if(c && S.selId === a.id) c.textContent = String(a.copies.length); }
function reveal(a, key){
  const k = a.id + '|' + key;
  if(S.revealed.has(k)){ S.revealed.delete(k); clearTimeout(S.revealTimers.get(k)); }
  else {
    S.revealed.add(k);
    const sec = V().settings.revealSec || 30;
    clearTimeout(S.revealTimers.get(k));
    S.revealTimers.set(k, setTimeout(() => { S.revealed.delete(k); if(S.phase === 'app' && S.selId === a.id && S.mode === 'view') refreshDetailKeepScroll(); }, sec * 1000));
  }
  refreshDetailKeepScroll();
}

/* ---------- persistence & sync ---------- */
let saveChain = Promise.resolve();
function persist(){
  if(!S.vault || !S.dek) return saveChain;
  S.vault.updatedAt = now();
  const key = S.dek, snapshot = JSON.parse(JSON.stringify(S.vault));
  saveChain = saveChain.then(async () => {
    const body = await sealVault(key, snapshot);
    S.body = body;
    if(!LS.set(K.body, body) && !S.warnedStorage){ S.warnedStorage = true; toast('This browser is not keeping data on this device. Turn on sync or keep a backup.', 'warn'); }
    schedulePush();
  }).catch(e => console.error('save failed', e));
  return saveChain;
}
let pushTimer = null;
const syncOn = () => Cloud.ready && S.vault && S.vault.settings.sync;
function schedulePush(){ if(!syncOn()) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 1200); }
async function pushNow(){
  if(!syncOn() || !S.body || !S.header) return;
  if(Cloud.pushing){ Cloud.again = true; return; }
  Cloud.pushing = true; setSync('busy');
  let conflict = null;
  try{
    if(Cloud.kind === 'claude'){
      const m = await Cloud.getMeta().catch(() => null);
      if(m && m.off && m.at > (S.vault.settings.updatedAt || 0)){ syncTurnedOffElsewhere(m); return; }
    }
    const res = await Cloud.push(S.header, S.body);
    if(res.gone){ syncTurnedOffElsewhere({at:now()}); return; }
    if(res.conflict) conflict = res.meta;
    else { Cloud.lastHdr = JSON.stringify(S.header); await syncFiles(); setSync('ok'); }
  }
  catch(e){ console.warn('sync push', e); setSync('err', e); }
  finally{ Cloud.pushing = false; }
  if(conflict){ await pullMerge(conflict); return; }
  if(Cloud.again){ Cloud.again = false; pushNow(); }
}
function syncTurnedOffElsewhere(m){
  if(!S.vault || !S.vault.settings.sync) return;
  S.vault.settings.sync = false; S.vault.settings.updatedAt = Math.max(m.at || 0, S.vault.settings.updatedAt || 0);
  clearTimeout(pushTimer); Cloud.forget(); persist(); setSync('ok');
  if(S.phase === 'app'){ renderSide(); if(S.tab === 'settings') renderPage(); }
  toast(Cloud.kind === 'supa' ? 'This vault stopped syncing: sync was turned off or given a new code on another device' : 'Sync was turned off on another device', 'cloud');
}
function setSync(st, e){
  Cloud.status = st; if(st === 'ok') Cloud.lastAt = now();
  Cloud.err = e ? (e.code === 'quota_exceeded' ? 'Sync storage is full.' : e.code === 'revoked' ? 'Sync access ended for this page.' : (e.message || 'Sync failed.')) : '';
  const el = document.getElementById('syncline'); if(el) el.innerHTML = syncLine();
  const el2 = document.getElementById('syncstate'); if(el2) el2.innerHTML = syncLine();
}
function syncLine(){
  if(!Cloud.ready || !S.vault || !S.vault.settings.sync) return WEB ? `<span class="sync-dot"></span> This device only` : `<span class="sync-dot"></span> ${Cloud.ready ? 'Sync is off' : 'Saved on this device only'}`;
  if(Cloud.status === 'busy') return `<span class="sync-dot busy"></span> Syncing…`;
  if(Cloud.status === 'err') return `<span class="sync-dot err"></span> ${esc(Cloud.err || 'Sync failed')}`;
  if(Cloud.lastAt) return `<span class="sync-dot ok"></span> Synced ${ago(Cloud.lastAt)}`;
  return `<span class="sync-dot ok"></span> Sync on`;
}
async function adoptHeader(h){
  if(h && (h.hdrAt || 0) > (S.header.hdrAt || 0)){ S.header = h; LS.set(K.header, h); Cloud.lastHdr = JSON.stringify(h); }
}
async function pullMerge(meta){
  if(S.pulling || !S.dek) return; S.pulling = true; setSync('busy');
  let again = false;
  try{
    const body = await Cloud.pull(meta);
    if(!body){ S.pulling = false; await pushNow(); return; }
    const remote = upgradeVault(await openVault(S.dek, body));
    await adoptHeader(meta._header || await Cloud.getHeader().catch(() => null));
    Cloud.lastRev = body.rev;
    const merged = mergeVaults(S.vault, remote);
    const same = stable(merged) === stable(remote);
    S.vault = merged; hayCache = new WeakMap();
    if(same){ S.body = body; LS.set(K.body, body); setSync('ok'); }
    else { await persist(); again = true; }
    await syncFiles();
    if(S.phase === 'app' && S.mode === 'view' && !S.m) renderApp();
    else if(S.phase === 'app'){ renderSide(); renderList(); }
    if(!again) setSync('ok');
  }catch(e){ console.warn('pull', e); setSync('err', e); }
  S.pulling = false;
}
/* Files: upload what the other devices don't have, fetch what this one is missing, delete what was removed. */
let filesBusy = false;
async function syncFiles(){
  if(!Cloud.files || !syncOn() || !S.dek || filesBusy) return;
  filesBusy = true;
  try{
    const h = await Cloud.head(); if(!h) return;
    const remote = h.files || {}, want = new Map(), key = S.dek;
    for(const a of V().accounts) for(const f of a.files || []) want.set(f.id, f);
    for(const [id, f] of want){
      if((remote[id] || 0) >= fileParts(f)) continue;
      const box = await Files.getRaw(id); if(box) await Cloud.putFile(id, JSON.stringify(box));
    }
    let got = 0;
    for(const [id, f] of want){
      if((remote[id] || 0) < fileParts(f) || await Files.has(id)) continue;
      const txt = await Cloud.getFile(id); if(!txt) continue;
      const box = JSON.parse(txt);
      try{ await Files.decrypt(key, id, box); await Files.putRaw(id, box); got++; }catch(e){ console.warn('file from sync unreadable', id); }
    }
    const gone = new Set((V().tombstones || []).map(t => t.id));
    for(const id of Object.keys(remote)) if(gone.has(id) && !want.has(id)) await Cloud.delFile(id).catch(() => {});
    if(got && S.phase === 'app' && S.selId && S.mode === 'view') refreshDetailKeepScroll();
  }catch(e){ console.warn('file sync', e); }
  finally{ filesBusy = false; }
}
function watchCloud(){
  if(!Cloud.ready || Cloud.unsub) return;
  Cloud.unsub = Cloud.watch(m => {
    if(!S.vault || !S.vault.settings.sync) return;
    if(m.gone){ syncTurnedOffElsewhere({at:now()}); return; }
    if(m.off){ if(m.at > (S.vault.settings.updatedAt || 0)) syncTurnedOffElsewhere(m); return; }
    if(m.rev && m.rev !== (S.body && S.body.rev) && m.rev !== Cloud.lastRev && m.dev !== DEVICE) pullMerge(m);
    else if(Cloud.files && m._files) syncFiles();
  });
}
async function syncNow(){
  if(!syncOn()) return;
  let h;
  try{ h = await Cloud.head(); }catch(e){ setSync('err', e); return; }
  if(!h){ if(Cloud.kind === 'supa' && Cloud.lastRev){ syncTurnedOffElsewhere({at:now()}); return; } await pushNow(); return; }
  const meta = h.meta || {};
  if(meta.off){ if(meta.at > (V().settings.updatedAt || 0)) syncTurnedOffElsewhere(meta); else await pushNow(); return; }
  if(meta.rev && meta.rev !== (S.body && S.body.rev)) await pullMerge({...meta, _header:h.header}); else await pushNow();
}

/* ---------- theme ---------- */
function applyTheme(t){
  const r = document.documentElement;
  if(t === 'light' || t === 'dark') r.setAttribute('data-theme', t);
  else if(HOST_THEME) r.setAttribute('data-theme', HOST_THEME); else r.removeAttribute('data-theme');
  LS.set(K.ui, {theme:t});
}

/* ---------- auto-lock ---------- */
let lastAct = now(), hiddenAt = 0;
['pointerdown','keydown','wheel','touchstart','input'].forEach(e => addEventListener(e, () => { lastAct = now(); }, {passive:true, capture:true}));
setInterval(() => {
  if(S.phase !== 'app' || !S.vault) return;
  const m = S.vault.settings.autoLockMin;
  if(m > 0 && now() - lastAct > m * 60000) lock(`Locked after ${m} minute${m === 1 ? '' : 's'} without activity.`);
}, 5000);
document.addEventListener('visibilitychange', () => {
  if(document.hidden){ hiddenAt = now(); return; }
  if(S.phase === 'app' && S.vault){
    if(S.vault.settings.lockOnHide && hiddenAt && now() - hiddenAt > 60000){ lock('Locked while you were away.'); return; }
    if(syncOn()) syncNow();
  }
  hiddenAt = 0;
});
function lock(msg){
  if(S.dekRaw) S.dekRaw.fill(0);
  Object.assign(S, {vault:null, dek:null, dekRaw:null, draft:null, selId:null, mode:'view', tab:'vault', q:'', filter:'all', phase:'login'});
  S.revealed.clear(); S.edPeek.clear(); S.totpNow.clear(); totpKeys.clear();
  for(const t of S.revealTimers.values()) clearTimeout(t); S.revealTimers.clear();
  if(Cloud.unsub){ try{ Cloud.unsub(); }catch(e){} Cloud.unsub = null; }
  modalsEl.innerHTML = ''; S.m = null;
  S.auth = {step:1, pw:'', pc:'', err:'', info:msg || '', busy:false};
  render();
}

/* ---------- account mutations ---------- */
function diffAccounts(o, n){
  const changed = [], secrets = []; let pw = false;
  const core = [['tool','name'],['accountName','account name'],['url','website'],['username','username'],['email','email'],['password','password'],['notes','notes'],['rotateDays','reminder'],['createdAt','date stored']];
  for(const [p, l] of core) if(String(o[p] || '') !== String(n[p] || '')){ changed.push(l); if(p === 'password'){ pw = true; if(o.password) secrets.push({label:'Password', value:o.password}); } }
  const om = new Map(o.fields.map(f => [f.id, f])), nm = new Map(n.fields.map(f => [f.id, f]));
  for(const f of n.fields){
    const p = om.get(f.id), nm_ = (f.label || ftype(f.type).name).toLowerCase();
    if(!p) changed.push('added ' + nm_);
    else if(p.value !== f.value || p.label !== f.label || p.type !== f.type){ changed.push(nm_); if(p.value !== f.value && isSecret(p.type) && p.value) secrets.push({label:p.label || ftype(p.type).name, value:p.value}); }
  }
  for(const f of o.fields) if(!nm.has(f.id)){ changed.push('removed ' + (f.label || ftype(f.type).name).toLowerCase()); if(isSecret(f.type) && f.value) secrets.push({label:f.label || ftype(f.type).name, value:f.value}); }
  const qaStr = x => JSON.stringify(x.qa.map(q => [q.q, q.a]));
  if(qaStr(o) !== qaStr(n)){ changed.push('security questions'); const nn = new Map(n.qa.map(q => [q.id, q])); for(const q of o.qa){ const m = nn.get(q.id); if(q.a && (!m || m.a !== q.a)) secrets.push({label:'Answer to "' + (q.q || 'question') + '"', value:q.a}); } }
  const adStr = x => JSON.stringify(x.admins.map(d => [d.name, d.email, d.role]));
  if(adStr(o) !== adStr(n)) changed.push('admins');
  if([...o.labels].sort().join() !== [...n.labels].sort().join()) changed.push('labels');
  return {changed:[...new Set(changed)], secrets, pw};
}
function cleanDraft(a){
  a.tool = (a.tool || '').trim() || 'Untitled';
  a.fields = a.fields.filter(f => (f.value || '').trim() || (f.label || '').trim()).map(f => ({...f, label:(f.label || '').trim() || ftype(f.type).name}));
  a.qa = a.qa.filter(q => (q.q || '').trim() || (q.a || '').trim());
  a.admins = a.admins.filter(d => (d.name || '').trim() || (d.email || '').trim());
  for(const k of ['accountName','url','username','email']) a[k] = (a[k] || '').trim();
  return a;
}
function commitAccount(draft, isNew, noPersist){
  const t = now();
  const a = cleanDraft(resolveLabels(clone(draft)));
  if(isNew){
    a.createdAt = a.createdAt || t; a.updatedAt = t; a.no = V().nextNo++;
    if(a.password) a.pwChangedAt = a.pwChangedAt || t;
    a.history = [{id:uid(), at:t, kind:'created', text:'Stored'}].concat(a.history || []);
    V().accounts.push(a);
  } else {
    const o = acct(a.id); if(!o) return null;
    const d = diffAccounts(o, a);
    if(!d.changed.length && o.fav === a.fav) return o;
    a.updatedAt = t;
    if(d.pw) a.pwChangedAt = t;
    for(const s of d.secrets) a.secrets.unshift({id:uid(), at:t, label:s.label, value:s.value});
    a.secrets = a.secrets.slice(0, 60);
    if(d.changed.length) a.history.unshift({id:uid(), at:t, kind:d.pw ? 'password' : 'edit', text:'Changed ' + listJoin(d.changed)});
    a.history = a.history.slice(0, 200);
    V().accounts[V().accounts.indexOf(o)] = a;
  }
  if(!noPersist) persist();
  return a;
}
function listJoin(arr){ if(arr.length <= 1) return arr.join(''); if(arr.length === 2) return arr.join(' and '); return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]; }
function trashAccount(a){ a.trashedAt = now(); a.updatedAt = now(); a.history.unshift({id:uid(), at:now(), kind:'trash', text:'Moved to Recently deleted'}); persist(); }
function restoreAccount(a){ a.trashedAt = 0; a.updatedAt = now(); a.history.unshift({id:uid(), at:now(), kind:'restore', text:'Restored from Recently deleted'}); persist(); }
function purgeAccount(a){ dropAccountFiles(a); V().accounts = V().accounts.filter(x => x.id !== a.id); V().tombstones.push({id:a.id, at:now()}); persist(); }
function autoPurge(){ const cut = now() - 30 * DAY; let n = 0; for(const a of [...V().accounts]) if(a.trashedAt && a.trashedAt < cut){ dropAccountFiles(a); V().accounts = V().accounts.filter(x => x !== a); V().tombstones.push({id:a.id, at:now()}); n++; } return n; }

/* ---------- filtering ---------- */
function hay(a){
  let h = hayCache.get(a); if(h) return h;
  h = [a.tool, a.accountName, a.username, a.email, a.url, a.notes, ...a.labels.map(labelPath), ...a.admins.flatMap(d => [d.name, d.email, d.role]), ...a.fields.flatMap(f => [f.label, isSecret(f.type) ? '' : f.value]), ...a.qa.map(q => q.q)].join('\n').toLowerCase();
  hayCache.set(a, h); return h;
}
function visible(){
  let list = V().accounts.filter(a => S.filter === 'trash' ? a.trashedAt : !a.trashedAt);
  if(S.filter === 'fav') list = list.filter(a => a.fav);
  else if(S.filter.startsWith('l:')){ const ids = labelDesc(S.filter.slice(2)); list = list.filter(a => a.labels.some(l => ids.has(l))); }
  const toks = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(toks.length) list = list.filter(a => toks.every(t => t.startsWith('#') && t.length > 1 ? a.labels.some(l => labelPath(l).toLowerCase().includes(t.slice(1))) : hay(a).includes(t)));
  const s = V().settings.sort;
  const by = {updated:(a, b) => b.updatedAt - a.updatedAt, name:(a, b) => a.tool.localeCompare(b.tool, undefined, {sensitivity:'base'}), copied:(a, b) => (b.lastCopiedAt || 0) - (a.lastCopiedAt || 0) || b.updatedAt - a.updatedAt, created:(a, b) => b.createdAt - a.createdAt, no:(a, b) => a.no - b.no}[s] || ((a, b) => b.updatedAt - a.updatedAt);
  return list.sort((a, b) => (S.filter === 'trash' ? 0 : (b.fav ? 1 : 0) - (a.fav ? 1 : 0)) || by(a, b));
}
function hl(text){
  let h = esc(text);
  const toks = S.q.trim().split(/\s+/).filter(t => t && !t.startsWith('#'));
  for(const t of toks){ const re = new RegExp('(' + esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![^<]*>)', 'gi'); h = h.replace(re, '<mark>$1</mark>'); }
  return h;
}
function filterTitle(){
  if(S.filter === 'all') return 'All accounts';
  if(S.filter === 'fav') return 'Favorites';
  if(S.filter === 'trash') return 'Recently deleted';
  if(S.filter.startsWith('l:')) return labelPath(S.filter.slice(2)) || 'Label';
  return 'Accounts';
}
function tile(a, size){
  const c = a.labels.length ? labelColor(a.labels[0]) : hashColor(a.tool);
  return `<div class="mono-tile" style="background:${c}${size ? `;width:${size}px;height:${size}px` : ''}" aria-hidden="true">${esc(initials(a.tool))}</div>`;
}
const tagHTML = id => `<span class="tag"><span class="dot" style="background:${labelColor(id)}"></span>${esc(labelPath(id))}</span>`;
function colorize(v){ return [...String(v)].map(c => /\d/.test(c) ? `<span class="ch-d">${esc(c)}</span>` : /[^a-zA-Z0-9\s]/.test(c) ? `<span class="ch-s">${esc(c)}</span>` : esc(c)).join(''); }
const fmtCode = c => !c ? '··· ···' : c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c.length === 8 ? c.slice(0, 4) + ' ' + c.slice(4) : c;
function safeUrl(u){ u = String(u || '').trim(); if(!u) return ''; if(!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u; return /^https?:\/\//i.test(u) ? u : ''; }
function pwAge(a){ const t = a.pwChangedAt || a.createdAt; return t ? now() - t : 0; }
function isOld(a){ const r = a.rotateDays || V().settings.rotateDays; const age = pwAge(a); return !!a.password && ((r && age > r * DAY) || age > 365 * DAY); }
const SEP = '<span aria-hidden="true" style="opacity:.45;margin:0 6px">|</span>';
