/* ---------- auth screens ---------- */
function authShell(inner){
  return `<div class="auth">
    <aside class="auth-art" aria-hidden="true"><div class="ruled"></div>
      <div>${MARK(64)}<div class="wordmark" style="margin-top:26px">Vaultleaf</div><p class="tagline">Every account on its own locked page.</p></div>
      <ul class="points">
        <li>${ic('shield')}<span>Encrypted on your device with AES-256 before anything is saved or synced.</span></li>
        <li>${ic('lock')}<span>Unlock with your master password, then your passcode.</span></li>
        <li>${ic('notes')}<span>Read it like your old notes, or as cards you can search and copy from.</span></li>
      </ul>
    </aside>
    <div><div class="auth-brand">${MARK(36)}<span class="wordmark">Vaultleaf</span></div>
    <div class="auth-main"><div class="auth-card">${inner}<a class="btn ghost small" style="justify-self:center" href="${GUIDE_URL}" target="_blank" rel="noopener">${ic('question','s')}How Vaultleaf works</a></div></div></div></div>`;
}
const rkHTML = rk => String(rk).split('-').map((g, i, arr) => `<span>${esc(g)}${i < arr.length - 1 ? '-' : ''}</span>`).join('<wbr>');
const stepsBar = (n, total = 4) => `<div class="steps" aria-label="Step ${n} of ${total}">${Array.from({length:total}, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
function meterHTML(id){ return `<div><div class="meter"><b id="${id}"></b></div><div class="meter-row"><span id="${id}-l">Use at least 10 characters</span><span id="${id}-b"></span></div></div>`; }
function updateMeter(id, pw){
  const b = document.getElementById(id); if(!b) return;
  const s = strength(pw);
  const col = ['var(--danger)','var(--danger)','var(--warn)','var(--ok)','var(--ok)'][Math.max(0, s.score)];
  b.style.width = s.score < 0 ? '0' : (12 + s.score * 22) + '%'; b.style.background = col;
  const l = document.getElementById(id + '-l'), bb = document.getElementById(id + '-b');
  if(l) l.textContent = s.score < 0 ? 'Use at least 10 characters' : s.label;
  if(bb) bb.textContent = s.score < 0 ? '' : 'Guessed ' + crackTime(s.bits);
}
function pinsHTML(len, filled, shake){ return `<div class="pins ${len > 6 ? 'n8' : ''} ${shake ? 'shake' : ''}" aria-label="${filled} of ${len} digits entered">${Array.from({length:len}, (_, i) => `<i class="${i < filled ? 'f' : ''}"></i>`).join('')}</div>`; }
function keypadHTML(disabled){
  const k = d => `<button type="button" data-act="kp" data-d="${d}" ${disabled ? 'disabled' : ''} aria-label="${d}">${d}</button>`;
  return `<div class="keypad" role="group" aria-label="Passcode keypad">${[1,2,3,4,5,6,7,8,9].map(k).join('')}<button type="button" class="txt" data-act="kpclear" ${disabled ? 'disabled' : ''}>Clear</button>${k(0)}<button type="button" class="txt" data-act="kpdel" ${disabled ? 'disabled' : ''} aria-label="Delete last digit">Delete</button></div>`;
}
const pcLenFromHeaders = () => { const h = [LS.get(K.header), S.cloudHeader].filter(Boolean).sort((a, b) => (b.hdrAt || 0) - (a.hdrAt || 0))[0]; return (h && h.pcLen) || 6; };

function renderSetup(){
  const st = S.setup, reset = st.mode === 'reset';
  const total = reset ? 2 : 4, n = reset ? st.step - 1 : st.step;
  let h = '';
  if(st.step === 1){
    h = `${stepsBar(1)}<h1>Set up your vault</h1>
      <p class="muted">Everything you store is encrypted on this device before it is saved. You'll unlock it with a master password, then a passcode.</p>
      <div class="field"><label for="s-name">Your name</label><input id="s-name" class="input" data-sf="name" value="${esc(st.name)}" autocomplete="name" placeholder="Optional"></div>
      <div class="field"><label for="s-email">Email</label><input id="s-email" class="input" type="email" data-sf="email" value="${esc(st.email)}" autocomplete="email" placeholder="Optional, shown on your backups"></div>
      <button class="btn primary block" data-act="s-next">Continue</button>
      ${st.importVault ? `<div class="banner" style="margin:0">${ic('shield','s')}<b>Opening an emergency kit with ${st.importVault.accounts.length} account${st.importVault.accounts.length === 1 ? '' : 's'}. Choose your own password and passcode to keep them in your vault.</b></div>` : `
      ${WEB ? `<button class="btn ghost block" data-act="s-link">${ic('cloud')}Use my vault from another device</button>` : ''}
      <button class="btn ghost block" data-act="s-restore">${ic('restore')}Restore a backup or emergency kit</button>`}`;
  } else if(st.step === 2){
    h = `${stepsBar(n, total)}<h1>${reset ? 'Choose a new master password' : 'Choose a master password'}</h1>
      ${st.importVault ? `<div class="banner" style="margin:0">${ic('shield','s')}<b>The emergency kit opened: ${st.importVault.accounts.length} account${st.importVault.accounts.length === 1 ? '' : 's'}${st.importVault.profile.name ? ' from ' + esc(st.importVault.profile.name) : ''}. Now choose your own password and passcode to keep them safe in your vault.</b></div>` : ''}
      <p class="muted">This is the main key to your vault. A few random words is easy to type and hard to guess.</p>
      <div class="field"><label for="s-pw">Master password</label><div class="input-wrap"><input id="s-pw" class="input" type="${st.peek ? 'text' : 'password'}" data-sf="pw" value="${esc(st.pw)}" autocomplete="new-password" spellcheck="false" autocapitalize="off"><button class="icon-btn" data-act="s-peek" aria-label="${st.peek ? 'Hide' : 'Show'} password">${ic(st.peek ? 'eyeoff' : 'eye')}</button></div>${meterHTML('s-meter')}</div>
      <div class="field"><label for="s-pw2">Type it again</label><input id="s-pw2" class="input" type="${st.peek ? 'text' : 'password'}" data-sf="pw2" value="${esc(st.pw2)}" autocomplete="new-password" spellcheck="false" autocapitalize="off"></div>
      <button class="btn small" data-act="s-suggest" style="justify-self:start">${ic('dice','s')}Suggest a passphrase</button>
      ${st.err ? `<p class="err" role="alert">${esc(st.err)}</p>` : ''}
      <div style="display:flex;gap:10px"><button class="btn" data-act="s-back">Back</button><button class="btn primary" style="flex:1" data-act="s-next">Continue</button></div>`;
  } else if(st.step === 3){
    const confirming = st.pcStage === 'confirm', val = confirming ? st.pc2 : st.pc;
    h = `${stepsBar(n, total)}<h1>${confirming ? 'Enter the passcode again' : 'Set a passcode'}</h1>
      <p class="muted">${confirming ? 'Just to make sure.' : `You'll enter this after your password every time you unlock. Pick ${st.pcLen} digits that aren't your phone's code.`}</p>
      ${!confirming ? `<div class="seg" role="group" aria-label="Passcode length" style="justify-self:center">${[4,6,8].map(l => `<button data-act="s-pclen" data-l="${l}" aria-pressed="${st.pcLen === l}">${l} digits</button>`).join('')}</div>` : ''}
      ${pinsHTML(st.pcLen, val.length, st.shake)}
      ${st.err ? `<p class="err" role="alert" style="text-align:center">${esc(st.err)}</p>` : ''}
      ${st.busy ? `<div style="display:grid;justify-items:center;gap:10px"><div class="spinner"></div><span class="muted">Encrypting your vault…</span></div>` : keypadHTML(false)}
      <button class="btn ghost" data-act="s-back" ${st.busy ? 'disabled' : ''}>Back</button>`;
  } else if(st.step === 4){
    h = `${stepsBar(4)}<h1>Save your recovery key</h1>
      <p class="muted">If you forget your password or passcode, this key is the only way back in. Nobody else can reset it for you.</p>
      <div class="rk" id="rk">${rkHTML(st.rk)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" style="flex:1" data-act="s-rkcopy">${ic('copy','s')}Copy key</button>${canDownload() ? `<button class="btn" style="flex:1" data-act="s-rkdl">${ic('download','s')}Download kit</button>` : ''}</div>
      <label class="check"><input type="checkbox" id="s-saved" data-sf="saved" ${st.saved ? 'checked' : ''}><span>I saved my recovery key somewhere safe, away from this device.</span></label>
      ${WEB || Cloud.ready ? `<label class="check"><input type="checkbox" data-sf="sync" ${st.sync ? 'checked' : ''}><span>Sync this vault to my other devices<br><small class="muted">Only encrypted data leaves this device. Your password and passcode never do.</small></span></label>` : `<p class="hint">${ic('warn','s')} This vault will live in this browser only. Keep the backup file safe: you'll find it in Settings.</p>`}
      ${st.importVault ? '' : `<label class="check"><input type="checkbox" data-sf="examples" ${st.examples ? 'checked' : ''}><span>Add 4 example accounts to explore<br><small class="muted">Labeled Examples. Remove them in one tap.</small></span></label>`}
      <button class="btn primary block" data-act="s-finish" ${st.saved && !st.busy ? '' : 'disabled'}>${st.busy ? 'Opening…' : 'Open my vault'}</button>`;
  }
  root.innerHTML = authShell(h);
  if(st.step === 2){ updateMeter('s-meter', st.pw); }
  const f = root.querySelector(st.step === 1 ? '#s-name' : st.step === 2 ? '#s-pw' : null);
  if(f && !matchMedia('(pointer:coarse)').matches) f.focus();
  st.shake = false;
}
function newSetup(mode){ return {mode:mode || 'new', step:mode === 'reset' ? 2 : 1, name:'', email:'', pw:'', pw2:'', pc:'', pc2:'', pcLen:6, pcStage:'enter', rk:'', saved:false, sync:true, examples:true, err:'', busy:false, peek:false}; }

function renderLogin(){
  const a = S.auth, len = pcLenFromHeaders(), wait = guard.wait();
  let h;
  if(a.step === 1){
    h = `<h1>Welcome back</h1>
      ${a.info ? `<p class="hint" role="status">${ic('lock','s')} ${esc(a.info)}</p>` : ''}
      <form class="field" data-form="login-pw" style="gap:14px" autocomplete="on">
        <div class="field"><label for="l-pw">Master password</label><div class="input-wrap"><input id="l-pw" class="input" type="${a.peek ? 'text' : 'password'}" value="${esc(a.pw)}" autocomplete="current-password" spellcheck="false" autocapitalize="off" required><button type="button" class="icon-btn" data-act="l-peek" aria-label="${a.peek ? 'Hide' : 'Show'} password">${ic(a.peek ? 'eyeoff' : 'eye')}</button></div></div>
        ${a.err ? `<p class="err" role="alert">${esc(a.err)}</p>` : ''}
        ${wait ? `<p class="err" role="alert" id="waitline">Too many tries. Wait ${wait}s, then try again.</p>` : ''}
        <button class="btn primary block" type="submit">Continue</button>
      </form>
      ${Bio.rec() && Bio.supported() ? (Bio.due() ? `<p class="hint">${ic('lock','s')} Face ID and fingerprint unlock needs your password and passcode at least every ${BIO_MAX_DAYS} days.</p>` : `<button class="btn block" data-act="l-bio" ${wait ? 'disabled' : ''}>${ic('user')}Unlock with Face ID or fingerprint</button>`) : ''}
      <button class="btn ghost" data-act="go-recover">Forgot your password or passcode?</button>
      ${S.cloudHeader && !LS.get(K.header) ? `<p class="hint">${ic('cloud','s')} Found your synced vault. Unlock it with the password and passcode you use on your other device.</p>` : ''}`;
  } else {
    h = `<h1>Enter your passcode</h1>
      <p class="muted">${len} digits</p>
      ${pinsHTML(len, a.pc.length, a.shake)}
      ${a.busy ? `<div style="display:grid;justify-items:center;gap:10px"><div class="spinner"></div><span class="muted">Unlocking…</span></div>` : keypadHTML(!!wait)}
      ${wait ? `<p class="err" role="alert" id="waitline" style="text-align:center">Too many tries. Wait ${wait}s, then try again.</p>` : ''}
      <button class="btn ghost" data-act="l-back" ${a.busy ? 'disabled' : ''}>Use a different password</button>`;
  }
  root.innerHTML = authShell(h);
  a.shake = false;
  const f = $('#l-pw'); if(f && !matchMedia('(pointer:coarse)').matches) f.focus();
}
function renderRecover(){
  const r = S.rec || {};
  root.innerHTML = authShell(`<h1>Use your recovery key</h1>
    <p class="muted">Enter the recovery key you saved when you set up your vault. Then you'll choose a new password and passcode.</p>
    <div class="field"><label for="r-key">Recovery key</label><input id="r-key" class="input mono" value="${esc(r.key || '')}" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" spellcheck="false" autocapitalize="characters" autocomplete="off"></div>
    ${r.err ? `<p class="err" role="alert">${esc(r.err)}</p>` : ''}
    <div style="display:flex;gap:10px"><button class="btn" data-act="r-back">Back</button><button class="btn primary" style="flex:1" data-act="r-go" ${r.busy ? 'disabled' : ''}>${r.busy ? 'Checking…' : 'Check key'}</button></div>`);
  const f = $('#r-key'); if(f) f.focus();
}
function render(){
  document.title = 'Vaultleaf';
  if(S.phase === 'boot') root.innerHTML = `<div class="boot">${MARK(56)}<div class="spinner"></div><span>Opening Vaultleaf…</span></div>`;
  else if(S.phase === 'fatal') root.innerHTML = `<div class="boot" style="padding:24px;text-align:center">${MARK(56)}<h2>${esc(S.fatal)}</h2><p class="muted">Open Vaultleaf in an up-to-date version of Chrome, Safari, Edge or Firefox.</p></div>`;
  else if(S.phase === 'setup') renderSetup();
  else if(S.phase === 'login') renderLogin();
  else if(S.phase === 'recover') renderRecover();
  else if(S.phase === 'app') renderApp();
}

/* ---------- unlock ---------- */
async function unlock(pw, pc){
  if(guard.wait()){ S.auth.pc = ''; render(); return; }
  S.auth.busy = true; render();
  await Promise.race([S.cloudP, sleep(3000)]);
  const lh = LS.get(K.header);
  const cands = [lh, S.cloudHeader].filter(Boolean).filter((h, i, arr) => arr.findIndex(x => JSON.stringify(x) === JSON.stringify(h)) === i).sort((a, b) => (b.hdrAt || 0) - (a.hdrAt || 0));
  let raw = null, used = null;
  for(const h of cands){ try{ raw = await unwrapCreds(h, pw, pc); used = h; break; }catch(e){} }
  if(!raw){
    const g = guard.fail();
    S.auth = {...S.auth, step:g.until > now() ? 2 : 1, pc:'', busy:false, shake:true, err:g.until > now() ? '' : 'That password and passcode don\'t match this vault. Check both and try again.', pw:g.until > now() ? S.auth.pw : ''};
    if(S.auth.step === 1) S.auth.pw = '';
    render(); startWaitTicker(); return;
  }
  guard.reset(); Bio.touch();
  try{ await openWith(raw, used); }
  catch(e){ console.error(e); S.auth = {step:1, pw:'', pc:'', busy:false, err:e.message || 'Could not open the vault.'}; render(); }
}
async function bioUnlock(){
  if(guard.wait() || S.auth.busy) return;
  S.auth.busy = true;
  let raw;
  try{ raw = await Bio.unlock(); }
  catch(e){
    S.auth.busy = false;
    if(e && e.name === 'NotAllowedError'){ toast('Face ID or fingerprint was cancelled. You can use your password and passcode.', 'lock'); return; }
    if(e && e.name === 'OperationError'){ Bio.remove(); S.auth.err = 'Face ID or fingerprint no longer matches this vault, so it was turned off. Use your password and passcode.'; render(); return; }
    S.auth.err = e.message || 'Face ID or fingerprint didn\'t work. Use your password and passcode.'; render(); return;
  }
  S.auth.step = 1; render();
  await Promise.race([S.cloudP, sleep(3000)]);
  const header = [LS.get(K.header), S.cloudHeader].filter(Boolean).sort((a, b) => (b.hdrAt || 0) - (a.hdrAt || 0))[0];
  try{ await openWith(raw, header); }
  catch(e){ console.error(e); S.auth = {step:1, pw:'', pc:'', busy:false, err:e.message || 'Could not open the vault.'}; render(); }
}
let waitTicker = null;
function startWaitTicker(){ clearInterval(waitTicker); waitTicker = setInterval(() => { const w = guard.wait(); const el = $('#waitline'); if(!w){ clearInterval(waitTicker); if(S.phase === 'login') render(); } else if(el) el.textContent = `Too many tries. Wait ${w}s, then try again.`; }, 1000); }
async function openWith(raw, header, opts = {}){
  S.dekRaw = raw; S.dek = await dekKey(raw); S.header = header; LS.set(K.header, header);
  let vault = opts.vault || null;
  const lb = opts.vault ? null : LS.get(K.body);
  if(lb){ try{ vault = await openVault(S.dek, lb); S.body = lb; }catch(e){ console.warn('local copy unreadable', e); } }
  if(Cloud.ready && !opts.vault){
    try{
      const h = await Cloud.head();
      let meta = h ? h.meta : null;
      if(!h && Cloud.kind === 'supa' && lb) S.remoteGone = true;
      if(meta && meta.off){ S.remoteOff = meta; meta = null; }
      if(meta && meta.rev && (!lb || meta.rev !== lb.rev)){
        const cb = await Cloud.pull(meta);
        const rv = await openVault(S.dek, cb);
        vault = vault ? mergeVaults(upgradeVault(vault), upgradeVault(rv)) : rv;
        if(!S.body) S.body = cb;
      }
      if(meta && meta.rev) Cloud.lastRev = meta.rev;
      if(meta) Cloud.lastAt = now();
      if(h && h.header && (h.header.hdrAt || 0) > (header.hdrAt || 0)){ S.header = h.header; LS.set(K.header, h.header); }
    }catch(e){ console.warn('cloud read', e); }
  }
  if(!vault) throw new Error('Your vault data could not be read on this device. If you have a backup file, restore it from the first screen.');
  S.vault = upgradeVault(vault); hayCache = new WeakMap();
  if(S.remoteOff && S.vault.settings.sync && S.remoteOff.at > (S.vault.settings.updatedAt || 0)){ S.vault.settings.sync = false; S.vault.settings.updatedAt = S.remoteOff.at; }
  if(Cloud.kind === 'supa'){
    if(S.remoteGone && S.vault.settings.sync){ S.vault.settings.sync = false; Cloud.forget(); S.syncGoneNote = true; }
    else if(Cloud.ready && !S.vault.settings.sync){ S.vault.settings.sync = true; }
    else if(!Cloud.ready && S.vault.settings.sync && S.vault.settings.syncCode){ await Cloud.use(S.vault.settings.syncCode); Cloud.lastRev = null; }
  }
  S.remoteOff = null; S.remoteGone = false;
  const purged = autoPurge();
  S.phase = 'app'; S.tab = 'vault'; S.filter = 'all'; S.q = ''; S.selId = null; S.mode = 'view';
  if(WEB && navigator.storage && navigator.storage.persist){ navigator.storage.persist().catch(() => {}); }
  applyTheme(S.vault.settings.theme);
  lastAct = now();
  root.innerHTML = '';
  render();
  await persist();
  if(syncOn()){ await pushNow(); watchCloud(); syncFiles(); }
  if(S.syncGoneNote){ S.syncGoneNote = false; toast('This vault stopped syncing: sync was turned off or given a new code on another device', 'cloud'); }
  if(opts.after) opts.after();
  if(purged) toast(`Cleared ${purged} account${purged === 1 ? '' : 's'} deleted over 30 days ago`, 'trash');
  if(opts.toast) toast(opts.toast);
}

/* ---------- setup finish ---------- */
async function finishSetup(){
  const st = S.setup; st.busy = true; render();
  let v = newVault({name:st.name.trim(), email:st.email.trim()});
  S.dek = await dekKey(st.dekRaw);
  if(st.importVault){
    v = upgradeVault({...st.importVault, settings:{...v.settings}, profile:{...v.profile}, meta:{lastBackupAt:0, kits:[]}, tombstones:[]});
    for(const [id, bytes] of Object.entries(st.importFiles || {})) await Files.putRaw(id, await Files.encrypt(S.dek, id, bytes));
  }
  const wantSync = !!(st.sync && (WEB || Cloud.ready));
  if(wantSync && WEB){ const code = newSyncCode(); await Cloud.use(code); v.settings.syncCode = code; }
  v.settings.sync = wantSync;
  S.vault = v;
  if(st.examples && !st.importVault) addExamples();
  LS.set(K.header, st.header);
  guard.reset();
  const dekRaw = st.dekRaw, header = st.header, vault = S.vault;
  S.setup = null;
  await openWith(dekRaw, header, {vault, toast:st.importVault ? 'Emergency kit opened in your new vault' : 'Your vault is ready', after:wantSync && WEB ? () => openSyncCode(true) : null});
}
async function finishReset(){
  const st = S.setup; st.busy = true; render();
  const w = await wrapCreds(st.pw, st.pc, st.dekRaw);
  const header = {...st.baseHeader, ...w, hdrAt:now()};
  LS.set(K.header, header); guard.reset();
  const dekRaw = st.dekRaw; S.setup = null;
  await openWith(dekRaw, header, {toast:'New password and passcode saved'});
}

/* ---------- examples ---------- */
function addExamples(){
  const before = new Set(V().labels.map(l => l.id));
  const t = now(), ex = ensureLabelPath('Examples');
  const lab = p => ensureLabelPath(p);
  const mk = o => { const a = Object.assign(blankAccount(), o, {example:true, no:V().nextNo++}); a.labels = [...(o.labels || []), ex]; V().accounts.push(a); return a; };
  const streaming = lab('Streaming'), cloud = lab('Work/Cloud'), finance = lab('Finance');
  for(const l of V().labels){ if(l.name === 'Examples') l.color = '#A0561C'; if(l.name === 'Streaming') l.color = '#7A4A8C'; if(l.name === 'Work') l.color = '#2F5D8A'; if(l.name === 'Cloud') l.color = '#2D6E73'; if(l.name === 'Finance') l.color = '#1D5B44'; }
  mk({tool:'Netflix', accountName:'Family plan', url:'netflix.com', email:'you@example.com', password:'sunshine2019', labels:[streaming],
    fields:[{id:uid(), type:'pin', label:'Profile PIN', value:'4821'}], qa:[{id:uid(), q:"First pet's name?", a:'Biscuit'}],
    notes:'Shared with the family. Each profile has its own PIN.', createdAt:t - 420 * DAY, updatedAt:t - 420 * DAY, pwChangedAt:t - 420 * DAY,
    history:[{id:uid(), at:t - 420 * DAY, kind:'created', text:'Stored'}], copies:[{id:uid(), at:t - 3 * DAY, field:'Password'}], lastCopiedAt:t - 3 * DAY});
  const oldPw = genPassword({len:18, lower:true, upper:true, digits:true, symbols:true}).value;
  mk({tool:'AWS', accountName:'Production', url:'https://console.aws.amazon.com', username:'ops-admin', email:'ops@example.com', password:genPassword({len:22, lower:true, upper:true, digits:true, symbols:true}).value, labels:[cloud], rotateDays:90,
    fields:[{id:uid(), type:'totp', label:'2FA code', value:'JBSWY3DPEHPK3PXP'}, {id:uid(), type:'key', label:'Access key ID', value:'AKIA' + b32enc(rand(10)).slice(0, 16)}, {id:uid(), type:'key', label:'Secret access key', value:genPassword({len:40, lower:true, upper:true, digits:true, symbols:false}).value}, {id:uid(), type:'text', label:'Account ID', value:'1234-5678-9012'}],
    admins:[{id:uid(), name:'Dana Ruiz', email:'dana@example.com', role:'Owner'}, {id:uid(), name:'Sam Patel', email:'sam@example.com', role:'Billing'}],
    notes:'Root login is locked away. Use this IAM admin for day-to-day work.', createdAt:t - 210 * DAY, updatedAt:t - 26 * DAY, pwChangedAt:t - 26 * DAY,
    history:[{id:uid(), at:t - 26 * DAY, kind:'password', text:'Changed password'}, {id:uid(), at:t - 210 * DAY, kind:'created', text:'Stored'}],
    secrets:[{id:uid(), at:t - 26 * DAY, label:'Password', value:oldPw}], copies:[{id:uid(), at:t - 2 * 3600e3, field:'2FA code'}, {id:uid(), at:t - 2 * 3600e3 - 40e3, field:'Password'}, {id:uid(), at:t - 5 * DAY, field:'Username'}], lastCopiedAt:t - 2 * 3600e3});
  mk({tool:'Ledger wallet', accountName:'Cold storage', labels:[finance],
    fields:[{id:uid(), type:'phrase', label:'Secret phrase', value:Array.from({length:12}, () => EFF[randInt(EFF.length)]).join(' ')}, {id:uid(), type:'pin', label:'Device PIN', value:'73915604'}, {id:uid(), type:'text', label:'Receive address', value:'bc1qexample0wallet0address0do0not0send'}],
    notes:'The paper copy of the phrase is in the fire safe.', createdAt:t - 90 * DAY, updatedAt:t - 90 * DAY, history:[{id:uid(), at:t - 90 * DAY, kind:'created', text:'Stored'}]});
  const wifi = textToAccount('Home Wi-Fi\nNetwork: Fernwood-5G\nPassword: copper-lantern-meadow\nRouter page: http://192.168.1.1\nAdmin: Router login <you@example.com>\nLabels: Home\n\nNotes:\nGuest network is Fernwood-Guest with no password.\nThe router is in the hall closet.');
  resolveLabels(wifi);
  mk({...wifi, labels:wifi.labels, createdAt:t - 1 * DAY, updatedAt:t - 1 * DAY, pwChangedAt:t - 1 * DAY, history:[{id:uid(), at:t - DAY, kind:'created', text:'Stored as a note'}]});
  for(const l of V().labels){ if(l.name === 'Home') l.color = '#7A6A12'; if(!before.has(l.id)) l.example = true; }
}

/* ---------- downloads ---------- */
const canDownload = () => !!S.downloads || !S.hasClaude;
async function saveFile(name, text){
  if(S.downloads){
    try{ await S.downloads.save({filename:name, data:text}); return 'saved'; }
    catch(e){ if(e && e.code === 'declined') return 'declined'; toast('Download is not available here. Use Copy instead.', 'warn'); return 'failed'; }
  }
  if(!S.hasClaude){
    const a = document.createElement('a'); a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], {type:'application/octet-stream'})); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return 'saved';
  }
  return 'failed';
}
function recoveryKitText(rk, name, email){
  return `VAULTLEAF RECOVERY KIT\n\nVault owner: ${name || '(not set)'}${email ? '\nEmail: ' + email : ''}\nCreated: ${new Date().toLocaleString()}\n\nRecovery key:\n${rk}\n\nUse this key on the Vaultleaf unlock screen ("Forgot your password or passcode?")\nto choose a new master password and passcode.\n\nKeep this somewhere safe and away from the device you use Vaultleaf on.\nAnyone with this key and a copy of your vault data can open it.\n`;
}
