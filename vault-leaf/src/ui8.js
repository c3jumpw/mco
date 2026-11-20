
/* ---------- change log, roles, Admin page, What's new and the new address ----------
   CHANGES comes from src/changelog.json (written entries, numbered n) and src/changelog-auto.json
   (logged automatically by the docs workflow), merged oldest first by tools/build.py. */
const CHANGES = /*__CHANGES__*/[];
const HOME_HOST = 'vaultleaf.mkcworkspace.com', OLD_HOST = 'mco-vault-leaf.vercel.app', HOME_URL = 'https://' + HOME_HOST + '/';
const hostName = () => window.__vlHost || location.hostname;
const onOldHost = () => WEB && hostName() === OLD_HOST;
const onHomeHost = () => WEB && hostName() === HOME_HOST;
const isAdmin = () => !!(S.vault && V().profile.role === 'admin');
const CTYPE = {added:['New', 'plus'], improved:['Improved', 'refresh'], changed:['Changed', 'layers'], fixed:['Fixed', 'check'], security:['Security', 'shield'], maintenance:['Maintenance', 'sliders']};
const writtenChanges = () => CHANGES.filter(c => c.n);
const lastChangeN = () => writtenChanges().reduce((m, c) => Math.max(m, c.n), 0);
const changeApplies = c => c.n && (c.audience !== 'admin' || isAdmin());
const changeTime = c => { const t = Date.parse(c.at.length > 10 ? c.at : c.at + 'T12:00'); return isNaN(t) ? 0 : t; };
const fmtChangeDay = c => new Date(changeTime(c)).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric', year:'numeric'});
const fmtChangeTime = c => c.at.length > 10 ? new Date(changeTime(c)).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'}) : '';
const commitURL = c => c.commit ? `https://github.com/${c.repo || 'c3jumpw/mco'}/commit/${c.commit}` : '';

/* which written changes this person has seen: kept in the vault, so it follows them across devices */
function seenChangeN(){
  const m = V().meta;
  if(m.seenChange) return m.seenChange;
  const v = LS.get(K.seen);   // what this device saw of the tour before the change log existed
  const upTo = pred => writtenChanges().filter(pred).reduce((mx, c) => Math.max(mx, c.n), 0);
  if(v) return upTo(c => vcmp(c.version, v) <= 0);
  const at = (S.header && S.header.createdAt) || 0;
  return upTo(c => changeTime(c) <= at);
}
function markChangesSeen(){
  if(!S.vault) return;
  if((V().meta.seenChange || 0) < lastChangeN()){ V().meta.seenChange = lastChangeN(); persist(); }
  if(TOUR) LS.set(K.seen, APP_VERSION);
}
/* after every unlock: a welcome banner for new vaults, otherwise What's new for changes that apply to this person */
function tourAfterUnlock(fresh){
  S.nudge = null;
  if(fresh){ V().meta.seenChange = lastChangeN(); if(TOUR){ LS.set(K.seen, APP_VERSION); S.nudge = {kind:'welcome'}; renderList(); } persist(); return; }
  const from = seenChangeN();
  const list = writtenChanges().filter(c => c.n > from && changeApplies(c));
  if(!list.length){ markChangesSeen(); return; }
  setTimeout(() => { if(S.phase === 'app' && !S.m && !T.open) openUpdates(list, from); }, 450);
}

