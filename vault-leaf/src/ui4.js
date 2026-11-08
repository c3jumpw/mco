/* ---------- pages ---------- */
const guideLink = (cls, label) => WEB ? `<button class="${cls}" data-act="tab" data-v="guide">${ic('question','s')}${label}</button>` : `<a class="${cls}" href="${GUIDE_URL}" target="_blank" rel="noopener">${ic('question','s')}${label}</a>`;
function guidePageHTML(){
  return `<div class="guide-wrap"><div class="guide-bar"><b>Vaultleaf guide</b><span class="sp"></span><a class="btn small" href="${GUIDE_URL}" target="_blank" rel="noopener">${ic('ext','s')}Open in a new tab</a></div>
    <iframe class="guide-frame" src="${GUIDE_URL}" title="Vaultleaf guide"></iframe></div>`;
}
function wireGuideFrame(){
  const f = $('.guide-frame'); if(!f) return;
  f.addEventListener('load', () => { try{ const w = f.contentWindow; ['pointerdown','keydown','wheel','touchstart','scroll'].forEach(e => w.addEventListener(e, () => { lastAct = now(); }, {passive:true})); }catch(e){} });
}
const pageHead = t => `<div class="title-row"><h1 style="font-size:30px">${t}</h1><button class="icon-btn m-only" data-act="lock" aria-label="Lock vault" title="Lock">${ic('lock')}</button></div>`;
function renderPage(){
  const p = $('#page'); if(!p) return;
  if(S.tab === 'vault'){ p.innerHTML = ''; p.classList.remove('is-guide'); return; }
  if(S.tab === 'guide'){ if(!p.querySelector('.guide-frame')){ p.innerHTML = guidePageHTML(); wireGuideFrame(); } p.classList.add('is-guide'); return; }
  p.classList.remove('is-guide');
  const st = p.scrollTop;
  p.innerHTML = S.tab === 'generator' ? generatorHTML() : S.tab === 'health' ? healthHTML() : S.tab === 'activity' ? activityHTML() : settingsHTML();
  if(S.tab === 'generator') updateGenOut();
  p.scrollTop = st;
}
const genOpts = () => (V().settings.gen = {mode:'chars', len:20, lower:true, upper:true, digits:true, symbols:true, ambig:false, words:5, sep:'-', cap:true, num:true, ...(V().settings.gen || {})});
function regen(){ const g = genOpts(); S.genOut = g.mode === 'phrase' ? genPassphrase(g) : genPassword(g); }
const bitsInfo = b => { const sc = b < 28 ? 0 : b < 40 ? 1 : b < 60 ? 2 : b < 80 ? 3 : 4; return {cls:sc <= 1 ? 'bad' : sc === 2 ? 'warn' : 'good', label:['Very weak','Weak','Fair','Strong','Very strong'][sc]}; };
function updateGenOut(){
  const o = S.genOut, bi = bitsInfo(o.bits);
  const out = $('#gen-out'); if(out) out.innerHTML = colorize(o.value);
  const m = $('#gen-meta'); if(m) m.innerHTML = `<span class="pill ${bi.cls}">${bi.label}</span> <span class="hint">${o.bits} bits of randomness. Would take ${crackTime(o.bits)} to guess.</span>`;
}
function generatorHTML(){
  const g = genOpts(); if(!S.genOut) regen();
  const sw = (k, l, sub) => `<div class="opt-row"><label class="ol" for="g-${k}">${l}${sub ? `<small>${sub}</small>` : ''}</label><span class="switch"><input type="checkbox" id="g-${k}" data-gen="${k}" ${g[k] ? 'checked' : ''}><span></span></span></div>`;
  return `<div class="page">${pageHead('Password generator')}
    <div class="panel"><div class="gen-out mono" id="gen-out" aria-live="polite"></div>
      <div class="panel-b"><div class="gen-meta" id="gen-meta"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="gen-new">${ic('refresh','s')}New password</button><button class="btn primary" data-act="gen-copy">${ic('copy','s')}Copy</button><button class="btn" data-act="gen-use">${ic('key','s')}Use for an account</button></div></div></div>
    <div class="panel"><div class="panel-b">
      <div class="seg" role="group" aria-label="Kind of password"><button data-act="gen-mode" data-v="chars" aria-pressed="${g.mode === 'chars'}">Random characters</button><button data-act="gen-mode" data-v="phrase" aria-pressed="${g.mode === 'phrase'}">Passphrase</button></div>
      ${g.mode === 'chars' ? `
        <div class="field"><label for="g-len">Length: <span id="g-len-v" class="tnum">${g.len}</span> characters</label><input id="g-len" type="range" class="range" min="8" max="64" value="${g.len}" data-gen="len"></div>
        <div>${sw('lower','Lowercase letters')}${sw('upper','Capital letters')}${sw('digits','Numbers')}${sw('symbols','Symbols','! @ # $ % and similar')}${sw('ambig','Avoid look-alike characters','Leaves out 0 O 1 l I so it is easier to type')}</div>` : `
        <div class="field"><label for="g-words">Words: <span id="g-words-v" class="tnum">${g.words}</span></label><input id="g-words" type="range" class="range" min="3" max="10" value="${g.words}" data-gen="words"></div>
        <div class="opt-row"><label class="ol" for="g-sep">Between words</label><select id="g-sep" class="input" style="width:auto" data-gen="sep">${[['-','Dash'],['.','Period'],['_','Underscore'],[' ','Space'],[',','Comma'],['','Nothing']].map(([v, l]) => `<option value="${esc(v)}" ${g.sep === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${sw('cap','Capitalize each word')}${sw('num','Add a number')}
        <p class="hint" style="margin:0">Words are picked at random from the EFF long wordlist of 7,776 words.</p>`}
    </div></div></div>`;
}
function healthData(){
  const accs = V().accounts.filter(a => !a.trashedAt), withPw = accs.filter(a => a.password);
  const weak = withPw.filter(a => strength(a.password).score <= 1);
  const groups = new Map(); for(const a of withPw){ const g = groups.get(a.password) || []; g.push(a); groups.set(a.password, g); }
  const reusedGroups = [...groups.values()].filter(g => g.length > 1);
  const reused = new Set(reusedGroups.flat());
  const old = withPw.filter(isOld);
  const no2fa = withPw.filter(a => !a.fields.some(f => f.type === 'totp' && f.value));
  const bad = new Set([...weak, ...reused, ...old]);
  const score = withPw.length ? Math.round(100 * (withPw.length - bad.size) / withPw.length) : 100;
  return {accs, withPw, weak, reusedGroups, reused, old, no2fa, score};
}
function healthHTML(){
  const h = healthData();
  const col = h.score >= 80 ? 'var(--ok)' : h.score >= 50 ? 'var(--warn)' : 'var(--danger)';
  const C = 2 * Math.PI * 40;
  const row = (a, why, pill) => `<div class="hrow" role="button" tabindex="0" data-act="goto" data-id="${a.id}">${tile(a, 36)}<div style="min-width:0"><b>${esc(a.tool)}</b>${a.accountName ? ` <span class="muted">${esc(a.accountName)}</span>` : ''}<div class="hint">${why}</div></div>${pill}</div>`;
  const block = (title, sub, rows) => `<div class="panel"><div class="panel-h"><h2>${title}</h2><p>${sub}</p></div><div style="padding-top:8px">${rows || `<p class="hint" style="padding:0 16px 16px;margin:0">${ic('check','s')} Nothing to fix here.</p>`}</div></div>`;
  return `<div class="page">${pageHead('Password health')}
    <div class="panel"><div class="score"><div class="score-dial"><svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="40" stroke="var(--line)"/><circle cx="48" cy="48" r="40" stroke="${col}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - h.score / 100)}"/></svg><b class="tnum">${h.score}</b></div>
      <div><h2 style="font-size:20px">${h.score >= 80 ? 'In good shape' : h.score >= 50 ? 'A few things to fix' : 'Needs attention'}</h2><p class="muted" style="margin:4px 0 0">${h.withPw.length - new Set([...h.weak, ...h.reused, ...h.old]).size} of ${h.withPw.length} saved passwords have no problems.</p></div></div>
      <div class="stat-row"><div><b class="tnum">${h.weak.length}</b><span>Weak</span></div><div><b class="tnum">${h.reused.size}</b><span>Reused</span></div><div><b class="tnum">${h.old.length}</b><span>Overdue</span></div></div></div>
    ${block('Weak passwords', 'Easy to guess. Generate a new one and update it on the site.', h.weak.map(a => row(a, 'Rated ' + strength(a.password).label.toLowerCase(), `<span class="pill bad">Weak</span>`)).join(''))}
    ${block('Reused passwords', 'If one site leaks, every account sharing the password is exposed.', h.reusedGroups.map(g => g.map(a => row(a, `Same password as ${listJoin(g.filter(x => x !== a).map(x => esc(x.tool)))}`, `<span class="pill bad">${g.length} accounts</span>`)).join('')).join(''))}
    ${block('Due for a change', 'Past your reminder, or not changed in over a year.', h.old.map(a => row(a, 'Password set ' + ago(a.pwChangedAt || a.createdAt), `<span class="pill warn">${ic('clock','s')}Overdue</span>`)).join(''))}
    ${block('No 2FA code saved', 'Turn on two-step sign-in where the site offers it, then save the setup key here.', h.no2fa.map(a => row(a, 'Has a password but no 2FA code', `<span class="pill info">Optional</span>`)).join(''))}
  </div>`;
}
function activityHTML(){
  const f = S.actFilter, ev = [];
  for(const a of V().accounts){
    if(f !== 'changes') for(const c of a.copies) ev.push({at:c.at, a, kind:'copy', text:'Copied ' + c.field.toLowerCase()});
    if(f !== 'copies') for(const h of a.history) ev.push({at:h.at, a, kind:h.kind, text:h.text});
  }
  ev.sort((x, y) => y.at - x.at);
  const list = ev.slice(0, 300);
  let last = null, out = '';
  for(const e of list){
    const g = dateGroup(e.at); if(g !== last){ out += `${last ? '</ul>' : ''}<div class="group-h" style="padding-left:16px">${esc(g)}</div><ul class="log">`; last = g; }
    out += `<li role="button" tabindex="0" data-act="goto" data-id="${e.a.id}" style="cursor:pointer"><span class="ic ${e.kind === 'copy' ? 'copy' : e.kind === 'password' ? 'pw' : ''}">${ic(e.kind === 'copy' ? 'copy' : e.kind === 'password' ? 'key' : e.kind === 'created' ? 'plus' : e.kind === 'trash' ? 'trash' : 'edit', 's')}</span><span class="what">${esc(e.text)}<small>${esc(e.a.tool)}${e.a.accountName ? ', ' + esc(e.a.accountName) : ''}</small></span><span class="when" title="${esc(fmtDT(e.at))}">${fmtTime(e.at)}</span></li>`;
  }
  if(last) out += '</ul>';
  return `<div class="page">${pageHead('Activity')}
    <div class="seg" role="group" aria-label="Show" style="justify-self:start">${[['all','Everything'],['copies','Copies'],['changes','Changes']].map(([k, l]) => `<button data-act="act-filter" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
    <div class="panel">${out || '<p class="hint" style="padding:16px;margin:0">Nothing yet. Copies and edits show up here with the date and time.</p>'}</div>
    ${ev.length > 300 ? `<p class="hint">Showing the latest 300 of ${ev.length} events.</p>` : ''}</div>`;
}
function settingsHTML(){
  const s = V().settings, p = V().profile;
  const opt = (path, cur, opts) => `<select class="input" data-set="${path}" data-num="1" id="set-${path.replace(/\./g, '-')}">${opts.map(([v, l]) => `<option value="${v}" ${+cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const sw = (path, on, id) => `<span class="switch"><input type="checkbox" id="${id}" data-set="${path}" ${on ? 'checked' : ''}><span></span></span>`;
  const exN = V().accounts.filter(a => a.example).length;
  const lastB = V().meta.lastBackupAt;
  return `<div class="page">${pageHead('Settings')}
    <div class="banner" style="margin:0">${ic('question','s')}<b>New here, or showing someone else? The guide walks through every screen with pictures.</b>${guideLink('btn small', 'Open the guide')}</div>
    <div class="panel"><div class="panel-h"><h2>Your account</h2><p>Shown on your backups and recovery kit.</p></div><div class="panel-b">
      <div class="grid2"><div class="field"><label for="p-name">Name</label><input id="p-name" class="input" data-prof="name" value="${esc(p.name)}" autocomplete="name"></div><div class="field"><label for="p-email">Email</label><input id="p-email" class="input" type="email" data-prof="email" value="${esc(p.email)}" autocomplete="email"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="m-chpw">${ic('key','s')}Change master password</button><button class="btn" data-act="m-chpc">${ic('lock','s')}Change passcode</button><button class="btn" data-act="m-newrk">${ic('shield','s')}New recovery key</button></div>
      <p class="hint" style="margin:0">Password last changed ${fmtDate(S.header.credAt)}. Recovery key created ${fmtDate(S.header.rkAt || S.header.createdAt)}.</p>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Security</h2></div><div>
      <div class="set-row"><label class="ol" for="set-settings-autoLockMin">Lock automatically<small>After this long without activity</small></label>${opt('settings.autoLockMin', s.autoLockMin, [[1,'1 minute'],[2,'2 minutes'],[5,'5 minutes'],[10,'10 minutes'],[15,'15 minutes'],[30,'30 minutes'],[0,'Never']])}</div>
      <div class="set-row"><label class="ol" for="s-hide">Lock when I leave the app<small>If it's in the background for over a minute</small></label>${sw('settings.lockOnHide', s.lockOnHide, 's-hide')}</div>
      <div class="set-row"><label class="ol" for="set-settings-revealSec">Hide shown secrets again<small>After you tap the eye</small></label>${opt('settings.revealSec', s.revealSec, [[10,'After 10 seconds'],[30,'After 30 seconds'],[60,'After 1 minute'],[300,'After 5 minutes']])}</div>
      <div class="set-row"><label class="ol" for="set-settings-clipSec">Clear copied secrets<small>Where your browser allows it</small></label>${opt('settings.clipSec', s.clipSec, [[0,'Off'],[20,'After 20 seconds'],[30,'After 30 seconds'],[60,'After 1 minute'],[120,'After 2 minutes']])}</div>
      <div class="set-row"><label class="ol" for="set-settings-rotateDays">Default password reminder<small>Accounts with their own reminder keep it</small></label>${opt('settings.rotateDays', s.rotateDays, [[0,'Off'],[90,'Every 90 days'],[180,'Every 6 months'],[365,'Every year']])}</div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Appearance</h2></div><div>
      <div class="set-row"><span class="ol">View<small>Classic reads like a notes app</small></span><div class="seg" role="group" aria-label="View"><button data-act="view" data-v="classic" aria-pressed="${s.view === 'classic'}">Classic</button><button data-act="view" data-v="modern" aria-pressed="${s.view === 'modern'}">Modern</button></div></div>
      <div class="set-row"><span class="ol">Theme</span><div class="seg" role="group" aria-label="Theme">${[['auto','Auto'],['light','Light'],['dark','Dark']].map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${s.theme === k}">${l}</button>`).join('')}</div></div>
    </div></div>
    <div class="panel"><div class="panel-h" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding-bottom:10px"><h2>Labels</h2><button class="btn small" data-act="label-new">${ic('plus','s')}New label</button></div>
      <div class="labels-tree">${labelTree().map(({l, d}) => `<div class="lt-row"><span style="width:${d * 18}px;flex:none"></span><span class="dot" style="width:12px;height:12px;border-radius:50%;background:${l.color};flex:none"></span><span class="nm">${esc(l.name)}</span><span class="hint tnum">${V().accounts.filter(a => !a.trashedAt && a.labels.includes(l.id)).length}</span><button class="icon-btn" data-act="label-edit" data-id="${l.id}" aria-label="Edit ${esc(l.name)}">${ic('edit','s')}</button></div>`).join('') || '<p class="hint" style="padding:0 16px 14px;margin:0">No labels yet. Labels can hold sub-labels, like Work and Work / Cloud.</p>'}</div></div>
    <div class="panel"><div class="panel-h"><h2>Sync and backup</h2><p id="syncstate">${syncLine()}</p></div><div>
      ${Cloud.ready ? `<div class="set-row"><label class="ol" for="s-sync">Sync across my devices<small>Encrypted before upload. Open this same page on your phone or computer.</small></label>${sw('settings.sync', s.sync, 's-sync')}</div>
      ${s.sync ? `<div class="set-row"><span class="ol">Sync now<small>Pull changes from your other devices</small></span><button class="btn small" data-act="sync-now">${ic('refresh','s')}Sync</button></div>` : ''}` : `<div class="set-row"><span class="ol">Saved on this device only<small>To use another phone or computer, back up below and restore the file there.</small></span></div>`}
      <div class="set-row"><span class="ol">Encrypted backup<small>${lastB ? 'Last backup ' + fmtDT(lastB) : 'No backup yet. Keep one somewhere other than this device.'}</small></span><button class="btn small" data-act="m-backup">${ic('download','s')}Back up</button></div>
      <div class="set-row"><span class="ol">Restore a backup<small>Add accounts back from a backup file</small></span><button class="btn small" data-act="m-restore">${ic('restore','s')}Restore</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Import and export</h2></div><div>
      <div class="set-row"><span class="ol">Import from Notes<small>Paste your notes. Each note becomes an account.</small></span><button class="btn small" data-act="import-notes">${ic('import','s')}Import</button></div>
      <div class="set-row"><span class="ol">Import a CSV file<small>From Chrome, Safari, Bitwarden, 1Password or LastPass</small></span><button class="btn small" data-act="import-csv">${ic('upload','s')}Import</button></div>
      <div class="set-row"><span class="ol">Export as CSV<small>Not encrypted. For moving to another manager.</small></span><button class="btn small" data-act="m-export">${ic('download','s')}Export</button></div>
      ${exN ? `<div class="set-row"><span class="ol">Example accounts<small>${exN} example account${exN === 1 ? '' : 's'} in your vault</small></span><button class="btn small" data-act="rm-examples">Remove</button></div>` : ''}
      <div class="set-row"><span class="ol">Recently deleted<small>${V().accounts.filter(a => a.trashedAt).length} account(s), kept for 30 days</small></span><button class="btn small" data-act="filter" data-v="trash">Open</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Delete this vault</h2><p>Erases every account on this device${Cloud.ready ? ' and in sync' : ''}. Back up first if you might need anything.</p></div><div class="panel-b"><button class="btn danger" data-act="m-delete" style="justify-self:start">${ic('trash','s')}Delete vault</button></div></div>
    <p class="hint">Vaultleaf encrypts your vault with AES-256-GCM. The key comes from your master password and passcode together (PBKDF2-SHA-256, ${KDF_ITER.toLocaleString()} rounds) and never leaves this device. Passphrase words: EFF long wordlist, CC BY 3.0.</p>
  </div>`;
}

/* ---------- modals ---------- */
function credFields(prefix, len){
  return `<div class="field"><label for="${prefix}-pw">Master password</label><input id="${prefix}-pw" class="input" type="password" autocomplete="current-password" spellcheck="false"></div>
    <div class="field"><label for="${prefix}-pc">Passcode</label><input id="${prefix}-pc" class="input mono" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="${len || 6} digits"></div>`;
}
async function verifyCreds(pw, pc){ try{ await unwrapCreds(S.header, pw, pc); return true; }catch(e){ return false; } }
function mErr(msg){ const e = $('#m-err'); if(e){ e.textContent = msg; e.hidden = !msg; } }
const ERR = '<p class="err" id="m-err" role="alert" hidden></p>';

function openTemplates(){
  openModal({title:'Add an account', body:`<div class="menu">
    ${TEMPLATES.map(t => `<button data-act="tpl" data-v="${t.id}">${ic(t.icon)}<span>${esc(t.name)}<small>${esc(t.desc)}</small></span></button>`).join('')}
    <button data-act="tpl" data-v="note">${ic('notes')}<span>Write it as a note<small>Type it the way you do in your notes app</small></span></button>
    <button data-act="import-notes">${ic('import')}<span>Import from Notes<small>Paste many notes at once</small></span></button>
  </div>`});
}
function openMore(a){
  openModal({title:a.tool, body:`<div class="menu">
    <button data-act="edit" data-id="${a.id}" data-kind="form">${ic('edit')}<span>Edit as form</span></button>
    <button data-act="edit" data-id="${a.id}" data-kind="note">${ic('notes')}<span>Edit as note<small>All details as plain text</small></span></button>
    <button data-act="dup" data-id="${a.id}">${ic('layers')}<span>Duplicate<small>Start a similar account from this one</small></span></button>
    <button class="danger" data-act="trash" data-id="${a.id}">${ic('trash')}<span>Delete<small>Kept in Recently deleted for 30 days</small></span></button></div>`});
}
function openLabel(id){
  const l = id ? labelById(id) : {name:'', parentId:null, color:COLORS[V().labels.length % COLORS.length]};
  S.m = null;
  const excluded = id ? labelDesc(id) : new Set();
  openModal({title:id ? 'Edit label' : 'New label', labelId:id, color:l.color, body:`
    <div class="field"><label for="lb-name">Name</label><input id="lb-name" class="input" value="${esc(l.name)}" autofocus></div>
    <div class="field"><label for="lb-parent">Inside</label><select id="lb-parent" class="input"><option value="">Nothing (top level)</option>${labelTree().filter(({l: x}) => !excluded.has(x.id)).map(({l: x}) => `<option value="${x.id}" ${l.parentId === x.id ? 'selected' : ''}>${esc(labelPath(x.id))}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Color</span><div class="swatches" role="group" aria-label="Color">${COLORS.map(c => `<button data-act="lb-color" data-v="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${c === l.color}"></button>`).join('')}</div></div>${ERR}`,
    foot:`${id ? `<button class="btn danger" data-act="lb-del" style="margin-right:auto">Delete</button>` : ''}<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="lb-save">Save label</button>`});
}
function saveLabel(){
  const m = S.m, name = $('#lb-name').value.trim().replace(/\//g, '-'), parent = $('#lb-parent').value || null;
  if(!name) return mErr('Give the label a name.');
  if(V().labels.some(x => x.id !== m.labelId && x.name.toLowerCase() === name.toLowerCase() && (x.parentId || null) === parent)) return mErr('A label with that name is already there.');
  if(m.labelId){ const l = labelById(m.labelId); Object.assign(l, {name, parentId:parent, color:m.color, updatedAt:now()}); }
  else V().labels.push({id:uid(), name, parentId:parent, color:m.color, updatedAt:now()});
  hayCache = new WeakMap(); persist(); closeModal(); renderApp(); toast('Label saved');
}
function deleteLabel(){
  const id = S.m.labelId, ids = labelDesc(id), l = labelById(id);
  const n = V().accounts.filter(a => a.labels.some(x => ids.has(x))).length;
  confirmBox({title:`Delete “${l.name}”?`, text:`${ids.size > 1 ? `Its ${ids.size - 1} sub-label${ids.size > 2 ? 's are' : ' is'} deleted too. ` : ''}${n ? `${n} account${n === 1 ? '' : 's'} lose${n === 1 ? 's' : ''} this label but nothing else changes.` : 'No accounts use it.'}`, ok:'Delete label', danger:true, onOk:() => {
    const t = now();
    V().labels = V().labels.filter(x => !ids.has(x.id));
    for(const x of ids) V().tombstones.push({id:x, at:t});
    for(const a of V().accounts) if(a.labels.some(x => ids.has(x))){ a.labels = a.labels.filter(x => !ids.has(x)); a.updatedAt = t; }
    if(S.filter.startsWith('l:') && ids.has(S.filter.slice(2))) S.filter = 'all';
    hayCache = new WeakMap(); persist(); renderApp(); toast('Label deleted', 'trash');
  }});
}
function openChangePw(){
  openModal({title:'Change master password', body:`<p class="muted">Confirm who you are, then pick the new password. Your passcode stays the same.</p>${credFields('cp', S.header.pcLen)}
    <div class="field"><label for="cp-new">New master password</label><input id="cp-new" class="input" type="password" autocomplete="new-password" spellcheck="false" data-meter="cp-meter">${meterHTML('cp-meter')}</div>
    <div class="field"><label for="cp-new2">Type it again</label><input id="cp-new2" class="input" type="password" autocomplete="new-password" spellcheck="false"></div>${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="cp-go">Change password</button>`});
}
async function changePw(){
  const pw = $('#cp-pw').value, pc = $('#cp-pc').value, n1 = $('#cp-new').value, n2 = $('#cp-new2').value;
  if(n1.length < 10) return mErr('Use at least 10 characters for the new password.');
  if(n1 !== n2) return mErr('The new passwords don\'t match.');
  setModal(undefined, `<div class="spinner"></div>`);
  if(!await verifyCreds(pw, pc)){ setModal(undefined, `<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="cp-go">Change password</button>`); return mErr('Your current password or passcode is wrong.'); }
  const w = await wrapCreds(n1, pc, S.dekRaw);
  S.header = {...S.header, ...w, hdrAt:now()}; LS.set(K.header, S.header); if(syncOn()) pushNow();
  closeModal(); renderPage(); toast('Master password changed');
}
function openChangePc(){
  openModal({title:'Change passcode', body:`<p class="muted">Confirm who you are, then pick 4 to 8 new digits.</p>${credFields('cc', S.header.pcLen)}
    <div class="grid2"><div class="field"><label for="cc-new">New passcode</label><input id="cc-new" class="input mono" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off"></div>
    <div class="field"><label for="cc-new2">Type it again</label><input id="cc-new2" class="input mono" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off"></div></div>${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="cc-go">Change passcode</button>`});
}
async function changePc(){
  const pw = $('#cc-pw').value, pc = $('#cc-pc').value, n1 = $('#cc-new').value.trim(), n2 = $('#cc-new2').value.trim();
  if(!/^\d{4,8}$/.test(n1)) return mErr('The new passcode must be 4 to 8 digits.');
  if(n1 !== n2) return mErr('The new passcodes don\'t match.');
  if(!await verifyCreds(pw, pc)) return mErr('Your current password or passcode is wrong.');
  const w = await wrapCreds(pw, n1, S.dekRaw);
  S.header = {...S.header, ...w, hdrAt:now()}; LS.set(K.header, S.header); if(syncOn()) pushNow();
  closeModal(); renderPage(); toast('Passcode changed');
}
function openNewRk(){
  openModal({title:'New recovery key', body:`<p class="muted">This replaces your current recovery key. The old one stops working.</p>${credFields('rk', S.header.pcLen)}${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="rk-go">Create new key</button>`});
}
async function newRk(){
  const pw = $('#rk-pw').value, pc = $('#rk-pc').value;
  if(!await verifyCreds(pw, pc)) return mErr('Your password or passcode is wrong.');
  const rk = newRecoveryKey(), w = await wrapRecovery(rk, S.dekRaw);
  S.header = {...S.header, ...w, hdrAt:now()}; LS.set(K.header, S.header); if(syncOn()) pushNow();
  S.m.rk = rk;
  setModal(`<p>Save this key somewhere safe, away from this device. It's shown only now.</p><div class="rk">${rkHTML(rk)}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" style="flex:1" data-act="rk-copy">${ic('copy','s')}Copy key</button>${canDownload() ? `<button class="btn" style="flex:1" data-act="rk-dl">${ic('download','s')}Download kit</button>` : ''}</div>`,
    `<button class="btn primary" data-act="mclose">I saved it</button>`);
  renderPage();
}
async function openBackup(){
  await saveChain;
  const p = V().profile;
  const data = JSON.stringify({app:APP, kind:'backup', v:VER, exportedAt:now(), owner:p.name || '', count:V().accounts.filter(a => !a.trashedAt).length, header:S.header, body:S.body});
  const name = `vaultleaf-backup-${new Date().toISOString().slice(0, 10)}.json`;
  openModal({title:'Encrypted backup', backup:data, fname:name, body:`<p>The backup is encrypted. Opening it needs your current master password and passcode, or your recovery key.</p>
    <p class="muted">Keep it somewhere other than this device: a USB drive, a cloud drive, or emailed to yourself.</p>
    <div class="banner" style="margin:0">${ic('layers','s')}<b>${V().accounts.filter(a => !a.trashedAt).length} accounts, ${(data.length / 1024).toFixed(0)} KB</b></div>`,
    foot:`<button class="btn" data-act="bk-copy">${ic('copy','s')}Copy backup text</button>${canDownload() ? `<button class="btn primary" data-act="bk-dl">${ic('download','s')}Download file</button>` : ''}`});
}
function markBackup(){ V().meta.lastBackupAt = now(); persist(); renderPage(); }
function readFileInput(input){ return new Promise((res, rej) => { const f = input.files && input.files[0]; if(!f) return res(null); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); }); }
function openRestore(fresh){
  openModal({title:'Restore from backup', fresh, body:`<p class="muted">Choose the backup file, or paste its text.</p>
    <div class="field"><label for="rs-file">Backup file</label><input id="rs-file" class="input" type="file" accept=".json,.txt,application/json,text/plain"></div>
    <div class="field"><label for="rs-text">Or paste backup text</label><textarea id="rs-text" class="input mono" rows="3" spellcheck="false" placeholder='{"app":"vaultleaf","kind":"backup",…}'></textarea></div>
    <div class="field"><span class="lbl">Unlock the backup with</span><div class="seg" role="group"><button data-act="rs-mode" data-v="creds" aria-pressed="true">Password and passcode</button><button data-act="rs-mode" data-v="rk" aria-pressed="false">Recovery key</button></div></div>
    <div id="rs-creds">${credFields('rs')}</div>
    <div id="rs-rk" hidden><div class="field"><label for="rs-key">Recovery key</label><input id="rs-key" class="input mono" spellcheck="false" autocomplete="off"></div></div>${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="rs-go">Open backup</button>`});
  S.m.rsMode = 'creds';
}
async function restoreGo(){
  const m = S.m;
  let text = $('#rs-text').value.trim();
  try{ const ft = await readFileInput($('#rs-file')); if(ft) text = ft.trim(); }catch(e){}
  if(!text) return mErr('Choose a backup file or paste the backup text.');
  let bk; try{ bk = JSON.parse(text); }catch(e){ return mErr('That isn\'t a Vaultleaf backup. Check you picked the .json file it saved.'); }
  if(!bk || bk.app !== APP || !bk.header || !bk.body) return mErr('That isn\'t a Vaultleaf backup. Check you picked the .json file it saved.');
  mErr(''); setModal(undefined, '<div class="spinner"></div>');
  let raw;
  try{ raw = m.rsMode === 'rk' ? await unwrapRecovery(bk.header, $('#rs-key').value) : await unwrapCreds(bk.header, $('#rs-pw').value, $('#rs-pc').value); }
  catch(e){ setModal(undefined, `<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="rs-go">Open backup</button>`); return mErr(m.rsMode === 'rk' ? 'That recovery key doesn\'t open this backup.' : 'That password and passcode don\'t open this backup. Use the ones you had when it was made.'); }
  let vault;
  try{ vault = upgradeVault(await openVault(await dekKey(raw), bk.body)); }catch(e){ return mErr('The backup file is damaged and can\'t be read.'); }
  if(m.fresh){
    LS.set(K.header, bk.header); LS.set(K.body, bk.body); closeModal(); S.setup = null;
    await openWith(raw, bk.header, {vault, toast:`Restored ${vault.accounts.length} accounts`});
    return;
  }
  m.restored = vault;
  const n = vault.accounts.filter(a => !a.trashedAt).length, cur = new Set(V().accounts.map(a => a.id));
  const fresh = vault.accounts.filter(a => !cur.has(a.id)).length;
  setModal(`<p>The backup from ${fmtDT(bk.exportedAt)} holds <b>${n} accounts</b>. ${fresh} of them aren't in your vault right now.</p>
    <p class="muted"><b>Add missing accounts</b> keeps everything you have and brings back what's missing. <b>Replace</b> makes your vault exactly match the backup.</p>`,
    `<button class="btn" data-act="mclose">Cancel</button><button class="btn danger" data-act="rs-replace">Replace my vault</button><button class="btn primary" data-act="rs-merge">Add missing accounts</button>`);
}
function openImportNotes(){
  openModal({title:'Import from Notes', wide:true, body:`<p class="muted">Open each note in your notes app, copy everything, and paste below. Each note becomes an account; its first line becomes the name. Lines like <span class="mono">Password: …</span> become fields.</p>
    <div class="field"><label for="in-text">Your notes</label><textarea id="in-text" class="input" rows="9" spellcheck="false" placeholder="Netflix&#10;user: you@example.com&#10;pass: hunter2&#10;---&#10;Chase bank&#10;Username: mike77&#10;Password: …"></textarea></div>
    <div class="field"><span class="lbl">How are the notes separated?</span><div class="seg" role="group" style="flex-wrap:wrap"><button data-act="in-sep" data-v="dash" aria-pressed="true">A line with ---</button><button data-act="in-sep" data-v="blank" aria-pressed="false">Two blank lines</button><button data-act="in-sep" data-v="one" aria-pressed="false">It's one note</button></div></div>
    <div class="field"><label for="in-label">Label them all</label><input id="in-label" class="input" value="Imported" placeholder="Optional"></div>
    <div id="in-prev"></div>`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="in-go" id="in-go" disabled>Import</button>`});
  S.m.sep = 'dash'; S.m.items = [];
}
function previewNotes(){
  const m = S.m; if(!m) return;
  const text = $('#in-text').value;
  const parts = m.sep === 'one' ? (text.trim() ? [text.trim()] : []) : splitNotes(text, m.sep);
  m.items = parts.map(p => textToAccount(p));
  const prev = $('#in-prev'), btn = $('#in-go');
  if(!m.items.length){ prev.innerHTML = ''; btn.disabled = true; btn.textContent = 'Import'; return; }
  prev.innerHTML = `<span class="lbl">Preview</span><ul class="preview-list">${m.items.map(a => { const n = [a.username, a.email, a.password, a.url, a.accountName].filter(Boolean).length + a.fields.length + a.qa.length + a.admins.length; return `<li><b>${esc(a.tool)}</b><span class="hint">${n} detail${n === 1 ? '' : 's'}${a.password ? ', has password' : ''}${a.notes ? ', notes' : ''}</span></li>`; }).join('')}</ul>`;
  btn.disabled = false; btn.textContent = `Import ${m.items.length} account${m.items.length === 1 ? '' : 's'}`;
}
function importItems(items, labelName){
  for(const it of items){ if(labelName) it._labelPaths = [...(it._labelPaths || []), labelName]; commitAccount(it, true, true); }
  hayCache = new WeakMap(); persist();
  return items.length;
}
function openImportCsv(){
  openModal({title:'Import a CSV file', wide:true, body:`<p class="muted">Export your passwords as CSV from your browser or old password manager, then choose the file here. Delete the CSV afterwards: it isn't encrypted.</p>
    <div class="field"><label for="ic-file">CSV file</label><input id="ic-file" class="input" type="file" accept=".csv,text/csv,text/plain"></div>
    <div class="field"><label for="ic-label">Label them all</label><input id="ic-label" class="input" value="Imported" placeholder="Optional"></div>
    <div id="ic-prev"></div>${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="ic-go" id="ic-go" disabled>Import</button>`});
  S.m.items = [];
}
async function previewCsv(){
  const m = S.m; let text = '';
  try{ text = await readFileInput($('#ic-file')) || ''; }catch(e){ return mErr('That file could not be read.'); }
  const r = csvToAccounts(text);
  if(r.error){ m.items = []; $('#ic-prev').innerHTML = ''; $('#ic-go').disabled = true; return mErr(r.error); }
  mErr(''); m.items = r.items;
  $('#ic-prev').innerHTML = `<span class="lbl">Preview</span><ul class="preview-list">${r.items.slice(0, 200).map(a => `<li><b>${esc(a.tool)}</b><span class="hint">${esc(a.username || a.email || '')}</span></li>`).join('')}</ul>`;
  $('#ic-go').disabled = !r.items.length; $('#ic-go').textContent = `Import ${r.items.length} account${r.items.length === 1 ? '' : 's'}`;
}
function exportCsvText(){
  const rows = [['name','account','url','username','email','password','totp','labels','notes','stored','updated']];
  for(const a of V().accounts.filter(x => !x.trashedAt)){
    const extra = a.fields.filter(f => f.type !== 'totp').map(f => `${f.label}: ${f.value}`).concat(a.qa.map(q => `Q: ${q.q} A: ${q.a}`), a.admins.map(d => 'Admin: ' + adminStr(d)));
    rows.push([a.tool, a.accountName, a.url, a.username, a.email, a.password, (a.fields.find(f => f.type === 'totp') || {}).value || '', a.labels.map(labelPath).join('; '), [a.notes, ...extra].filter(Boolean).join('\n'), new Date(a.createdAt).toISOString(), new Date(a.updatedAt).toISOString()]);
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
function openExport(){
  openModal({title:'Export as CSV', csv:exportCsvText(), body:`<div class="banner" style="margin:0">${ic('warn','s')}<b>The CSV file is not encrypted. Anyone who opens it can read every password. Import it into your new manager, then delete it.</b></div>
    <p class="muted">Extra fields, security questions and admins are added to each account's notes column.</p>`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn" data-act="ex-copy">${ic('copy','s')}Copy CSV</button>${canDownload() ? `<button class="btn primary" data-act="ex-dl">${ic('download','s')}Download CSV</button>` : ''}`});
}
function openDelete(){
  openModal({title:'Delete this vault?', body:`<p>All ${V().accounts.length} accounts will be erased from this device${Cloud.ready && V().settings.sync ? ' and from sync' : ''}. Backup files you saved are not affected.</p>
    <div class="field"><label for="dv-type">Type DELETE to confirm</label><input id="dv-type" class="input" autocomplete="off" autocapitalize="characters"></div>${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn danger solid" data-act="dv-go">Delete everything</button>`});
}
async function deleteVault(){
  if($('#dv-type').value.trim().toUpperCase() !== 'DELETE') return mErr('Type DELETE to confirm.');
  if(Cloud.ready) await Cloud.wipe();
  LS.del(K.header); LS.del(K.body); S.cloudHeader = null; S.body = null; S.header = null;
  lock(''); S.phase = 'setup'; S.setup = newSetup(); render(); toast('Vault deleted', 'trash');
}
function openPickAccount(){
  const accs = V().accounts.filter(a => !a.trashedAt).sort((a, b) => a.tool.localeCompare(b.tool));
  openModal({title:'Use this password for…', body:`<div class="search">${ic('search')}<input id="pa-q" class="input" type="search" placeholder="Find an account" aria-label="Find an account" autocomplete="off"></div>
    <div class="menu" id="pa-list">${pickRows(accs)}</div>`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="pa-new">${ic('plus','s')}New account</button>`});
}
const pickRows = accs => accs.map(a => `<button data-act="pa-pick" data-id="${a.id}">${tile(a, 32)}<span>${esc(a.tool)}<small>${esc(a.accountName || a.username || a.email || '')}</small></span></button>`).join('') || '<p class="hint">No accounts match.</p>';
