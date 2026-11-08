/* ================= Vaultleaf: sync codes, Face ID, leak check, files, emergency kit ================= */

/* ---------- sync (website) ---------- */
function syncPanelHTML(){
  const on = syncOn();
  return `<div class="panel"><div class="panel-h"><h2>Sync between devices</h2><p id="syncstate">${syncLine()}</p></div><div>
    ${on ? `
      <div class="set-row"><span class="ol">Sync code<small>Enter it on your phone or computer to use this vault there.</small></span><button class="btn small" data-act="sync-show">${ic('key','s')}Show code</button></div>
      <div class="set-row"><span class="ol">Sync now<small>Get changes from your other devices</small></span><button class="btn small" data-act="sync-now">${ic('refresh','s')}Sync</button></div>
      <div class="set-row"><span class="ol">New sync code<small>If someone else may have seen the code. Other devices stop syncing until you enter the new one.</small></span><button class="btn small" data-act="sync-rotate">New code</button></div>
      <div class="set-row"><span class="ol">Turn off sync<small>Removes the synced copy. Every device keeps what it has.</small></span><button class="btn small danger" data-act="sync-off">Turn off</button></div>` : `
      <div class="set-row"><span class="ol">Use this vault on more than one device<small>Only encrypted data is uploaded. Your password and passcode never leave this device.</small></span><button class="btn small primary" data-act="sync-on">${ic('cloud','s')}Turn on</button></div>
      <div class="set-row"><span class="ol">Already syncing on another device?<small>Enter its sync code to combine it with this vault.</small></span><button class="btn small" data-act="sync-link">Enter code</button></div>`}
  </div></div>`;
}
function syncCodeHTML(code){ return `<div class="rk">${rkHTML(code)}</div>`; }
function openSyncCode(first){
  const code = V().settings.syncCode || Cloud.code;
  openModal({title:first ? 'Sync is on' : 'Your sync code', code, body:`${first ? '<p>Your vault is uploading in encrypted form. To use it on another phone or computer, you\'ll need this sync code.</p>' : ''}
    ${syncCodeHTML(code)}
    <ol class="howto-m"><li>On the other device, open Vaultleaf.</li><li>Choose <b>Use my vault from another device</b> (or, if it already has a vault, Settings, then <b>Enter code</b>).</li><li>Paste this code, then unlock with your usual password and passcode.</li></ol>
    <p class="hint" style="margin:0">The code only lets a device download your encrypted vault. It still needs your password and passcode to open it. Keep it private anyway.</p>`,
    foot:`<button class="btn" data-act="sync-copy">${ic('copy','s')}Copy code</button><button class="btn primary" data-act="mclose">Done</button>`});
}
async function turnOnSync(){
  const code = newSyncCode();
  await Cloud.use(code);
  V().settings.syncCode = code; V().settings.sync = true; V().settings.updatedAt = now();
  await persist(); await pushNow(); watchCloud();
  renderPage(); renderSide();
  if(Cloud.status === 'err'){ toast(Cloud.err, 'warn'); return; }
  openSyncCode(true);
}
async function turnOffSync(){
  await Cloud.drop(); Cloud.forget();
  V().settings.sync = false; V().settings.syncCode = ''; V().settings.updatedAt = now();
  clearTimeout(pushTimer); await persist(); setSync('ok'); renderPage(); renderSide();
  toast('Sync is off. This device keeps everything.', 'cloud');
}
async function rotateSync(){
  await Cloud.drop(); Cloud.forget();
  V().settings.sync = false; await turnOnSync();
}
function openLinkCode(fromSetup){
  openModal({title:fromSetup ? 'Use my vault from another device' : 'Enter a sync code', fromSetup, body:`<p class="muted">On the device you already use, open <b>Settings</b>, then <b>Sync code</b>, and copy the code shown there.</p>
    <div class="field"><label for="lk-code">Sync code</label><input id="lk-code" class="input mono" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autofocus></div>${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="lk-go">Find my vault</button>`});
}
async function linkGo(){
  const m = S.m, code = $('#lk-code').value.trim();
  if(normRK(code).length < 30) return mErr('Paste the whole sync code: 8 groups of 4 letters and numbers.');
  setModal(undefined, '<div class="spinner"></div>');
  const back = `<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="lk-go">Find my vault</button>`;
  const prev = Cloud.code;
  let h = null;
  try{ await Cloud.use(code); h = await Cloud.head(); }catch(e){ if(prev) await Cloud.use(prev); else Cloud.forget(); setModal(undefined, back); return mErr(e.message || 'Couldn\'t reach sync. Check your connection.'); }
  if(!h || !h.header){ if(prev) await Cloud.use(prev); else Cloud.forget(); setModal(undefined, back); return mErr('No synced vault uses that code. Check it on your other device: it may have been changed.'); }
  if(m.fromSetup){
    S.cloudHeader = h.header; closeModal();
    S.setup = null; S.phase = 'login'; S.auth = {step:1, pw:'', pc:'', err:'', info:'', busy:false}; render();
    return;
  }
  /* existing vault: it must be the same vault (same vault key), then the two copies are combined */
  try{
    const body = await Cloud.pull(h.meta);
    const remote = upgradeVault(await openVault(S.dek, body));
    Cloud.lastRev = h.meta.rev;
    await adoptHeader(h.header);
    S.vault = mergeVaults(V(), remote); hayCache = new WeakMap();
    V().settings.sync = true; V().settings.syncCode = Cloud.code; V().settings.updatedAt = now();
    closeModal(); await persist(); await pushNow(); watchCloud(); syncFiles(); renderApp();
    toast('Linked. This device now syncs with your other devices.', 'cloud');
  }catch(e){
    if(prev) await Cloud.use(prev); else Cloud.forget();
    setModal(undefined, back);
    mErr('That code belongs to a different vault. To switch to it, delete this vault in Settings, then choose Use my vault from another device.');
  }
}

