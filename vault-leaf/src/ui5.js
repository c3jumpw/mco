/* ---------- keypad ---------- */
function updatePins(len, n){ const p = root.querySelector('.pins'); if(p) p.outerHTML = pinsHTML(len, n); }
function kpInput(d){
  if(S.phase === 'login' && S.auth.step === 2){
    if(S.auth.busy || guard.wait()) return;
    const len = pcLenFromHeaders(), a = S.auth;
    if(d === 'del') a.pc = a.pc.slice(0, -1); else if(d === 'clear') a.pc = ''; else if(a.pc.length < len) a.pc += d;
    updatePins(len, a.pc.length);
    if(a.pc.length === len) unlock(a.pw, a.pc);
    return;
  }
  if(S.phase === 'setup' && S.setup && S.setup.step === 3){
    const st = S.setup; if(st.busy) return;
    const k = st.pcStage === 'confirm' ? 'pc2' : 'pc';
    if(d === 'del') st[k] = st[k].slice(0, -1); else if(d === 'clear') st[k] = ''; else if(st[k].length < st.pcLen) st[k] += d;
    if(st.err){ st.err = ''; const e = root.querySelector('.err'); if(e) e.remove(); }
    if(st[k].length < st.pcLen){ updatePins(st.pcLen, st[k].length); return; }
    if(st.pcStage === 'enter'){ st.pcStage = 'confirm'; st.pc2 = ''; render(); return; }
    if(st.pc2 !== st.pc){ Object.assign(st, {err:'Those didn\'t match. Set your passcode again.', pc:'', pc2:'', pcStage:'enter', shake:true}); render(); return; }
    setupAfterPasscode();
  }
}
async function setupAfterPasscode(){
  const st = S.setup; st.busy = true; render();
  if(st.mode === 'reset'){ await finishReset(); return; }
  st.dekRaw = rand(32); st.rk = newRecoveryKey();
  st.header = await makeHeader(st.pw, st.pc, st.dekRaw, st.rk);
  st.busy = false; st.step = 4; render();
}
async function recoverGo(){
  const key = $('#r-key').value;
  if(normRK(key).length < 20){ S.rec = {key, err:'Enter the full recovery key: 8 groups of 4 letters and numbers.'}; render(); return; }
  S.rec = {key, busy:true}; render();
  await Promise.race([S.cloudP, sleep(3000)]);
  let raw = null, used = null;
  for(const h of [LS.get(K.header), S.cloudHeader].filter(Boolean).sort((a, b) => (b.hdrAt || 0) - (a.hdrAt || 0))){ try{ raw = await unwrapRecovery(h, key); used = h; break; }catch(e){} }
  if(!raw){ guard.fail(); S.rec = {key, err:'That key doesn\'t open this vault. Check for typos. Dashes and spaces are optional.'}; render(); return; }
  guard.reset();
  S.rec = null; S.setup = Object.assign(newSetup('reset'), {dekRaw:raw, baseHeader:used, pcLen:used.pcLen || 6}); S.phase = 'setup'; render();
}