/* ---------- What's new sheet ---------- */
function slideForFeature(f){
  if(!TOUR || !f) return null;
  for(const k of ['everyone', 'admin']){ const i = TOUR.tracks[k].slides.findIndex(s => s.feature === f); if(i >= 0) return {track:k, i, s:TOUR.tracks[k].slides[i]}; }
  return null;
}
function openUpdates(list, from, preview){
  if(!T.open) T.back = document.activeElement;
  Object.assign(T, {open:true, view:'updates', track:null, i:0, updates:list, updFrom:from, preview:preview || null});
  if(!tourEl){ tourEl = document.createElement('div'); tourEl.id = 'tour'; tourEl.className = 'tour'; document.body.appendChild(tourEl); wireTourSwipe(); }
  renderTour(true); document.documentElement.classList.add('tour-on');
}
function updatesHTML(){
  const list = T.updates, groups = [];
  for(const c of list.slice().reverse()){ let g = groups.find(x => x.version === c.version); if(!g){ g = {version:c.version, items:[]}; groups.push(g); } g.items.push(c); }
  const rel = v => (TOUR && TOUR.releases.find(r => r.version === v)) || null;
  const phone = matchMedia('(max-width:759px)').matches;
  const admins = list.some(c => c.audience === 'admin');
  const item = c => {
    const [label, icon] = CTYPE[c.type] || CTYPE.changed, sl = slideForFeature(c.feature);
    const shot = sl && TOUR.shots[(phone ? sl.s.p : sl.s.d) || sl.s.d];
    const name = sl && ((phone ? sl.s.p : sl.s.d) || sl.s.d);
    return `<li class="upd-item t-${c.type}"><span class="upd-ic">${ic(icon)}</span>
      <div class="upd-tx"><span class="upd-tags"><span class="pill t-${c.type}">${label}</span>${c.audience === 'admin' ? '<span class="pill adm">For admins</span>' : ''}</span>
        <b>${esc(c.title)}</b><p>${esc(c.text || '')}</p>${sl && !T.preview ? `<button class="linkish" data-act="upd-show" data-f="${esc(c.feature)}">Show me</button>` : ''}</div>
      ${shot ? `<button class="upd-thumb" data-act="upd-show" data-f="${esc(c.feature)}" ${T.preview ? 'disabled' : ''} aria-label="Show me: ${esc(c.title)}"><img src="/guide/img/${name}.webp" alt="" loading="lazy" decoding="async"></button>` : ''}</li>`;
  };
  const n = list.length;
  return `<div class="tour-head"><span class="tour-crumb">${T.preview ? 'Preview: what ' + (T.preview === 'admin' ? 'admins' : 'everyone') + ' see' : 'What\'s new'}</span><span class="sp"></span>
      <button class="icon-btn" data-act="tour-close" aria-label="Close" title="Close">${ic('x')}</button></div>
    <div class="upd">
      <div class="upd-hero">${MARK(54)}<div><h2 id="tour-title">What's new in Vaultleaf</h2>
        <p>${n} update${n === 1 ? '' : 's'} since you last opened it${admins ? ', including changes for admins' : ''}.</p></div></div>
      ${groups.map(g => { const r = rel(g.version); return `<section class="upd-rel"><div class="upd-rel-h"><span class="rel-v">${esc(g.version)}</span><div><b>${esc(r ? r.title : 'Version ' + g.version)}</b><small>${fmtChangeDay(g.items[0])}</small></div></div>
        <ul class="upd-list">${g.items.slice().reverse().map(item).join('')}</ul></section>`; }).join('')}
    </div>
    <div class="tour-foot"><span class="sp"></span>${TOUR && !T.preview ? `<button class="btn" data-act="upd-tour">${ic('cards','s')}Show me around</button>` : ''}<button class="btn primary" data-act="tour-close">Got it</button></div>`;
}