/* ---------- Face ID / fingerprint ---------- */
function bioRowHTML(){
  const on = !!Bio.rec();
  return `<div class="set-row"><label class="ol" for="s-bio">Unlock with Face ID or fingerprint<small>${Bio.supported() ? `On this device only. Your password and passcode are still needed every ${BIO_MAX_DAYS} days.` : 'This browser can\'t do it. Try Safari on iPhone or Chrome on Android.'}</small></label>
    <span class="switch"><input type="checkbox" id="s-bio" ${on ? 'checked' : ''} ${Bio.supported() ? '' : 'disabled'}><span></span></span></div>`;
}
async function toggleBio(el){
  if(!el.checked){ Bio.remove(); toast('Face ID and fingerprint unlock is off on this device', 'lock'); return; }
  el.checked = false;
  if(!await Bio.available()){ toast('This device has no Face ID, fingerprint or device PIN set up.', 'warn'); return; }
  try{ await Bio.enroll(S.dekRaw, V().profile.email || V().profile.name || 'Vaultleaf vault'); el.checked = true; toast('Face ID or fingerprint can now unlock Vaultleaf on this device', 'check'); }
  catch(e){ if(e && e.name === 'NotAllowedError') toast('Setup was cancelled', 'warn'); else toast(e.message || 'That didn\'t work on this device.', 'warn'); }
  renderPage();
}