/* ---------- actions ---------- */
const ACT = {
  noop(){},
  mclose(){ closeModal(); },
  'm-ok'(){ const fn = S.m && S.m.onOk; closeModal(); if(fn) fn(); },
  // setup
  's-next'(){
    const st = S.setup;
    if(st.step === 1){ st.step = 2; st.err = ''; render(); return; }
    if(st.step === 2){
      if(st.pw.length < 10) st.err = 'Use at least 10 characters.';
      else if(strength(st.pw).score < 2) st.err = 'That would be easy to guess. Add more words or characters, or tap Suggest a passphrase.';
      else if(st.pw !== st.pw2) st.err = 'The two passwords don\'t match.';
      else { st.err = ''; st.step = 3; st.pc = ''; st.pc2 = ''; st.pcStage = 'enter'; }
      render();
    }
  },
  's-back'(){
    const st = S.setup;
    if(st.mode === 'reset' && st.step === 2){ S.setup = null; S.phase = 'login'; S.auth = {step:1, pw:'', pc:'', err:'', info:'', busy:false}; render(); return; }
    st.step = Math.max(1, st.step - 1); st.err = ''; st.pc = ''; st.pc2 = ''; st.pcStage = 'enter'; render();
  },
  's-peek'(){ S.setup.peek = !S.setup.peek; render(); },
  's-suggest'(){ const p = genPassphrase({words:4, sep:'-', cap:true, num:true}).value; Object.assign(S.setup, {pw:p, pw2:p, peek:true, err:''}); render(); toast('Write it down until you know it by heart', 'key'); },
  's-pclen'(el){ S.setup.pcLen = +el.dataset.l; S.setup.pc = ''; render(); },
  's-rkcopy'(){ copyText(S.setup.rk).then(ok => toast(ok ? 'Recovery key copied' : 'Copy was blocked. Write the key down instead.', ok ? 'copy' : 'warn')); },
  's-rkdl'(){ saveFile('vaultleaf-recovery-kit.txt', recoveryKitText(S.setup.rk, S.setup.name, S.setup.email)).then(r => { if(r === 'saved') toast('Recovery kit saved', 'download'); }); },
  's-finish'(){ if(S.setup.saved) finishSetup(); },
  's-restore'(){ openRestore(true); },
  // login
  kp(el){ kpInput(el.dataset.d); }, kpdel(){ kpInput('del'); }, kpclear(){ kpInput('clear'); },
  'l-peek'(){ S.auth.pw = $('#l-pw').value; S.auth.peek = !S.auth.peek; render(); },
  'l-back'(){ S.auth = {step:1, pw:'', pc:'', err:'', info:'', busy:false}; render(); },
  'go-recover'(){ S.rec = {}; S.phase = 'recover'; render(); },
  'r-back'(){ S.rec = null; S.phase = 'login'; render(); },
  'r-go'(){ recoverGo(); },
  // navigation
  tab(el){ if(S.mode !== 'view' && el.dataset.v !== 'vault') return guardEditor(() => { S.tab = el.dataset.v; renderApp(); }); S.tab = el.dataset.v; renderApp(); const p = $('#page'); if(p) p.scrollTop = 0; },
  filter(el){ S.filter = el.dataset.v; S.tab = 'vault'; if(S.selId && !visible().some(a => a.id === S.selId) && S.mode === 'view') S.selId = null; renderApp(); const l = $('#list'); if(l) l.scrollTop = 0; },
  view(el){ V().settings.view = el.dataset.v; V().settings.updatedAt = now(); persist(); renderApp(); const d = $('#detail'); if(d) d.scrollTop = 0; },
  theme(el){ V().settings.theme = el.dataset.v; V().settings.updatedAt = now(); applyTheme(el.dataset.v); persist(); renderPage(); },
  lock(){ lock(''); },
  clearq(){ S.q = ''; renderHead(); renderList(); $('#q').focus(); },
  new(){ guardEditor(() => view() === 'classic' ? startNew('note') : openTemplates()); },
  open(el){ const id = el.dataset.id; guardEditor(() => { S.selId = id; S.mode = 'view'; S.dtab = 'changes'; renderApp(); const d = $('#detail'); if(d) d.scrollTop = 0; }); },
  goto(el){ const a = acct(el.dataset.id); if(!a) return; S.tab = 'vault'; S.q = ''; S.filter = a.trashedAt ? 'trash' : 'all'; S.selId = a.id; S.mode = 'view'; S.dtab = 'changes'; renderApp(); },
  'close-detail'(){ S.selId = null; S.mode = 'view'; renderApp(); },
  fav(el){ const a = acct(el.dataset.id); a.fav = !a.fav; a.updatedAt = now(); persist(); renderApp(); toast(a.fav ? 'Pinned to the top' : 'Unpinned', 'star'); },
  edit(el){ closeModal(); startEdit(acct(el.dataset.id), el.dataset.kind); },
  more(el){ openMore(acct(el.dataset.id)); },
  dup(el){ const a = acct(el.dataset.id); closeModal(); const c = clone(a); Object.assign(c, {id:uid(), tool:a.tool + ' copy', history:[], secrets:[], copies:[], lastCopiedAt:0, no:0, pwChangedAt:0, trashedAt:0, example:false}); c.fields = c.fields.map(f => ({...f, id:uid()})); startNew(null, c); },
  trash(el){ const a = acct(el.dataset.id); closeModal(); trashAccount(a); S.mode = 'view'; S.draft = null; S.selId = null; renderApp(); toast(`Moved ${a.tool} to Recently deleted`, 'trash'); },
  restore(el){ const a = acct(el.dataset.id); restoreAccount(a); S.filter = 'all'; renderApp(); toast('Restored ' + a.tool, 'restore'); },
  purge(el){ const a = acct(el.dataset.id); confirmBox({title:`Delete ${a.tool} forever?`, text:'It will be gone from every device. This can\'t be undone.', ok:'Delete forever', danger:true, onOk:() => { purgeAccount(a); S.selId = null; renderApp(); toast('Deleted for good', 'trash'); }}); },
  copy(el){ const a = acct(el.dataset.id); if(a) doCopy(a, el.dataset.k, el); },
  reveal(el){ const a = acct(el.dataset.id); if(a) reveal(a, el.dataset.k); },
  dtab(el){ S.dtab = el.dataset.v; refreshDetailKeepScroll(); },
  'rm-examples'(){ confirmBox({title:'Remove example accounts?', text:'The example accounts and their example labels are deleted. Your own accounts are untouched.', ok:'Remove examples', danger:true, onOk:() => {
    const t = now();
    for(const a of V().accounts.filter(x => x.example)) V().tombstones.push({id:a.id, at:t});
    V().accounts = V().accounts.filter(x => !x.example);
    const used = new Set(V().accounts.flatMap(a => a.labels));
    const keep = l => !l.example || used.has(l.id) || V().labels.some(c => c.parentId === l.id && (used.has(c.id) || !c.example));
    for(let i = 0; i < 3; i++){ const gone = V().labels.filter(l => !keep(l)); for(const l of gone) V().tombstones.push({id:l.id, at:t}); V().labels = V().labels.filter(keep); }
    if(S.filter.startsWith('l:') && !labelById(S.filter.slice(2))) S.filter = 'all';
    if(S.selId && !acct(S.selId)) S.selId = null;
    hayCache = new WeakMap(); persist(); renderApp(); toast('Examples removed', 'trash');
  }}); },
  'label-new'(){ openLabel(null); },
  'label-edit'(el){ openLabel(el.dataset.id); },
  'lb-color'(el){ S.m.color = el.dataset.v; modalsEl.querySelectorAll('.swatches button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.m.color)); },
  'lb-save'(){ saveLabel(); },
  'lb-del'(){ deleteLabel(); },
  tpl(el){ startNew(el.dataset.v); },
  // editor
  'ed-cancel'(){ cancelEditor(); },
  'ed-save'(){ saveEditor(); },
  'ed-kind'(el){
    if(el.dataset.v === 'note'){ const dirty = stable(S.draft) !== S.orig; S.noteText = accountToText(S.draft, labelPath); S.noteOrig = dirty ? '\u0000' : S.noteText; S.editKind = 'note'; }
    else { S.draft = resolveLabels(textToAccount($('#ce').value, S.draft)); S.editKind = 'form'; }
    rerenderEditor();
  },
  'ed-peek'(el){ const p = el.dataset.p; S.edPeek.has(p) ? S.edPeek.delete(p) : S.edPeek.add(p); rerenderEditor(); },
  'ed-gen'(el){ const g = genOpts(); const v = (g.mode === 'phrase' ? genPassphrase(g) : genPassword(g)).value; setPath(S.draft, el.dataset.p, v); S.edPeek.add(el.dataset.p); rerenderEditor(); toast('New password filled in. Save to keep it.', 'dice'); },
  'ed-add'(el){ const t = el.dataset.t; S.draft.fields.push({id:uid(), type:t, label:FT[t].name, value:''}); rerenderEditor(); const i = S.draft.fields.length - 1; const f = $(`#ed-fields-${i}-value`); if(f) f.focus(); },
  'ed-addrow'(el){ const l = el.dataset.list; S.draft[l].push(l === 'qa' ? {id:uid(), q:'', a:''} : {id:uid(), name:'', email:'', role:''}); rerenderEditor(); const i = S.draft[l].length - 1; const f = $(`[data-bind="${l}.${i}.${l === 'qa' ? 'q' : 'name'}"]`); if(f) f.focus(); },
  'ed-rm'(el){ S.draft[el.dataset.list].splice(+el.dataset.i, 1); rerenderEditor(); },
  'ed-label'(el){ const id = el.dataset.id, L = S.draft.labels; const i = L.indexOf(id); if(i >= 0) L.splice(i, 1); else L.push(id); el.setAttribute('aria-pressed', i < 0); },
  'ed-newlabel'(){ const inp = $('#ed-newlabel'), name = inp.value.trim(); if(!name) return; const id = ensureLabelPath(name); if(!S.draft.labels.includes(id)) S.draft.labels.push(id); persist(); rerenderEditor(); renderSide(); renderHead(); },
  'ed-insertpw'(){
    const ta = $('#ce'); if(!ta) return;
    const g = genOpts(), v = (g.mode === 'phrase' ? genPassphrase(g) : genPassword(g)).value;
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
    const before = ta.value.slice(0, s), lineStart = before.slice(before.lastIndexOf('\n') + 1);
    const ins = /:\s?$/.test(lineStart) || (lineStart && !/^\s*$/.test(lineStart) && s !== ta.value.length) ? v : (before && !before.endsWith('\n') ? '\n' : '') + 'Password: ' + v;
    ta.value = before + ins + ta.value.slice(e); S.noteText = ta.value;
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length; afterEditorRender();
    toast('Strong password added to the note', 'dice');
  },
  // generator
  'gen-new'(){ regen(); updateGenOut(); },
  'gen-copy'(){ const v = S.genOut.value; copyText(v).then(ok => { toast(ok ? 'Password copied' : 'Copy was blocked. Select it and copy by hand.', ok ? 'copy' : 'warn'); if(ok) scheduleClipClear(); }); },
  'gen-use'(){ openPickAccount(); },
  'gen-mode'(el){ genOpts().mode = el.dataset.v; V().settings.updatedAt = now(); regen(); persist(); renderPage(); },
  'pa-pick'(el){ const a = acct(el.dataset.id), v = S.genOut.value; closeModal(); S.tab = 'vault'; startEdit(a, 'form'); S.draft.password = v; S.edPeek.add('password'); rerenderEditor(); toast('New password filled in. Save to keep it.', 'key'); },
  'pa-new'(){ const v = S.genOut.value; closeModal(); startNew('login', {password:v}); S.edPeek.add('password'); rerenderEditor(); },
  'act-filter'(el){ S.actFilter = el.dataset.v; renderPage(); },
  // settings & modals
  'm-chpw'(){ openChangePw(); }, 'cp-go'(){ changePw(); },
  'm-chpc'(){ openChangePc(); }, 'cc-go'(){ changePc(); },
  'm-newrk'(){ openNewRk(); }, 'rk-go'(){ newRk(); },
  'rk-copy'(){ copyText(S.m.rk).then(ok => toast(ok ? 'Recovery key copied' : 'Copy was blocked. Write the key down instead.', ok ? 'copy' : 'warn')); },
  'rk-dl'(){ saveFile('vaultleaf-recovery-kit.txt', recoveryKitText(S.m.rk, V().profile.name, V().profile.email)).then(r => { if(r === 'saved') toast('Recovery kit saved', 'download'); }); },
  'm-backup'(){ openBackup(); },
  'bk-copy'(){ copyText(S.m.backup).then(ok => { if(ok){ toast('Backup copied. Paste it somewhere safe.', 'copy'); markBackup(); } else toast('Copy was blocked here.', 'warn'); }); },
  'bk-dl'(){ saveFile(S.m.fname, S.m.backup).then(r => { if(r === 'saved'){ toast('Backup saved', 'download'); markBackup(); closeModal(); } }); },
  'm-restore'(){ openRestore(false); },
  'rs-mode'(el){ S.m.rsMode = el.dataset.v; modalsEl.querySelectorAll('[data-act="rs-mode"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.m.rsMode)); $('#rs-creds').hidden = S.m.rsMode !== 'creds'; $('#rs-rk').hidden = S.m.rsMode !== 'rk'; },
  'rs-go'(){ restoreGo(); },
  'rs-merge'(){ const before = V().accounts.length; S.vault = upgradeVault(restoreMerge(V(), S.m.restored)); hayCache = new WeakMap(); persist(); closeModal(); renderApp(); const n = Math.max(0, V().accounts.length - before); toast(n ? `Added ${n} account${n === 1 ? '' : 's'} from the backup` : 'Everything in the backup is already here', 'restore'); },
  'rs-replace'(){ const r = S.m.restored; confirmBox({title:'Replace your vault?', text:'Accounts that aren\'t in the backup will be deleted on every device.', ok:'Replace', danger:true, onOk:() => {
    const keep = new Set(r.accounts.map(a => a.id)), t = now();
    const tomb = V().accounts.filter(a => !keep.has(a.id)).map(a => ({id:a.id, at:t}));
    S.vault = upgradeVault({...r, settings:V().settings, profile:V().profile, tombstones:[...(r.tombstones || []), ...tomb], nextNo:Math.max(r.nextNo || 1, V().nextNo)});
    for(const a of S.vault.accounts) a.updatedAt = Math.max(a.updatedAt, t);
    S.selId = null; hayCache = new WeakMap(); persist(); renderApp(); toast('Vault replaced with the backup', 'restore');
  }}); },
  'import-notes'(){ openImportNotes(); },
  'in-sep'(el){ S.m.sep = el.dataset.v; modalsEl.querySelectorAll('[data-act="in-sep"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.m.sep)); previewNotes(); },
  'in-go'(){ const n = importItems(S.m.items, $('#in-label').value.trim()); closeModal(); S.tab = 'vault'; S.filter = 'all'; S.q = ''; S.mode = 'view'; renderApp(); toast(`Imported ${n} account${n === 1 ? '' : 's'}`, 'import'); },
  'import-csv'(){ openImportCsv(); },
  'ic-go'(){ const n = importItems(S.m.items, $('#ic-label').value.trim()); closeModal(); S.tab = 'vault'; S.filter = 'all'; S.q = ''; renderApp(); toast(`Imported ${n} account${n === 1 ? '' : 's'}. Now delete the CSV file.`, 'import'); },
  'm-export'(){ openExport(); },
  'ex-copy'(){ copyText(S.m.csv).then(ok => toast(ok ? 'CSV copied' : 'Copy was blocked here.', ok ? 'copy' : 'warn')); },
  'ex-dl'(){ saveFile('vaultleaf-export.csv', S.m.csv).then(r => { if(r === 'saved'){ toast('CSV saved. Delete it after importing.', 'download'); closeModal(); } }); },
  'm-delete'(){ openDelete(); }, 'dv-go'(){ deleteVault(); },
  'sync-now'(){ syncNow().then(() => toast(Cloud.status === 'err' ? Cloud.err : 'Synced', Cloud.status === 'err' ? 'warn' : 'cloud')); }
};
function guardEditor(fn){
  if(S.mode === 'view' || !S.draft) return fn();
  const cur = S.editKind === 'note' ? ($('#ce') ? $('#ce').value : S.noteText) : null;
  const dirty = S.editKind === 'note' ? cur !== S.noteOrig : stable(S.draft) !== S.orig;
  const go = () => { S.mode = 'view'; S.draft = null; fn(); };
  if(!dirty) return go();
  confirmBox({title:'Discard changes?', text:'You have unsaved edits to this account.', ok:'Discard', danger:true, onOk:go});
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  if(e.target.dataset && e.target.dataset.scrim){ closeModal(); return; }
  const el = e.target.closest('[data-act]'); if(!el) return;
  const fn = ACT[el.dataset.act]; if(!fn) return;
  if(el.dataset.act !== 'noop') e.preventDefault();
  if(el.disabled) return;
  fn(el, e);
});
let prevTimer = null, genSaveTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if(t.id === 'q'){ S.q = t.value; $('[data-act="clearq"]').hidden = !S.q; renderList(); return; }
  if(t.id === 'l-pw'){ S.auth.pw = t.value; return; }
  if(t.dataset.sf && t.type !== 'checkbox'){ S.setup[t.dataset.sf] = t.value; if(t.dataset.sf === 'pw') updateMeter('s-meter', t.value); return; }
  if(t.dataset.bind && t.tagName !== 'SELECT' && S.draft){
    let v = t.value;
    if(t.dataset.date){ if(!v) return; v = new Date(v + 'T12:00:00').getTime(); }
    setPath(S.draft, t.dataset.bind, v);
    if(t.dataset.bind === 'password') updateMeter('ed-meter', v);
    return;
  }
  if(t.dataset.gen && (t.type === 'range')){ const g = genOpts(); g[t.dataset.gen] = +t.value; const lv = $(`#g-${t.dataset.gen}-v`); if(lv) lv.textContent = t.value; regen(); updateGenOut(); clearTimeout(genSaveTimer); genSaveTimer = setTimeout(persist, 600); return; }
  if(t.dataset.meter){ updateMeter(t.dataset.meter, t.value); return; }
  if(t.id === 'in-text'){ clearTimeout(prevTimer); prevTimer = setTimeout(previewNotes, 150); return; }
  if(t.id === 'pa-q'){ const q = t.value.toLowerCase(); $('#pa-list').innerHTML = pickRows(V().accounts.filter(a => !a.trashedAt && hay(a).includes(q)).sort((a, b) => a.tool.localeCompare(b.tool))); return; }
  if(t.id === 'ce'){ S.noteText = t.value; afterEditorRender(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.dataset.sf && t.type === 'checkbox'){ S.setup[t.dataset.sf] = t.checked; if(t.dataset.sf === 'saved'){ const b = $('[data-act="s-finish"]'); if(b) b.disabled = !t.checked; } return; }
  if(t.dataset.bind && t.tagName === 'SELECT' && S.draft){ setPath(S.draft, t.dataset.bind, t.dataset.num ? +t.value : t.value); if(t.dataset.rerender) rerenderEditor(); return; }
  if(t.dataset.gen && t.type !== 'range'){ const g = genOpts(); g[t.dataset.gen] = t.type === 'checkbox' ? t.checked : t.value; regen(); updateGenOut(); persist(); return; }
  if(t.dataset.set){
    const path = t.dataset.set, val = t.type === 'checkbox' ? t.checked : t.dataset.num ? +t.value : t.value;
    if(path === 'settings.sync' && !val){
      t.checked = true;
      confirmBox({title:'Turn off sync?', text:'The encrypted copy is removed from sync. This device keeps everything. Your other devices keep what they have but stop updating.', ok:'Turn off sync', danger:true, onOk:async () => { V().settings.sync = false; V().settings.updatedAt = now(); clearTimeout(pushTimer); await persist(); await Cloud.wipe(); setSync('ok'); renderPage(); renderSide(); toast('Sync is off', 'cloud'); }});
      return;
    }
    setPath(V(), path, val); V().settings.updatedAt = now(); persist();
    if(path === 'settings.sort'){ renderList(); return; }
    if(path === 'settings.sync' && val){ pushNow(); watchCloud(); renderPage(); renderSide(); toast('Sync is on', 'cloud'); return; }
    toast('Saved', 'check');
    return;
  }
  if(t.dataset.prof){ V().profile[t.dataset.prof] = t.value.trim(); V().profile.updatedAt = now(); persist(); toast('Saved', 'check'); return; }
  if(t.id === 'ic-file'){ previewCsv(); return; }
});
document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault();
  if(f.dataset.form === 'login-pw'){
    const pw = $('#l-pw').value;
    if(!pw){ S.auth.err = 'Enter your master password.'; render(); return; }
    if(guard.wait()){ render(); return; }
    S.auth = {...S.auth, pw, step:2, pc:'', err:'', info:''}; render();
  }
});
document.addEventListener('keydown', e => {
  const t = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
  if(e.key === 'Escape'){
    if(S.m){ closeModal(); return; }
    if(S.phase === 'app' && S.mode !== 'view'){ cancelEditor(); return; }
    if(S.phase === 'app' && S.selId && matchMedia('(max-width:759px)').matches){ S.selId = null; renderApp(); }
    return;
  }
  const kpActive = (S.phase === 'login' && S.auth.step === 2) || (S.phase === 'setup' && S.setup && S.setup.step === 3);
  if(kpActive && !typing && !S.m){
    if(/^\d$/.test(e.key)){ e.preventDefault(); kpInput(e.key); return; }
    if(e.key === 'Backspace'){ e.preventDefault(); kpInput('del'); return; }
  }
  if(t.id === 'r-key' && e.key === 'Enter'){ e.preventDefault(); recoverGo(); return; }
  if(t.id === 'ed-newlabel' && e.key === 'Enter'){ e.preventDefault(); ACT['ed-newlabel'](); return; }
  if(S.phase !== 'app' || S.m) return;
  if(!typing && e.key === '/' ){ e.preventDefault(); if(S.tab !== 'vault'){ S.tab = 'vault'; renderApp(); } $('#q').focus(); return; }
  if(!typing && (e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey){ e.preventDefault(); ACT.new(); return; }
  if(!typing && (e.key === 'Enter' || e.key === ' ') && t.getAttribute && t.getAttribute('role') === 'button' && t.dataset.act){ e.preventDefault(); t.click(); }
});
setInterval(tickTotp, 1000);
async function tickTotp(){
  if(S.phase !== 'app') return;
  const els = document.querySelectorAll('[data-totp]'); if(!els.length) return;
  const t = now();
  for(const el of els){
    const [id, key] = el.dataset.totp.split('|'); const a = acct(id); if(!a) continue;
    const f = a.fields.find(x => 'f:' + x.id === key); if(!f) continue;
    const cfg = totpCfg(f.value); if(!cfg.valid) continue;
    try{ const code = await totpCode(cfg, t); S.totpNow.set(id + '|' + key, code); el.textContent = fmtCode(code); }catch(e){ el.textContent = 'Invalid key'; }
    const ring = el.parentElement && el.parentElement.querySelector('.ring');
    if(ring){ const rem = cfg.period - (Math.floor(t / 1000) % cfg.period); ring.querySelector('.fg').style.strokeDashoffset = String(56.55 * (1 - rem / cfg.period)); ring.classList.toggle('low', rem <= 5); }
  }
}

/* ---------- boot ---------- */
async function boot(){
  const ui = LS.get(K.ui); if(ui && ui.theme) applyTheme(ui.theme);
  if(!(window.crypto && crypto.subtle)){ S.phase = 'fatal'; S.fatal = 'This browser can\'t encrypt your vault safely.'; render(); return; }
  if(S.hasClaude){ try{ window.claude.use('downloads').then(d => { S.downloads = d || null; }).catch(() => {}); }catch(e){} }
  S.cloudP = Cloud.init().then(async ok => { if(ok){ try{ S.cloudHeader = await Cloud.getHeader(); }catch(e){} } return ok; });
  if(guard.wait()) startWaitTicker();
  if(WEB && 'serviceWorker' in navigator){ try{ navigator.serviceWorker.register('/sw.js').catch(() => {}); }catch(e){} }
  if(LS.get(K.header)){ S.phase = 'login'; render(); return; }
  S.phase = 'boot'; render();
  await Promise.race([S.cloudP, sleep(11000)]);
  if(S.phase !== 'boot') return;
  if(S.cloudHeader) S.phase = 'login'; else { S.phase = 'setup'; S.setup = newSetup(); }
  render();
}
boot();
