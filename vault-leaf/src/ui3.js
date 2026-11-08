/* ---------- app shell ---------- */
const TABS = [['vault','Vault','key'],['generator','Generator','dice'],['health','Health','shield'],['activity','Activity','activity'],['settings','Settings','sliders']];
function shellHTML(){
  return `<div class="shell" id="shell">
    <aside class="side" id="side" aria-label="Navigation"></aside>
    <main class="main">
      <section class="pane list-pane" aria-label="Accounts">
        <div class="list-head">
          <div class="title-row"><h1 id="lt"></h1><div id="ltActs" style="display:flex;gap:2px;align-items:center"></div></div>
          <div class="search">${ic('search')}<input id="q" class="input" type="search" placeholder="Search names, usernames, labels…" autocomplete="off" spellcheck="false" aria-label="Search accounts"><button class="icon-btn clear" data-act="clearq" aria-label="Clear search" hidden>${ic('x','s')}</button></div>
          <div class="chips" id="chips" role="group" aria-label="Filter by label"></div>
          <div class="list-tools"><span class="hint tnum" id="lcount"></span>
            <label class="sr" for="sort">Sort accounts</label><select id="sort" data-set="settings.sort"><option value="updated">Recently edited</option><option value="name">Name A to Z</option><option value="copied">Recently copied</option><option value="created">Date stored</option><option value="no">Leaf number</option></select></div>
        </div>
        <div class="list" id="list"></div>
      </section>
      <section class="pane detail-pane" id="detail" aria-label="Account details"></section>
      <section class="pane page-pane" id="page"></section>
    </main>
    <nav class="bnav" id="bnav" aria-label="Sections"></nav>
    <button class="fab" data-act="new" aria-label="Add account">${ic('plus')}</button>
  </div>`;
}
function renderApp(){
  if(!$('#shell')) root.innerHTML = shellHTML();
  const sh = $('#shell');
  sh.dataset.view = view();
  sh.classList.toggle('tab-other', S.tab !== 'vault');
  sh.classList.toggle('detail-open', S.tab === 'vault' && (!!S.selId || S.mode === 'new'));
  renderSide(); renderNav(); renderHead(); renderList(); renderDetail(); renderPage();
}
function renderSide(){
  const side = $('#side'); if(!side) return;
  const counts = new Map(); let all = 0, fav = 0, trash = 0;
  for(const a of V().accounts){ if(a.trashedAt){ trash++; continue; } all++; if(a.fav) fav++; }
  const tree = labelTree();
  for(const {l} of tree){ const ids = labelDesc(l.id); counts.set(l.id, V().accounts.filter(a => !a.trashedAt && a.labels.some(x => ids.has(x))).length); }
  const lbtn = (f, label, n, extra = '') => `<button class="side-lbl" data-act="filter" data-v="${f}" aria-current="${S.tab === 'vault' && S.filter === f}">${extra}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span><span class="n tnum">${n || ''}</span></button>`;
  side.innerHTML = `<div class="brand">${MARK(30)}<span class="wordmark">Vaultleaf</span></div>
    <nav class="side-nav">${TABS.map(([k, l, i]) => `<button data-act="tab" data-v="${k}" aria-current="${S.tab === k ? 'page' : 'false'}">${ic(i)}${l}</button>`).join('')}${WEB ? `<button data-act="tab" data-v="guide" aria-current="${S.tab === 'guide' ? 'page' : 'false'}">${ic('question')}Guide</button>` : `<a class="side-link" href="${GUIDE_URL}" target="_blank" rel="noopener">${ic('question')}Guide</a>`}</nav>
    <h4>${view() === 'classic' ? 'Folders' : 'Labels'}</h4>
    ${lbtn('all', 'All accounts', all, ic(view() === 'classic' ? 'folder' : 'layers', 's'))}
    ${lbtn('fav', 'Favorites', fav, ic('star', 's'))}
    ${tree.map(({l, d}) => lbtn('l:' + l.id, l.name, counts.get(l.id), `<span style="width:${d * 14}px;flex:none"></span><span class="dot" style="background:${l.color}"></span>`)).join('')}
    ${lbtn('trash', 'Recently deleted', trash, ic('trash', 's'))}
    <button class="side-lbl" data-act="label-new">${ic('plus','s')}<span>New label</span></button>
    <div class="grow"></div>
    <div class="side-foot"><div id="syncline">${syncLine()}</div><button class="btn small" data-act="lock">${ic('lock','s')}Lock</button></div>`;
}
function renderNav(){
  const n = $('#bnav'); if(!n) return;
  n.innerHTML = TABS.map(([k, l, i]) => `<button data-act="tab" data-v="${k}" aria-current="${S.tab === k ? 'page' : 'false'}">${ic(i)}<span>${l}</span></button>`).join('');
}
function renderHead(){
  const lt = $('#lt'); if(!lt) return;
  lt.textContent = filterTitle();
  $('#ltActs').innerHTML = `<div class="seg" role="group" aria-label="View">
      <button data-act="view" data-v="classic" aria-pressed="${view() === 'classic'}" title="Classic notes view">${ic('notes','s')}<span class="sr">Classic</span></button>
      <button data-act="view" data-v="modern" aria-pressed="${view() === 'modern'}" title="Modern card view">${ic('cards','s')}<span class="sr">Modern</span></button></div>
    <button class="icon-btn" data-act="lock" aria-label="Lock vault" title="Lock">${ic('lock')}</button>
    <button class="btn small primary add-btn" data-act="new" title="Add an account (N)">${ic('plus','s')}Add</button>`;
  const q = $('#q'); if(q.value !== S.q) q.value = S.q;
  $('[data-act="clearq"]').hidden = !S.q;
  const chip = (f, label, dot) => `<button class="chip" data-act="filter" data-v="${f}" aria-pressed="${S.filter === f}">${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${esc(label)}</button>`;
  $('#chips').innerHTML = chip('all', 'All') + chip('fav', 'Favorites') + labelTree().map(({l}) => chip('l:' + l.id, labelPath(l.id), l.color)).join('') + chip('trash', 'Deleted');
  $('#sort').value = V().settings.sort;
}
function renderList(){
  const el = $('#list'); if(!el) return;
  const list = visible();
  const total = V().accounts.filter(a => !a.trashedAt).length;
  $('#lcount').textContent = list.length === 1 ? '1 account' : list.length + ' accounts';
  if(!list.length){
    let h;
    if(S.q) h = `<div class="empty"><h2>No matches</h2><p>Nothing matches “${esc(S.q)}”${S.filter !== 'all' ? ' in ' + esc(filterTitle()) : ''}.</p><button class="btn" data-act="clearq">Clear search</button></div>`;
    else if(S.filter === 'trash') h = `<div class="empty"><h2>Nothing deleted</h2><p>Accounts you delete stay here for 30 days.</p></div>`;
    else if(!total) h = `<div class="empty">${MARK(52)}<h2>Your vault is empty</h2><p>Add your first account, or bring over the notes you keep your passwords in now.</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button class="btn primary" data-act="new">${ic('plus','s')}Add an account</button><button class="btn" data-act="import-notes">${ic('import','s')}Import from Notes</button></div></div>`;
    else h = `<div class="empty"><h2>Nothing here yet</h2><p>No accounts ${S.filter === 'fav' ? 'are marked as favorites' : 'have this label'}.</p></div>`;
    el.innerHTML = h; return;
  }
  const exN = V().accounts.filter(a => a.example && !a.trashedAt).length;
  const banner = exN && S.filter === 'all' && !S.q ? `<div class="banner"><b>${exN} example account${exN === 1 ? ' is' : 's are'} here to explore. Try copying, revealing or editing them.</b><button class="btn small" data-act="rm-examples">Remove examples</button></div>` : '';
  if(view() === 'classic'){
    const s = V().settings.sort, grouped = s === 'updated' || s === 'created';
    let last = null, out = '';
    for(const a of list){
      const t = s === 'created' ? a.createdAt : a.updatedAt;
      const g = a.fav && S.filter !== 'trash' ? 'Pinned' : grouped ? dateGroup(t) : null;
      if(g && g !== last){ out += `<div class="group-h">${esc(g)}</div>`; last = g; }
      const d = new Date(t), today = dateGroup(t) === 'Today';
      const preview = a.username || a.email || a.accountName || (a.notes || '').split('\n')[0] || 'No additional text';
      out += `<div class="note-row" role="button" tabindex="0" data-act="open" data-id="${a.id}" aria-current="${S.selId === a.id}">
        <div class="nt">${hl(a.tool)}</div><div class="np"><time datetime="${d.toISOString()}">${today ? fmtTime(t) : d.toLocaleDateString(undefined, {month:'numeric', day:'numeric', year:'2-digit'})}</time>${hl(preview)}</div></div>`;
    }
    el.innerHTML = banner + out;
  } else {
    el.innerHTML = banner + list.map(a => {
      const sub = a.username || a.email || (a.fields.find(f => !isSecret(f.type) && f.value) || {}).value || '';
      return `<div class="card" role="button" tabindex="0" data-act="open" data-id="${a.id}" aria-current="${S.selId === a.id}">
        ${tile(a)}
        <div class="t"><div class="t1"><span style="overflow:hidden;text-overflow:ellipsis">${hl(a.tool)}</span>${a.accountName ? `<span class="an">${hl(a.accountName)}</span>` : ''}${a.fav ? `<span class="star" aria-label="Favorite">${ic('star','s')}</span>` : ''}</div>
          ${sub ? `<div class="t2">${hl(sub)}</div>` : ''}
          ${a.labels.length ? `<div class="tags">${a.labels.slice(0, 3).map(tagHTML).join('')}${a.labels.length > 3 ? `<span class="tag">+${a.labels.length - 3}</span>` : ''}</div>` : ''}</div>
        <div class="quick">${(a.username || a.email) ? `<button class="icon-btn" data-act="copy" data-id="${a.id}" data-k="${a.username ? 'username' : 'email'}" aria-label="Copy ${a.username ? 'username' : 'email'} for ${esc(a.tool)}" title="Copy ${a.username ? 'username' : 'email'}">${ic('user')}</button>` : ''}${a.password ? `<button class="icon-btn" data-act="copy" data-id="${a.id}" data-k="password" aria-label="Copy password for ${esc(a.tool)}" title="Copy password">${ic('key')}</button>` : ''}</div>
      </div>`;
    }).join('');
  }
}