/* ---------- leaked password check ---------- */
const isLeaked = a => !!(a.password && a.leak && a.leak.n > 0 && a.leak.pwAt === (a.pwChangedAt || a.createdAt));
function leakPanelHTML(h, row, block){
  const last = V().accounts.reduce((m, a) => Math.max(m, (a.leak && a.leak.at) || 0), 0);
  const top = `<div class="panel"><div class="panel-h"><h2>Leaked passwords</h2>
      <p>Checks each password against Have I Been Pwned, a list of over 900 million passwords exposed in data breaches. Only the first 5 characters of a scrambled fingerprint of each password are sent, never the password.</p></div>
    <div class="panel-b" style="padding-top:12px"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <button class="btn primary" data-act="leak-check" ${S.leakBusy ? 'disabled' : ''}>${ic('shield','s')}${S.leakBusy ? 'Checking ' + S.leakBusy : last ? 'Check again' : 'Check my passwords'}</button>
      <span class="hint">${last ? `Last checked ${ago(last)}. ${h.checked} of ${h.withPw.length} checked.` : 'Not checked yet.'}</span></div></div>
    <div>${h.leaked.map(a => row(a, `Seen ${a.leak.n.toLocaleString()} time${a.leak.n === 1 ? '' : 's'} in breaches. Change it everywhere you use it.`, `<span class="pill bad">Leaked</span>`)).join('') || (last ? `<p class="hint" style="padding:0 16px 16px;margin:0">${ic('check','s')} None of the checked passwords appear in known breaches.</p>` : '')}</div></div>`;
  return top;
}
async function runLeakCheck(){
  const list = V().accounts.filter(a => !a.trashedAt && a.password);
  if(!list.length){ toast('No saved passwords to check yet', 'warn'); return; }
  const cache = new Map(); let done = 0, found = 0;
  S.leakBusy = '0 of ' + list.length; renderPage();
  try{
    for(const a of list){
      const n = await pwnedCount(a.password, cache);
      a.leak = {n, at:now(), pwAt:a.pwChangedAt || a.createdAt};
      if(n) found++;
      done++; S.leakBusy = done + ' of ' + list.length;
      const b = $('[data-act="leak-check"]'); if(b) b.lastChild.textContent = 'Checking ' + S.leakBusy;
    }
    persist();
    toast(found ? `${found} password${found === 1 ? '' : 's'} found in known breaches` : 'No leaked passwords found', found ? 'warn' : 'check');
  }catch(e){ toast(e.message && /breach service/.test(e.message) ? e.message : 'Couldn\'t reach the breach service. Check your connection and try again.', 'warn'); persist(); }
  S.leakBusy = null; renderPage();
}