/* ---------- Admin page ---------- */
S.log = {aud:'all', order:'old', auto:true, q:'', types:new Set(Object.keys(CTYPE))};
function logFiltered(){
  const L = S.log, q = L.q.trim().toLowerCase();
  let out = CHANGES.filter(c => (L.auto || !c.auto) && L.types.has(c.type) && (L.aud === 'all' || c.audience === L.aud)
    && (!q || (c.title + ' ' + (c.text || '') + ' ' + (c.version || '') + ' ' + (c.commit || '')).toLowerCase().includes(q)));
  return L.order === 'old' ? out : out.slice().reverse();
}
function logListHTML(){
  const list = logFiltered();
  if(!list.length) return `<div class="empty" style="padding:30px 10px"><h2>No changes match</h2><p>Try another filter.</p></div>`;
  let day = '', out = '';
  for(const c of list){
    const d = fmtChangeDay(c);
    if(d !== day){ if(day) out += '</ol>'; out += `<h3 class="log-day">${d}</h3><ol class="log-tl">`; day = d; }
    const [label, icon] = CTYPE[c.type] || CTYPE.changed;
    out += `<li class="log-item t-${c.type}${c.auto ? ' auto' : ''}"><span class="log-dot">${ic(icon)}</span><div class="log-body">
      <div class="log-meta"><span class="pill t-${c.type}">${label}</span><span class="pill ${c.audience === 'admin' ? 'adm' : 'all'}">${c.audience === 'admin' ? 'Admins' : 'Everyone'}</span>${c.version ? `<span class="pill ver">v${esc(c.version)}</span>` : ''}${c.auto ? '<span class="pill auto">Logged automatically</span>' : ''}<span class="log-time">${fmtChangeTime(c)}</span></div>
      <b>${esc(c.title)}</b>${c.text ? `<p>${esc(c.text)}</p>` : ''}${c.commit ? `<a class="log-commit mono" href="${commitURL(c)}" target="_blank" rel="noopener">${ic('ext','s')}${esc(c.commit)}</a>` : ''}</div></li>`;
  }
  return out + '</ol>';
}
function renderLog(){
  const el = $('#lg-list'); if(!el) return;
  el.innerHTML = logListHTML();
  const n = logFiltered().length, c = $('#lg-count'); if(c) c.textContent = `Showing ${n} of ${CHANGES.length} changes`;
  document.querySelectorAll('[data-act="lg-aud"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.log.aud));
  document.querySelectorAll('[data-act="lg-order"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.log.order));
  document.querySelectorAll('[data-act="lg-type"]').forEach(b => b.setAttribute('aria-pressed', S.log.types.has(b.dataset.v)));
}
function adminHTML(){
  const w = writtenChanges(), auto = CHANGES.length - w.length, last = CHANGES[CHANGES.length - 1];
  const rel = TOUR ? TOUR.releases[TOUR.releases.length - 1] : null;
  const link = (href, label, sub, icon) => `<div class="set-row"><span class="ol">${label}<small>${sub}</small></span><a class="btn small" href="${href}" target="_blank" rel="noopener">${ic(icon || 'ext','s')}Open</a></div>`;
  return `<div class="page admin-page">${pageHead('Admin')}
    <div class="banner adm-banner" style="margin:0">${ic('shield','s')}<b>For the people who run Vaultleaf. Nothing here can open or reset anyone's vault.</b></div>
    <div class="panel"><div class="panel-h"><h2>This version</h2></div><div class="panel-b"><div class="adm-stats">
      <div class="adm-stat"><small>Version</small><b>${esc(APP_VERSION || (w.length ? w[w.length - 1].version : ''))}</b><span>${rel ? 'Released ' + fmtRel(rel.date) : ''}</span></div>
      <div class="adm-stat"><small>Changes logged</small><b class="tnum">${CHANGES.length}</b><span>${w.length} written, ${auto} automatic</span></div>
      <div class="adm-stat"><small>Last change</small><b>${last ? new Date(changeTime(last)).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : '—'}</b><span>${last ? esc(last.title) : ''}</span></div>
      <div class="adm-stat"><small>This address</small><b class="adm-host">${esc(location.host)}</b><span>${onOldHost() ? 'Moving to ' + HOME_HOST : hostName() === HOME_HOST ? 'The main address' : 'Main address: ' + HOME_HOST}</span></div>
    </div></div></div>
    <div class="panel" id="adm-log"><div class="panel-h"><h2>Change log</h2><p>Every change to Vaultleaf since it launched, in the order it happened. Written entries come from <span class="mono">src/changelog.json</span>; the docs workflow logs every other change automatically.</p></div><div class="panel-b">
      <div class="log-tools">
        <div class="seg" role="group" aria-label="Who it's for">${[['all','All'],['everyone','Everyone'],['admin','Admins']].map(([k, l]) => `<button data-act="lg-aud" data-v="${k}" aria-pressed="${S.log.aud === k}">${l}</button>`).join('')}</div>
        <div class="seg" role="group" aria-label="Order">${[['old','Oldest first'],['new','Newest first']].map(([k, l]) => `<button data-act="lg-order" data-v="${k}" aria-pressed="${S.log.order === k}">${l}</button>`).join('')}</div>
        <div class="search log-search">${ic('search')}<input id="lg-q" class="input" type="search" placeholder="Search the log" value="${esc(S.log.q)}" aria-label="Search the change log"></div>
      </div>
      <div class="log-types" role="group" aria-label="Kinds of change">${Object.entries(CTYPE).map(([k, [l]]) => `<button class="chip t-${k}" data-act="lg-type" data-v="${k}" aria-pressed="${S.log.types.has(k)}">${l}</button>`).join('')}
        <label class="check log-auto"><input type="checkbox" id="lg-auto" ${S.log.auto ? 'checked' : ''}><span>Automatic entries</span></label></div>
      <p class="hint tnum" id="lg-count" style="margin:0">Showing ${logFiltered().length} of ${CHANGES.length} changes</p>
      <div id="lg-list" class="log-list">${logListHTML()}</div>
      <div class="log-dl"><span class="hint">Keep a copy:</span><button class="btn small" data-act="lg-dl" data-v="json">${ic('download','s')}JSON</button><button class="btn small" data-act="lg-dl" data-v="csv">${ic('download','s')}CSV</button><button class="btn small" data-act="lg-dl" data-v="md">${ic('download','s')}Markdown</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>What people see</h2><p>The first time someone unlocks after an update, they see the written changes for their role: everyone sees changes for everyone, and admins also see admin changes. Automatic entries are never shown to people.</p></div><div class="panel-b">
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="adm-preview" data-v="everyone">${ic('eye','s')}Preview as everyone</button><button class="btn" data-act="adm-preview" data-v="admin">${ic('eye','s')}Preview as an admin</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Admin help</h2></div><div>
      <div class="set-row"><span class="ol">Admin tour<small>Access, updates, sync storage and helping people, step by step</small></span>${TOUR ? `<button class="btn small" data-act="tour-go" data-v="admin">${ic('cards','s')}Start</button>` : guideLink('btn small', 'Open')}</div>
      <div class="set-row"><span class="ol">Admin guide<small>The For admins part of the illustrated guide</small></span>${WEB ? `<button class="btn small" data-act="adm-guide">${ic('question','s')}Open</button>` : `<a class="btn small" href="${GUIDE_URL}#admins" target="_blank" rel="noopener">${ic('question','s')}Open</a>`}</div>
      ${link('https://vercel.com/c3-jumpw/mco-vault-leaf', 'Vercel project', 'Deployments, rollback, domains and who can open the site')}
      ${link('https://github.com/c3jumpw/mco/tree/main/vault-leaf', 'Code', 'The vault-leaf folder of c3jumpw/mco')}
      ${link('https://github.com/c3jumpw/mco/actions/workflows/vault-leaf-docs.yml', 'Docs workflow', 'Every run that refreshed the tour, guide and change log')}
      ${link('https://supabase.com/dashboard/project/symbmscaajjmgywbifhv', 'Sync storage', 'MKC-Admin project, vaultleaf_ tables')}
    </div></div>
  </div>`;
}
function changeLogExport(kind){
  const rows = CHANGES;
  if(kind === 'json') return JSON.stringify({app:'Vaultleaf', exportedAt:new Date().toISOString(), version:APP_VERSION, order:'oldest first', entries:rows}, null, 2);
  if(kind === 'csv'){
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    return ['date_time,version,type,audience,title,details,commit,logged_automatically'].concat(rows.map(c => [c.at, c.version || '', c.type, c.audience, c.title, c.text || '', c.commit || '', c.auto ? 'yes' : 'no'].map(q).join(','))).join('\r\n');
  }
  let md = `# Vaultleaf change log\n\nOldest first. Exported ${new Date().toLocaleString()}.\n`, day = '';
  for(const c of rows){ const d = c.at.slice(0, 10); if(d !== day){ md += `\n## ${d}\n\n`; day = d; } md += `- **${(CTYPE[c.type] || CTYPE.changed)[0]}${c.audience === 'admin' ? ', admins' : ''}${c.version ? ', v' + c.version : ''}:** ${c.title}${c.text ? '. ' + c.text.replace(/\.$/, '') + '.' : ''}${c.commit ? ` (${c.commit})` : ''}\n`; }
  return md;
}

/* ---------- role ---------- */
function rolePanelHTML(){
  const a = isAdmin();
  return `<div class="panel"><div class="panel-h"><h2>Your role</h2><p>Admins run the Vaultleaf site. Your role changes what you see, not what you can open: nobody can see anyone else's vault.</p></div><div>
    <div class="set-row"><span class="ol">I use Vaultleaf as<small>${a ? 'You see the Admin page and hear about admin changes.' : 'Admins also get the Admin page and hear about admin changes.'}</small></span>
      <div class="seg" role="group" aria-label="Role"><button data-act="role" data-v="member" aria-pressed="${!a}">Everyday user</button><button data-act="role" data-v="admin" aria-pressed="${a}">Site admin</button></div></div>
    ${a ? `<div class="set-row"><span class="ol">Admin page<small>Change log, what people see after updates, and admin links</small></span><button class="btn small" data-act="tab" data-v="admin">${ic('users','s')}Open</button></div>` : ''}
  </div></div>`;
}

/* ---------- the new address ---------- */
function checkNewAddress(){
  if(!onOldHost() || S.moveChecked) return;
  S.moveChecked = true;
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
  fetch(HOME_URL + 'manifest.webmanifest', {mode:'no-cors', cache:'no-store', credentials:'omit', signal:ctl.signal})
    .then(() => { S.moveReady = true; if(S.phase === 'app') renderList(); else render(); }).catch(() => {});
}
function moveBannerHTML(){
  if(!onOldHost() || !S.moveReady || S.moveLater) return '';
  return `<div class="banner move-banner">${ic('cloud','s')}<b>Vaultleaf has a new address: ${HOME_HOST}. Bring your vault over in about a minute.</b><button class="btn small primary" data-act="move">Move my vault</button><button class="icon-btn" data-act="move-later" aria-label="Remind me next time" title="Remind me next time">${ic('x','s')}</button></div>`;
}
function authMoveHTML(){
  if(!WEB) return '';
  if(onOldHost() && S.moveReady) return S.phase === 'setup'
    ? `<div class="banner move-banner" style="margin:0">${ic('cloud','s')}<b>Vaultleaf now lives at ${HOME_HOST}. Set up your vault there instead.</b><a class="btn small primary" href="${HOME_URL}">Go there</a></div>`
    : `<div class="banner move-banner" style="margin:0">${ic('cloud','s')}<b>Vaultleaf has a new address: ${HOME_HOST}. Unlock here, then follow Move my vault to bring your accounts over.</b></div>`;
  if(onHomeHost() && S.phase === 'setup' && S.setup && S.setup.step === 1 && !S.setup.importVault)
    return `<div class="banner" style="margin:0">${ic('cloud','s')}<b>Used Vaultleaf at ${OLD_HOST}? Don't start over: choose Use my vault from another device and enter your sync code, or restore a backup file.</b></div>`;
  return '';
}
function openMove(){
  const sync = syncOn(), code = V().settings.syncCode || Cloud.code;
  openModal({title:'Move to the new address', code, wide:true, body:`<p>Vaultleaf now lives at <b>${HOME_HOST}</b>. Your vault is saved in this browser at this address, so bring it over once.</p>
    ${sync ? `<ol class="move-steps">
      <li><b>Copy your sync code.</b>${syncCodeHTML(code)}<button class="btn small" data-act="sync-copy">${ic('copy','s')}Copy code</button></li>
      <li><b>Open the new address.</b><a class="btn small primary" href="${HOME_URL}" target="_blank" rel="noopener">${ic('ext','s')}Open ${HOME_HOST}</a></li>
      <li><b>Choose Use my vault from another device,</b> paste the code, and unlock with your usual password and passcode.</li></ol>`
    : `<ol class="move-steps">
      <li><b>Turn on sync</b> to get a sync code. Only encrypted data is uploaded.<button class="btn small primary" data-act="move-sync">${ic('cloud','s')}Turn on sync</button>
        <span class="hint">Or use a backup instead: <button class="linkish" data-act="m-backup">download a backup</button>, then on the new address choose Restore a backup or emergency kit.</span></li>
      <li><b>Open the new address</b> and choose Use my vault from another device.<a class="btn small" href="${HOME_URL}" target="_blank" rel="noopener">${ic('ext','s')}Open ${HOME_HOST}</a></li>
      <li><b>Paste the sync code</b> and unlock with your usual password and passcode.</li></ol>`}
    <p class="hint" style="margin:0">Face ID or fingerprint unlock needs turning on again at the new address. This copy stays here until you delete it, so nothing is lost if you stop halfway.</p>`,
    foot:`<button class="btn primary" data-act="mclose">Done</button>`});
}

Object.assign(ACT, {
  role(el){ const v = el.dataset.v === 'admin' ? 'admin' : 'member'; if((V().profile.role || 'member') === v) return;
    V().profile.role = v; V().profile.updatedAt = now(); persist(); if(v !== 'admin' && S.tab === 'admin') S.tab = 'settings';
    renderSide(); renderPage(); toast(v === 'admin' ? 'You\'re a site admin. Admin is in the sidebar and in Settings.' : 'Role set to everyday user', 'users'); },
  'lg-aud'(el){ S.log.aud = el.dataset.v; renderLog(); },
  'lg-order'(el){ S.log.order = el.dataset.v; renderLog(); },
  'lg-type'(el){ const t = el.dataset.v; if(S.log.types.has(t)) S.log.types.delete(t); else S.log.types.add(t); renderLog(); },
  'lg-dl'(el){ const k = el.dataset.v, ext = k === 'md' ? 'md' : k; saveFile(`vaultleaf-changelog-${new Date().toISOString().slice(0, 10)}.${ext}`, changeLogExport(k)).then(r => { if(r === 'saved') toast('Change log saved', 'download'); }); },
  'adm-preview'(el){ const who = el.dataset.v, lastV = writtenChanges().length ? writtenChanges()[writtenChanges().length - 1].version : '';
    const list = writtenChanges().filter(c => c.version === lastV && (who === 'admin' || c.audience !== 'admin'));
    openUpdates(list, 0, who); },
  'adm-guide'(){ S.guideHash = '#admins'; S.tab = 'guide'; renderApp(); },
  'upd-show'(el){ const sl = slideForFeature(el.dataset.f); if(!sl) return; markChangesSeen(); T.view = null; openTour(sl.track, sl.i); },
  'upd-tour'(){ const from = writtenChanges().find(c => c.n === T.updFrom); markChangesSeen(); T.view = null; openTour('new', 0, from ? from.version : '1.0'); },
  move(){ openMove(); },
  'move-later'(){ S.moveLater = true; renderList(); },
  async 'move-sync'(){ closeModal(); await turnOnSync(); }
});
document.addEventListener('input', e => { if(e.target.id === 'lg-q'){ S.log.q = e.target.value; renderLog(); } });
document.addEventListener('change', e => { if(e.target.id === 'lg-auto'){ S.log.auto = e.target.checked; renderLog(); } });