/* ---------- detail ---------- */
function refreshDetailKeepScroll(){ const d = $('#detail'); const st = d ? d.scrollTop : 0; renderDetail(); if(d) d.scrollTop = st; }
function renderDetail(){
  const d = $('#detail'); if(!d) return;
  if(S.mode === 'new' || S.mode === 'edit'){ d.innerHTML = S.editKind === 'note' ? classicEditorHTML() : editorHTML(); afterEditorRender(); return; }
  const a = S.selId && acct(S.selId);
  if(!a){ d.innerHTML = `<div class="detail-empty">${MARK(64)}<p>${V().accounts.some(x => !x.trashedAt) ? 'Pick an account to open it.' : 'Your accounts will open here.'}</p><p class="hint">Press <kbd>/</kbd> to search, <kbd>N</kbd> to add.</p>${guideLink('btn small', 'New here? Open the guide')}</div>`; return; }
  d.innerHTML = view() === 'classic' ? classicDetailHTML(a) : detailHTML(a);
  tickTotp();
}
function topBar(a, kind){
  const trashed = !!a.trashedAt;
  return `<div class="d-top">
    <button class="icon-btn back" data-act="close-detail" aria-label="Back to list">${ic('left')}</button>
    ${kind === 'classic' ? `<span class="hint" style="padding-left:4px">${esc(filterTitle())}</span>` : ''}
    <span class="sp"></span>
    ${trashed ? `<button class="btn small" data-act="restore" data-id="${a.id}">${ic('restore','s')}Restore</button><button class="btn small danger" data-act="purge" data-id="${a.id}">Delete forever</button>` :
    `<button class="icon-btn ${a.fav ? 'on' : ''}" data-act="fav" data-id="${a.id}" aria-pressed="${a.fav}" aria-label="${a.fav ? 'Remove from favorites' : 'Add to favorites'}" title="${a.fav ? 'Unpin' : 'Pin to top'}">${ic('star')}</button>
    <button class="btn small" data-act="edit" data-id="${a.id}">${ic('edit','s')}Edit</button>
    <button class="icon-btn" data-act="more" data-id="${a.id}" aria-label="More actions">${ic('more')}</button>`}
  </div>`;
}
function fieldRow(a, key, label, value, type, pills = ''){
  const secret = isSecret(type) || key === 'password' || key.startsWith('a:') || key.startsWith('h:');
  const rk = a.id + '|' + key, shown = !secret || S.revealed.has(rk);
  let v;
  if(type === 'totp'){
    const cfg = totpCfg(value);
    v = cfg.valid ? `<span class="totp"><b data-totp="${a.id}|${key}">${fmtCode(S.totpNow.get(rk))}</b><svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9" stroke-dasharray="56.55" stroke-dashoffset="0"/></svg></span>` : `<span class="err">This 2FA key isn't valid. Edit it and paste the setup key again.</span>`;
  }
  else if(!value) v = `<span class="muted">Empty</span>`;
  else if(!shown) v = `<span class="masked mono">••••••••••</span>`;
  else if(type === 'phrase'){ const w = String(value).trim().split(/\s+/); v = `<div class="words">${w.map((x, i) => `<span><i>${i + 1}</i>${esc(x)}</span>`).join('')}</div>`; }
  else if(secret || ftype(type).mono) v = `<span class="mono">${colorize(value)}</span>`;
  else v = esc(value);
  const url = type === 'url' ? safeUrl(value) : '';
  const acts = `${secret && type !== 'totp' ? `<button class="icon-btn" data-act="reveal" data-id="${a.id}" data-k="${key}" aria-label="${shown ? 'Hide' : 'Show'} ${esc(label)}" title="${shown ? 'Hide' : 'Show'}">${ic(shown ? 'eyeoff' : 'eye')}</button>` : ''}${url ? `<a class="icon-btn" data-act="noop" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(label)}" title="Open">${ic('ext')}</a>` : ''}<button class="icon-btn" data-act="copy" data-id="${a.id}" data-k="${key}" aria-label="Copy ${esc(label)}" title="Copy">${ic('copy')}</button>`;
  return `<div class="frow" role="button" tabindex="0" data-act="copy" data-id="${a.id}" data-k="${key}" aria-label="Copy ${esc(label)}">
    <div class="fl">${esc(label)}${pills}</div><div class="fv">${v}</div><div class="fa">${acts}</div></div>`;
}
function pwPills(a){
  const s = strength(a.password);
  const cls = s.score <= 1 ? 'bad' : s.score === 2 ? 'warn' : 'good';
  const reused = V().accounts.filter(x => !x.trashedAt && x.id !== a.id && x.password && x.password === a.password).length;
  return `${isLeaked(a) ? `<span class="pill bad">${ic('warn','s')}Found in breaches</span>` : ''}<span class="pill ${cls}">${s.label}</span>${reused ? `<span class="pill bad">Used on ${reused + 1} accounts</span>` : ''}${isOld(a) ? `<span class="pill warn">${ic('clock','s')}Set ${ago(a.pwChangedAt || a.createdAt)}</span>` : ''}`;
}
function detailHTML(a){
  const signin = [], secrets = [], other = [];
  if(a.url) signin.push(fieldRow(a, 'url', 'Website', a.url, 'url'));
  if(a.username) signin.push(fieldRow(a, 'username', 'Username', a.username, 'text'));
  if(a.email) signin.push(fieldRow(a, 'email', 'Email', a.email, 'email'));
  if(a.password) signin.push(fieldRow(a, 'password', 'Password', a.password, 'password', pwPills(a)));
  for(const f of a.fields){
    const row = fieldRow(a, 'f:' + f.id, f.label || ftype(f.type).name, f.value, f.type);
    if(f.type === 'totp') signin.push(row); else if(isSecret(f.type)) secrets.push(row); else other.push(row);
  }
  const sec = (title, rows, icon) => rows.length ? `<div class="sec-wrap"><div class="sec-h"><h3>${title}</h3></div><div class="sec">${rows.join('')}</div></div>` : '';
  const qa = a.qa.map(q => fieldRow(a, 'a:' + q.id, q.q || 'Question', q.a, 'secret'));
  const admins = a.admins.map(d => `<div class="frow" role="button" tabindex="0" data-act="copy" data-id="${a.id}" data-k="ad:${d.id}" aria-label="Copy admin email"><div class="fl">${esc(d.role || 'Admin')}</div><div class="fv">${esc(d.name)}${d.name && d.email ? '<br>' : ''}${d.email ? `<span class="muted">${esc(d.email)}</span>` : ''}</div><div class="fa"><button class="icon-btn" data-act="copy" data-id="${a.id}" data-k="ad:${d.id}" aria-label="Copy ${d.email ? 'email' : 'name'}">${ic('copy')}</button></div></div>`);
  const trashed = a.trashedAt ? `<div class="banner" style="margin:0">${ic('trash','s')}<b>Deleted ${fmtDate(a.trashedAt)}. It's removed for good 30 days after that.</b></div>` : '';
  return `${topBar(a)}<div class="d-body">${trashed}
    <div class="d-head">${tile(a, 56)}<div style="min-width:0"><h2>${esc(a.tool)}</h2>${a.accountName ? `<div class="sub">${esc(a.accountName)}</div>` : ''}
      ${a.labels.length ? `<div class="d-tags">${a.labels.map(tagHTML).join('')}</div>` : ''}</div></div>
    ${sec('Sign-in', signin)}${sec('Keys and secrets', secrets)}${sec('Other details', other)}${sec('Security questions', qa)}${sec('Admins', admins)}
    ${a.notes ? `<div class="sec-wrap"><div class="sec-h"><h3>Notes</h3></div><div class="sec"><div class="notes-box">${esc(a.notes)}</div></div></div>` : ''}
    ${filesSectionHTML(a)}
    ${!signin.length && !secrets.length && !other.length && !qa.length && !a.notes && !(a.files || []).length ? `<div class="empty" style="padding:24px"><p>No details yet.</p><button class="btn" data-act="edit" data-id="${a.id}">Add details</button></div>` : ''}
    <div class="sec-wrap"><div class="sec-h"><h3>Record</h3></div><div class="sec"><div class="meta-grid">
      <div><span>Leaf</span><b class="tnum">No. ${String(a.no || 0).padStart(3, '0')}</b></div>
      <div><span>Stored</span><b title="${esc(fmtDT(a.createdAt))}">${fmtDate(a.createdAt)}</b></div>
      <div><span>Last edited</span><b title="${esc(fmtDT(a.updatedAt))}">${ago(a.updatedAt)}</b></div>
      ${a.password ? `<div><span>Password set</span><b title="${esc(fmtDT(a.pwChangedAt || a.createdAt))}">${fmtDate(a.pwChangedAt || a.createdAt)}</b></div>` : ''}
      <div><span>Last copied</span><b id="meta-copied">${ago(a.lastCopiedAt)}</b></div>
      <div><span>Times copied</span><b class="tnum" id="meta-copies">${a.copies.length}</b></div>
      ${a.rotateDays ? `<div><span>Change every</span><b>${a.rotateDays} days</b></div>` : ''}
    </div></div></div>
    ${historyHTML(a)}
  </div>`;
}
function historyHTML(a){
  const t = S.dtab;
  const tabs = [['changes','Changes',a.history.length],['secrets','Old passwords and keys',a.secrets.length],['copies','Copies',a.copies.length]];
  let items = '';
  if(t === 'changes') items = a.history.map(h => `<li><span class="ic ${h.kind === 'password' ? 'pw' : ''}">${ic(h.kind === 'password' ? 'key' : h.kind === 'created' ? 'plus' : h.kind === 'trash' ? 'trash' : h.kind === 'restore' ? 'restore' : 'edit', 's')}</span><span class="what">${esc(h.text)}</span><span class="when" title="${esc(fmtDT(h.at))}">${fmtDate(h.at)}<br>${fmtTime(h.at)}</span></li>`).join('');
  else if(t === 'secrets') items = a.secrets.map(h => { const k = 'h:' + h.id, shown = S.revealed.has(a.id + '|' + k); return `<li><span class="ic pw">${ic('key','s')}</span><span class="what">${esc(h.label)}<small>Replaced ${fmtDT(h.at)}</small><span class="mono ${shown ? '' : 'masked'}">${shown ? colorize(h.value) : '••••••••••'}</span></span><span class="when" style="display:flex"><button class="icon-btn" data-act="reveal" data-id="${a.id}" data-k="${k}" aria-label="${shown ? 'Hide' : 'Show'} old value">${ic(shown ? 'eyeoff' : 'eye')}</button><button class="icon-btn" data-act="copy" data-id="${a.id}" data-k="${k}" aria-label="Copy old value">${ic('copy')}</button></span></li>`; }).join('');
  else items = a.copies.map(c => `<li><span class="ic copy">${ic('copy','s')}</span><span class="what">Copied ${esc(c.field.toLowerCase())}</span><span class="when" title="${esc(fmtDT(c.at))}">${fmtDate(c.at)}<br>${fmtTime(c.at)}</span></li>`).join('');
  const empty = {changes:'No changes recorded yet.', secrets:'When you change a password, key, PIN or answer, the old value is kept here.', copies:'Nothing copied from this account yet.'}[t];
  return `<div class="sec-wrap"><div class="sec-h"><h3>History</h3></div><div class="sec">
    <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button role="tab" data-act="dtab" data-v="${k}" aria-selected="${t === k}">${l} <span class="muted tnum">${n}</span></button>`).join('')}</div>
    ${items ? `<ul class="log">${items}</ul>` : `<p class="hint" style="padding:14px 16px;margin:0">${empty}</p>`}</div></div>`;
}
function classicDetailHTML(a){
  const lines = accountLines(a, labelPath).map(l => {
    const rk = a.id + '|' + l.key, secret = !!l.secret, shown = !secret || S.revealed.has(rk);
    let v;
    if(l.type === 'totp'){ const cfg = totpCfg(l.v); v = cfg.valid ? `<b class="mono" data-totp="${a.id}|${l.key}">${fmtCode(S.totpNow.get(rk))}</b> <span class="muted" style="font-size:14px">changes every ${cfg.period}s</span>` : '<span class="err">Invalid 2FA key</span>'; }
    else if(!shown) v = `<span class="masked mono">••••••••••</span>`;
    else if(secret) v = `<span class="mono">${colorize(l.v)}</span>`;
    else v = esc(l.v);
    const url = l.type === 'url' ? safeUrl(l.v) : '';
    const canCopy = l.key !== 'labels' && l.key !== 'rotate';
    return `<div class="nline"><span class="k">${esc(l.k)}:</span><span class="v ${secret && l.type !== 'totp' ? 'secret' : ''}" ${secret && l.type !== 'totp' ? `data-act="reveal" data-id="${a.id}" data-k="${l.key}" role="button" tabindex="0" aria-label="${shown ? 'Hide' : 'Show'} ${esc(l.k)}"` : ''}>${v}</span>
      <span class="acts">${url ? `<a class="icon-btn" data-act="noop" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open link">${ic('ext','s')}</a>` : ''}${canCopy ? `<button class="icon-btn" data-act="copy" data-id="${a.id}" data-k="${l.key}" aria-label="Copy ${esc(l.k)}">${ic('copy','s')}</button>` : ''}</span></div>`;
  }).join('');
  return `${topBar(a, 'classic')}<div class="paper">
    <p class="when">${a.trashedAt ? 'Deleted ' + fmtDT(a.trashedAt) : 'Stored ' + fmtDT(a.createdAt)}${a.updatedAt - a.createdAt > 60000 ? `<br>Edited ${fmtDT(a.updatedAt)}` : ''}</p>
    <h2>${esc(a.tool)}</h2>
    ${lines}
    ${classicFilesHTML(a)}
    ${a.notes ? `<div class="nline gap"></div><div class="nline"><span class="k">Notes:</span></div><div class="nline free">${esc(a.notes)}</div>` : ''}
    <div class="nline gap"></div>
    <p class="hint" style="line-height:32px;margin:0">Tap a hidden value to show it. Copied ${a.copies.length} time${a.copies.length === 1 ? '' : 's'}${a.lastCopiedAt ? ', last ' + ago(a.lastCopiedAt) : ''}. <button class="btn ghost small" data-act="view" data-v="modern" style="display:inline-flex">See full history</button></p>
  </div>`;
}

/* ---------- editors ---------- */
function startEdit(a, kind){
  S.draft = clone(a); S.orig = stable(S.draft); S.mode = 'edit'; S.selId = a.id; S.editKind = kind || (view() === 'classic' ? 'note' : 'form'); S.edPeek.clear();
  if(S.editKind === 'note') S.noteText = S.noteOrig = accountToText(S.draft, labelPath);
  renderApp(); const d = $('#detail'); if(d) d.scrollTop = 0;
}
function startNew(tplId, preset){
  const a = blankAccount();
  const tpl = TEMPLATES.find(t => t.id === tplId);
  if(tpl) for(const [type, label] of tpl.fields) a.fields.push({id:uid(), type, label, value:''});
  if(S.filter.startsWith('l:')) a.labels = [S.filter.slice(2)];
  if(preset) Object.assign(a, preset);
  a.createdAt = now();
  S.draft = a; S.orig = stable(a); S.mode = 'new'; S.selId = null; S.tab = 'vault'; S.edPeek.clear();
  S.editKind = tplId === 'note' ? 'note' : 'form';
  if(S.editKind === 'note') S.noteText = S.noteOrig = '';
  closeModal(); renderApp();
  const d = $('#detail'); if(d) d.scrollTop = 0;
  if(!matchMedia('(pointer:coarse)').matches) setTimeout(() => { const f = S.editKind === 'note' ? $('#ce') : $('#ed-tool'); if(f && !document.activeElement.matches('input,textarea,select')) f.focus(); }, 50);
}
const TEMPLATES = [
  {id:'login', name:'Website or app login', desc:'Website, username and password', icon:'key', fields:[]},
  {id:'email', name:'Email account', desc:'Address, password, recovery details', icon:'mail', fields:[['email','Recovery email'],['phone','Recovery phone'],['totp','2FA code']]},
  {id:'wallet', name:'Crypto wallet', desc:'Secret phrase, PIN and address', icon:'phrase', fields:[['phrase','Secret phrase'],['pin','PIN'],['text','Wallet address']]},
  {id:'bank', name:'Bank or card', desc:'Account number, PIN, card code', icon:'layers', fields:[['key','Account number'],['text','Routing number'],['pin','PIN'],['secret','Card security code'],['date','Card expires']]},
  {id:'api', name:'API or developer key', desc:'Keys, tokens and endpoints', icon:'key', fields:[['key','API key'],['secret','API secret'],['url','Endpoint']]},
  {id:'wifi', name:'Wi-Fi network', desc:'Network name and password', icon:'cloud', fields:[['text','Network name']]},
  {id:'license', name:'Software license', desc:'License key and purchase date', icon:'tag', fields:[['key','License key'],['date','Purchased']]},
  {id:'server', name:'Server or SSH', desc:'Host, port and keys', icon:'layers', fields:[['text','Host'],['text','Port'],['key','SSH private key']]}
];
function inp(path, value, {label, type = 'text', ph = '', secret = false, mono = false, id, area = false, list} = {}){
  const peek = S.edPeek.has(path);
  const cls = `input${secret && !peek ? ' sec-in' : ''}${mono || secret ? ' mono' : ''}`;
  const iid = id || 'ed-' + path.replace(/\./g, '-');
  const control = area ? `<textarea id="${iid}" class="${cls}" data-bind="${path}" placeholder="${esc(ph)}" spellcheck="${secret ? 'false' : 'true'}" autocapitalize="off" rows="3">${esc(value)}</textarea>`
    : `<input id="${iid}" class="${cls}" type="${type}" data-bind="${path}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false" autocapitalize="off" ${list ? `list="${list}"` : ''}>`;
  const tools = secret ? `<button type="button" class="icon-btn" data-act="ed-peek" data-p="${path}" aria-label="${peek ? 'Hide' : 'Show'} value">${ic(peek ? 'eyeoff' : 'eye')}</button>` : '';
  return `<div class="field">${label ? `<label for="${iid}">${esc(label)}</label>` : ''}${secret && !area ? `<div class="input-wrap">${control}${tools}</div>` : control}${secret && area ? `<div style="justify-self:end">${tools}</div>` : ''}</div>`;
}
function editorHTML(){
  const d = S.draft, isNew = S.mode === 'new';
  const fieldOpts = sel => Object.entries(FT).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.name}</option>`).join('');
  const toDate = t => { const x = new Date(t || now()); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const fields = d.fields.map((f, i) => `<div class="rowcard">
      <div class="rc-top"><input class="input" aria-label="Field name" data-bind="fields.${i}.label" value="${esc(f.label)}" placeholder="Field name"><select class="input" aria-label="Field type" data-bind="fields.${i}.type" data-rerender="1">${fieldOpts(f.type)}</select><button class="icon-btn" data-act="ed-rm" data-list="fields" data-i="${i}" aria-label="Remove ${esc(f.label || 'field')}">${ic('trash')}</button></div>
      ${inp(`fields.${i}.value`, f.value, {secret:isSecret(f.type) && f.type !== 'totp' ? true : f.type === 'totp', area:f.type === 'phrase' || f.type === 'note' || (f.type === 'key' && f.value.length > 60), type:f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text', ph:f.type === 'totp' ? 'Paste the setup key or otpauth:// link' : f.type === 'phrase' ? 'word1 word2 word3 …' : ''})}
      ${f.type === 'password' ? `<div style="display:flex;gap:8px"><button class="btn small" data-act="ed-gen" data-p="fields.${i}.value">${ic('dice','s')}Generate</button></div>` : ''}
    </div>`).join('');
  const add = (t, l) => `<button class="chip" data-act="ed-add" data-t="${t}">${ic('plus','s')}${l}</button>`;
  const labelChips = labelTree().map(({l}) => `<button class="chip" data-act="ed-label" data-id="${l.id}" aria-pressed="${d.labels.includes(l.id)}"><span class="dot" style="background:${l.color}"></span>${esc(labelPath(l.id))}</button>`).join('');
  return `<div class="d-top"><button class="btn small ghost" data-act="ed-cancel">Cancel</button><span class="sp"></span>
      <button class="btn small ghost" data-act="ed-kind" data-v="note" title="Edit everything as plain text">${ic('notes','s')}Edit as note</button>
      <button class="btn small primary" data-act="ed-save">${ic('check','s')}Save</button></div>
    <div class="ed">
      <h2 style="font-size:24px">${isNew ? 'New account' : 'Edit ' + esc(acct(d.id) ? acct(d.id).tool : '')}</h2>
      <div class="ed-sec"><h3>Basics</h3><div class="grid2">
        ${inp('tool', d.tool, {label:'Tool or service name', ph:'Netflix, AWS, Chase…', id:'ed-tool'})}
        ${inp('accountName', d.accountName, {label:'Account name', ph:'Family plan, Work, Joint checking…'})}
        <div class="field"><label for="ed-created">Date stored</label><input id="ed-created" class="input" type="date" data-bind="createdAt" data-date="1" value="${toDate(d.createdAt)}"></div>
      </div></div>
      <div class="ed-sec"><h3>Sign-in</h3><div class="grid2">
        ${inp('url', d.url, {label:'Website', ph:'example.com'})}
        ${inp('username', d.username, {label:'Username', ph:'Login name or ID'})}
        ${inp('email', d.email, {label:'Email', type:'email', ph:'you@example.com'})}
      </div>
        <div class="field"><label for="ed-password">Password</label><div class="input-row"><div class="input-wrap" style="flex:1">${`<input id="ed-password" class="input mono${S.edPeek.has('password') ? '' : ' sec-in'}" data-bind="password" value="${esc(d.password)}" autocomplete="off" spellcheck="false" autocapitalize="off">`}<button type="button" class="icon-btn" data-act="ed-peek" data-p="password" aria-label="${S.edPeek.has('password') ? 'Hide' : 'Show'} password">${ic(S.edPeek.has('password') ? 'eyeoff' : 'eye')}</button></div><button class="btn" data-act="ed-gen" data-p="password" title="Generate a strong password">${ic('dice','s')}<span>Generate</span></button></div>${meterHTML('ed-meter')}</div>
      </div>
      <div class="ed-sec"><h3>Keys, phrases and more</h3>${fields}
        <div class="addbar">${add('password','Password')}${add('pin','PIN')}${add('key','Key or token')}${add('phrase','Secret phrase')}${add('totp','2FA code')}${add('secret','Hidden text')}${add('text','Text')}${add('url','Link')}${add('email','Email')}${add('phone','Phone')}${add('date','Date')}${add('note','Note')}</div></div>
      <div class="ed-sec"><h3>Security questions <button class="btn small" data-act="ed-addrow" data-list="qa">${ic('plus','s')}Add question</button></h3>
        ${d.qa.map((q, i) => `<div class="rowcard"><div class="rc-top"><input class="input" aria-label="Question" data-bind="qa.${i}.q" value="${esc(q.q)}" placeholder="Question"><button class="icon-btn" data-act="ed-rm" data-list="qa" data-i="${i}" aria-label="Remove question">${ic('trash')}</button></div>${inp(`qa.${i}.a`, q.a, {secret:true, ph:'Answer'})}</div>`).join('') || '<p class="hint" style="margin:0">None yet.</p>'}</div>
      <div class="ed-sec"><h3>Admins <button class="btn small" data-act="ed-addrow" data-list="admins">${ic('plus','s')}Add admin</button></h3>
        ${d.admins.map((x, i) => `<div class="rowcard"><div class="rc-top"><input class="input" aria-label="Admin name" data-bind="admins.${i}.name" value="${esc(x.name)}" placeholder="Name"><button class="icon-btn" data-act="ed-rm" data-list="admins" data-i="${i}" aria-label="Remove admin">${ic('trash')}</button></div><div class="grid2"><input class="input" type="email" aria-label="Admin email" data-bind="admins.${i}.email" value="${esc(x.email)}" placeholder="Email"><input class="input" aria-label="Admin role" data-bind="admins.${i}.role" value="${esc(x.role)}" placeholder="Role, e.g. Owner, Billing"></div></div>`).join('') || '<p class="hint" style="margin:0">Add the people who manage this account and their emails.</p>'}</div>
      <div class="ed-sec"><h3>Labels</h3><div class="labelpick">${labelChips || '<span class="hint">No labels yet.</span>'}</div>
        <div class="input-row"><input id="ed-newlabel" class="input" placeholder="New label, e.g. Work or Work/Cloud" aria-label="New label name"><button class="btn" data-act="ed-newlabel">${ic('plus','s')}Add</button></div>
        <p class="hint" style="margin:0">Use a slash to make a sub-label: <span class="mono">Finance/Banks</span>.</p></div>
      <div class="ed-sec"><h3>Notes</h3>${inp('notes', d.notes, {area:true, ph:'Anything else worth remembering'})}</div>
      <div class="ed-sec"><h3>Reminder</h3><div class="field"><label for="ed-rot">Remind me to change the password</label><select id="ed-rot" class="input" data-bind="rotateDays" data-num="1">${[[0,'Use my default'],[30,'Every 30 days'],[60,'Every 60 days'],[90,'Every 90 days'],[180,'Every 6 months'],[365,'Every year']].map(([v, l]) => `<option value="${v}" ${+d.rotateDays === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      ${!isNew ? `<div class="ed-sec"><button class="btn danger" data-act="trash" data-id="${d.id}" style="justify-self:start">${ic('trash','s')}Delete account</button></div>` : ''}
    </div>
    <div class="ed-foot"><button class="btn" data-act="ed-cancel">Cancel</button><button class="btn primary" data-act="ed-save">${ic('check','s')}Save</button></div>`;
}
function classicEditorHTML(){
  const isNew = S.mode === 'new';
  return `<div class="d-top"><button class="btn small ghost" data-act="ed-cancel">Cancel</button><span class="sp"></span>
      <button class="btn small ghost" data-act="ed-insertpw" title="Add a Password line with a new strong password">${ic('dice','s')}Insert password</button>
      <button class="btn small ghost" data-act="ed-kind" data-v="form">${ic('cards','s')}Edit as form</button>
      <button class="btn small primary" data-act="ed-save">${ic('check','s')}Save</button></div>
    <div class="paper"><p class="when">${isNew ? 'New note' : 'Editing note'}</p>
      <label class="sr" for="ce">Note text</label>
      <textarea id="ce" class="classic-edit" spellcheck="false" autocapitalize="sentences" placeholder="Netflix&#10;Account: Family plan&#10;Username: you@example.com&#10;Password: …&#10;PIN: 1234&#10;Labels: Streaming&#10;&#10;Notes:&#10;Anything else">${esc(S.noteText || '')}</textarea>
      <div class="cheat">The first line is the name. Write each detail on its own line as <code>Label: value</code>. Vaultleaf knows <code>Account</code> <code>Website</code> <code>Username</code> <code>Email</code> <code>Password</code> <code>Q</code> and <code>A</code> <code>Admin</code> <code>Labels</code> <code>Change every</code> and <code>Notes</code>. Any other label becomes its own field, and ones like PIN, API key, 2FA or Secret phrase are hidden automatically. Everything after <code>Notes:</code> is kept as written.</div>
    </div>`;
}
function afterEditorRender(){
  if(S.editKind === 'form'){ updateMeter('ed-meter', S.draft.password); }
  else { const ta = $('#ce'); if(ta){ ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, window.innerHeight * 0.55) + 'px'; } }
}
function rerenderEditor(){ const d = $('#detail'); const st = d ? d.scrollTop : 0; renderDetail(); if(d) d.scrollTop = st; }
function setPath(obj, path, val){ const ks = path.split('.'); let o = obj; for(let i = 0; i < ks.length - 1; i++) o = o[/^\d+$/.test(ks[i]) ? +ks[i] : ks[i]]; o[ks[ks.length - 1]] = val; }
function getPath(obj, path){ return path.split('.').reduce((o, k) => o == null ? o : o[/^\d+$/.test(k) ? +k : k], obj); }
function draftFromEditor(){
  if(S.editKind === 'note'){ const ta = $('#ce'); const text = ta ? ta.value : S.noteText; S.noteText = text; return textToAccount(text, S.draft); }
  return S.draft;
}
function saveEditor(){
  const isNew = S.mode === 'new';
  const d = draftFromEditor();
  if(S.editKind === 'note' && !String(S.noteText).trim()){ toast('Write at least a name on the first line', 'warn'); return; }
  const a = commitAccount(d, isNew);
  if(!a) return;
  S.mode = 'view'; S.draft = null; S.selId = a.id; S.edPeek.clear();
  if(a.trashedAt) S.filter = 'trash';
  renderApp();
  toast(isNew ? 'Saved ' + a.tool : 'Saved changes');
}
function cancelEditor(){
  const leave = () => { const wasNew = S.mode === 'new'; S.mode = 'view'; S.draft = null; S.edPeek.clear(); if(wasNew) S.selId = null; renderApp(); };
  const cur = S.editKind === 'note' ? ($('#ce') ? $('#ce').value : S.noteText) : null;
  const dirty = S.editKind === 'note' ? cur !== S.noteOrig : stable(S.draft) !== S.orig;
  if(!dirty) return leave();
  confirmBox({title:'Discard changes?', text:'Your edits to this account will be lost.', ok:'Discard', danger:true, onOk:leave});
}