/* ---------- attached files ---------- */
const fileIcon = t => /^image\//.test(t) ? 'layers' : /pdf/.test(t) ? 'notes' : 'import';
function filesSectionHTML(a){
  if(a.trashedAt && !(a.files || []).length) return '';
  const rows = (a.files || []).map(f => `<div class="frow" role="button" tabindex="0" data-act="file-open" data-id="${a.id}" data-f="${f.id}" aria-label="Open ${esc(f.name)}">
      <div class="fl">${ic(fileIcon(f.type), 's')}${esc(fmtSize(f.size))}, added ${fmtDate(f.addedAt)}</div><div class="fv">${esc(f.name)}</div>
      <div class="fa"><button class="icon-btn" data-act="file-dl" data-id="${a.id}" data-f="${f.id}" aria-label="Download ${esc(f.name)}" title="Download">${ic('download')}</button>${a.trashedAt ? '' : `<button class="icon-btn" data-act="file-rm" data-id="${a.id}" data-f="${f.id}" aria-label="Remove ${esc(f.name)}" title="Remove">${ic('trash')}</button>`}</div></div>`).join('');
  return `<div class="sec-wrap"><div class="sec-h"><h3>Files</h3>${a.trashedAt ? '' : `<label class="btn small" for="file-add-${a.id}">${ic('plus','s')}Add files<input id="file-add-${a.id}" class="sr" type="file" multiple data-acc="${a.id}"></label>`}</div>
    ${rows ? `<div class="sec">${rows}</div>` : `<p class="hint" style="margin:0">Keep ID scans, recovery sheets or contracts with this account. Each file is encrypted, up to 5 MB.</p>`}</div>`;
}
function classicFilesHTML(a){
  return (a.files || []).map(f => `<div class="nline"><span class="k">File:</span><span class="v">${esc(f.name)} <span class="muted">(${esc(fmtSize(f.size))})</span></span><span class="acts"><button class="icon-btn" data-act="file-open" data-id="${a.id}" data-f="${f.id}" aria-label="Open ${esc(f.name)}">${ic('ext','s')}</button></span></div>`).join('');
}
async function addFiles(a, list){
  const files = [...(list || [])]; if(!files.length) return;
  let added = 0;
  for(const file of files){
    if(file.size > FILE_MAX){ toast(`${file.name} is ${fmtSize(file.size)}. Files can be up to 5 MB.`, 'warn'); continue; }
    const id = uid();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const box = await Files.encrypt(S.dek, id, bytes);
    await Files.putRaw(id, box);
    a.files = a.files || [];
    a.files.push({id, name:file.name || 'file', type:file.type || 'application/octet-stream', size:file.size, addedAt:now(), blen:JSON.stringify(box).length});
    a.history.unshift({id:uid(), at:now(), kind:'edit', text:'Added file ' + (file.name || 'file')});
    added++;
  }
  if(!added) return;
  a.updatedAt = now(); persist(); refreshDetailKeepScroll();
  toast(added === 1 ? 'File added and encrypted' : added + ' files added and encrypted', 'check');
}
async function fileBlob(a, fid){
  const f = (a.files || []).find(x => x.id === fid); if(!f) return null;
  let box = await Files.getRaw(fid);
  if(!box && syncOn() && Cloud.files){ try{ const txt = await Cloud.getFile(fid); if(txt){ box = JSON.parse(txt); await Files.putRaw(fid, box); } }catch(e){} }
  if(!box) return {f, missing:true};
  try{ return {f, blob:new Blob([await Files.decrypt(S.dek, fid, box)], {type:f.type})}; }catch(e){ return {f, missing:true}; }
}
let fileUrl = null;
function revokeFileUrl(){ if(fileUrl){ URL.revokeObjectURL(fileUrl); fileUrl = null; } }
async function openFile(a, fid){
  const r = await fileBlob(a, fid); if(!r) return;
  if(r.missing){ toast(syncOn() ? 'This file hasn\'t finished syncing to this device yet. Try again in a moment.' : 'This file isn\'t on this device. Restore a backup that includes it.', 'warn'); return; }
  revokeFileUrl(); fileUrl = URL.createObjectURL(r.blob);
  const img = /^image\//.test(r.f.type);
  openModal({title:r.f.name, wide:img, onClose:revokeFileUrl, body:`${img ? `<img class="file-img" src="${fileUrl}" alt="${esc(r.f.name)}">` : `<div class="empty" style="padding:20px">${ic(fileIcon(r.f.type), 'l')}<p>${esc(r.f.type || 'File')}, ${esc(fmtSize(r.f.size))}</p></div>`}
    <p class="hint" style="margin:0">Added ${fmtDT(r.f.addedAt)}. Stored encrypted; it's only readable while your vault is unlocked.</p>`,
    foot:`${WEB && !img ? `<a class="btn" href="${fileUrl}" target="_blank" rel="noopener">${ic('ext','s')}Open in a new tab</a>` : ''}<button class="btn primary" data-act="file-dl" data-id="${a.id}" data-f="${fid}">${ic('download','s')}Download</button>`});
}
async function downloadFile(a, fid){
  const r = await fileBlob(a, fid); if(!r) return;
  if(r.missing){ toast('This file isn\'t on this device yet.', 'warn'); return; }
  const res = await saveFile(r.f.name, r.blob);
  if(res === 'saved') toast('Downloaded ' + r.f.name, 'download');
}
function removeFile(a, fid){
  const f = (a.files || []).find(x => x.id === fid); if(!f) return;
  confirmBox({title:`Remove ${f.name}?`, text:'It will be deleted from this account on every device. This can\'t be undone, unless a backup has it.', ok:'Remove file', danger:true, onOk:async () => {
    a.files = a.files.filter(x => x.id !== fid);
    V().tombstones.push({id:fid, at:now()});
    a.history.unshift({id:uid(), at:now(), kind:'edit', text:'Removed file ' + f.name});
    a.updatedAt = now();
    await Files.del(fid); persist(); refreshDetailKeepScroll(); toast('File removed', 'trash');
  }});
}
function dropAccountFiles(a){ for(const f of a.files || []){ V().tombstones.push({id:f.id, at:now()}); Files.del(f.id); } }
async function storeRestoredFiles(map){
  for(const [id, bytes] of Object.entries(map || {})){ if(!(await Files.has(id))) await Files.putRaw(id, await Files.encrypt(S.dek, id, bytes)); }
}

/* ---------- emergency kit ---------- */
function emergencyPanelHTML(){
  const kits = (V().meta.kits || []).slice(0, 3);
  return `<div class="panel"><div class="panel-h"><h2>Emergency access</h2><p>Make a kit a trusted person can open if something happens to you. It's a separate encrypted file with its own code, so they never need your password.</p></div><div>
    <div class="set-row"><span class="ol">Emergency kit<small>${kits.length ? 'Last made ' + fmtDate(kits[0].at) + ' with ' + kits[0].count + ' account' + (kits[0].count === 1 ? '' : 's') + '. Make a new one when accounts change.' : 'Choose everything or only some labels, like Family or Finance.'}</small></span><button class="btn small" data-act="kit-new">${ic('shield','s')}Make a kit</button></div>
  </div></div>`;
}
function openKitBuilder(){
  const tree = labelTree();
  openModal({title:'Make an emergency kit', body:`<p class="muted">The kit is a file. The code that opens it is shown once. Give them to your trusted person separately, for example the file now and the code in a sealed envelope or with your will.</p>
    <div class="field"><span class="lbl">Include</span><div class="seg" role="group"><button data-act="kit-scope" data-v="all" aria-pressed="true">Everything</button><button data-act="kit-scope" data-v="labels" aria-pressed="false" ${tree.length ? '' : 'disabled'}>Only some labels</button></div></div>
    <div id="kit-labels" class="labelpick" hidden>${tree.map(({l}) => `<button class="chip" data-act="kit-label" data-id="${l.id}" aria-pressed="false"><span class="dot" style="background:${l.color}"></span>${esc(labelPath(l.id))}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" id="kit-files" checked><span>Include attached files</span></label>
    <div class="field"><label for="kit-note">A note for them</label><textarea id="kit-note" class="input" rows="3" placeholder="Optional. For example: start with the bank and email accounts."></textarea></div>${ERR}`,
    foot:`<button class="btn" data-act="mclose">Cancel</button><button class="btn primary" data-act="kit-make">Make kit</button>`});
  S.m.scope = 'all'; S.m.labels = new Set();
}
async function openKitKey(header, code){
  const kek = await kdf(normRK(code), b64d(header.ekdf.salt), header.ekdf.iter);
  return unseal(kek, header.ewrap, 'vl-ewrap');
}
async function makeKit(){
  const m = S.m;
  let accts = V().accounts.filter(a => !a.trashedAt);
  if(m.scope === 'labels'){
    if(!m.labels.size) return mErr('Pick at least one label, or choose Everything.');
    const ids = new Set(); for(const id of m.labels) for(const x of labelDesc(id)) ids.add(x);
    accts = accts.filter(a => a.labels.some(l => ids.has(l)));
  }
  if(!accts.length) return mErr('No accounts have those labels yet.');
  const withFiles = $('#kit-files').checked, note = $('#kit-note').value.trim();
  setModal(undefined, '<div class="spinner"></div>');
  const code = newRecoveryKey(), dek2 = rand(32), key2 = await dekKey(dek2), salt = rand(16);
  const kek = await kdf(normRK(code), salt, RK_ITER);
  const usedLabels = new Set(); for(const a of accts) for(const l of a.labels){ let x = labelById(l); while(x){ usedLabels.add(x.id); x = x.parentId ? labelById(x.parentId) : null; } }
  const kitVault = {...newVault({name:V().profile.name, email:V().profile.email}), labels:V().labels.filter(l => usedLabels.has(l.id)),
    accounts:accts.map(a => ({...clone(a), copies:[], secrets:[], files:withFiles ? clone(a.files || []) : [], notes:a.notes})), nextNo:V().nextNo};
  const body = await sealVault(key2, kitVault);
  const files = {};
  if(withFiles) for(const a of accts) for(const f of a.files || []){ const r = await fileBlob(a, f.id); if(r && r.blob) files[f.id] = await Files.encrypt(key2, f.id, new Uint8Array(await r.blob.arrayBuffer())); }
  const header = {app:APP, v:VER, kind:'emergency', ekdf:{alg:'PBKDF2-SHA256', iter:RK_ITER, salt:b64e(salt)}, ewrap:await seal(kek, dek2, 'vl-ewrap'), hdrAt:now()};
  const owner = V().profile.name || '';
  const data = JSON.stringify({app:APP, kind:'emergency', v:VER, exportedAt:now(), owner, note, count:accts.length, header, body, files});
  dek2.fill(0);
  V().meta.kits = [{id:uid(), at:now(), count:accts.length, scope:m.scope === 'all' ? 'all' : [...m.labels].map(labelPath).join(', ')}, ...(V().meta.kits || [])].slice(0, 20);
  persist();
  const fname = `vaultleaf-emergency-kit-${new Date().toISOString().slice(0, 10)}.json`;
  S.m.kit = {data, code, fname};
  setModal(`<p><b>Emergency code</b>. Write it down now: it isn't stored anywhere and can't be shown again.</p>${syncCodeHTML(code)}
    <div class="banner" style="margin:0">${ic('shield','s')}<b>${accts.length} account${accts.length === 1 ? '' : 's'}${Object.keys(files).length ? ', ' + Object.keys(files).length + ' file' + (Object.keys(files).length === 1 ? '' : 's') : ''}, ${fmtSize(data.length)}</b></div>
    <ol class="howto-m"><li>Download the kit file and give it to your trusted person, or store it where they can find it.</li><li>Give them the code separately.</li><li>To open it, they go to Vaultleaf, choose <b>Restore a backup or emergency kit</b>, pick the file and choose <b>Emergency code</b>.</li></ol>`,
    `<button class="btn" data-act="kit-copycode">${ic('copy','s')}Copy code</button><button class="btn" data-act="kit-copy">Copy kit text</button>${canDownload() ? `<button class="btn primary" data-act="kit-dl">${ic('download','s')}Download kit</button>` : ''}`);
}

/* ---------- actions ---------- */
Object.assign(ACT, {
  's-link'(){ openLinkCode(true); },
  'l-bio'(){ bioUnlock(); },
  'lk-go'(){ linkGo(); },
  'sync-on'(){ turnOnSync(); },
  'sync-show'(){ openSyncCode(false); },
  'sync-copy'(){ copyText(S.m.code).then(ok => toast(ok ? 'Sync code copied' : 'Copy was blocked. Write the code down instead.', ok ? 'copy' : 'warn')); },
  'sync-link'(){ openLinkCode(false); },
  'sync-off'(){ confirmBox({title:'Turn off sync?', text:'The synced copy is deleted. Every device keeps the accounts it has, but changes stop moving between them.', ok:'Turn off sync', danger:true, onOk:turnOffSync}); },
  'sync-rotate'(){ confirmBox({title:'Make a new sync code?', text:'The old code stops working. Your other devices stop syncing until you enter the new code on each of them, in Settings.', ok:'Make new code', onOk:rotateSync}); },
  'leak-check'(){ runLeakCheck(); },
  'file-open'(el){ const a = acct(el.dataset.id); if(a) openFile(a, el.dataset.f); },
  'file-dl'(el){ const a = acct(el.dataset.id); if(a) downloadFile(a, el.dataset.f); },
  'file-rm'(el){ const a = acct(el.dataset.id); if(a) removeFile(a, el.dataset.f); },
  'kit-new'(){ openKitBuilder(); },
  'kit-scope'(el){ S.m.scope = el.dataset.v; modalsEl.querySelectorAll('[data-act="kit-scope"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.m.scope)); $('#kit-labels').hidden = S.m.scope !== 'labels'; },
  'kit-label'(el){ const id = el.dataset.id; S.m.labels.has(id) ? S.m.labels.delete(id) : S.m.labels.add(id); el.setAttribute('aria-pressed', S.m.labels.has(id)); },
  'kit-make'(){ makeKit(); },
  'kit-copycode'(){ copyText(S.m.kit.code).then(ok => toast(ok ? 'Emergency code copied' : 'Copy was blocked. Write the code down.', ok ? 'copy' : 'warn')); },
  'kit-copy'(){ copyText(S.m.kit.data).then(ok => toast(ok ? 'Kit copied. Paste it into a file or note.' : 'Copy was blocked here.', ok ? 'copy' : 'warn')); },
  'kit-dl'(){ saveFile(S.m.kit.fname, S.m.kit.data).then(r => { if(r === 'saved') toast('Emergency kit saved', 'download'); }); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.dataset && t.dataset.acc && t.type === 'file'){ const a = acct(t.dataset.acc); if(a) addFiles(a, t.files).finally(() => { t.value = ''; }); }
  if(t.id === 's-bio') toggleBio(t);
});
