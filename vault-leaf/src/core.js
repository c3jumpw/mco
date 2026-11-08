'use strict';
/* ================= Vaultleaf core: crypto, storage, sync, model ================= */
const APP = 'vaultleaf', VER = 1;
const WEB = /*__WEB__*/false;
const GUIDE_URL = WEB ? '/guide/' : 'https://mco-vault-leaf.vercel.app/guide/';
const KDF_ITER = 600000, RK_ITER = 150000;
const K = {header:'vaultleaf.header', body:'vaultleaf.body', guard:'vaultleaf.guard', device:'vaultleaf.device', ui:'vaultleaf.ui'};
const EFF = '__EFF_WORDS__'.split(' ');
const COLORS = ['#1D5B44','#2F5D8A','#7A4A8C','#9C4434','#7A6A12','#2D6E73','#5A5F6B','#A0561C'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const now = () => Date.now();
const DAY = 864e5;

/* ---------- local storage ---------- */
const LS = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
  ok(){ try{ localStorage.setItem('__vl', '1'); localStorage.removeItem('__vl'); return true; }catch(e){ return false; } }
};

/* ---------- encoding ---------- */
const te = new TextEncoder(), td = new TextDecoder();
const rand = n => crypto.getRandomValues(new Uint8Array(n));
function b64e(u8){ let s = ''; for(let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64d(s){ const bin = atob(s); const u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(u8){ let bits = 0, val = 0, out = ''; for(const b of u8){ val = ((val << 8) | b) & 0xFFFF; bits += 8; while(bits >= 5){ out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if(bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function b32dec(s){ s = String(s).toUpperCase().replace(/=+$/,'').replace(/[^A-Z2-7]/g, ''); let bits = 0, val = 0; const out = []; for(const c of s){ val = ((val << 5) | B32.indexOf(c)) & 0xFFFF; bits += 5; if(bits >= 8){ out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
const uid = () => b32enc(rand(10)).toLowerCase();
const DEVICE = (() => { let d = LS.get(K.device); if(!d){ d = 'd' + uid(); LS.set(K.device, d); } return d; })();

/* ---------- crypto ---------- */
const norm = s => String(s || '').normalize('NFKC');
const credStr = (pw, pc) => norm(pw) + '\u0000' + String(pc);
async function kdf(secret, salt, iter){
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function seal(key, bytes, ad){
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:te.encode(ad)}, key, bytes);
  return {iv:b64e(iv), ct:b64e(new Uint8Array(ct))};
}
async function unseal(key, box, ad){
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(box.iv), additionalData:te.encode(ad)}, key, b64d(box.ct));
  return new Uint8Array(pt);
}
function newRecoveryKey(){ return b32enc(rand(20)).match(/.{4}/g).join('-'); }
function normRK(s){ return String(s || '').toUpperCase().replace(/0/g,'O').replace(/1/g,'I').replace(/8/g,'B').replace(/[^A-Z2-7]/g, ''); }
async function wrapCreds(pw, pc, dekRaw){
  const salt = rand(16);
  const kek = await kdf(credStr(pw, pc), salt, KDF_ITER);
  return {pcLen:String(pc).length, kdf:{alg:'PBKDF2-SHA256', iter:KDF_ITER, salt:b64e(salt)}, wrap:await seal(kek, dekRaw, 'vl-wrap'), credAt:now()};
}
async function wrapRecovery(rk, dekRaw){
  const salt = rand(16);
  const kek = await kdf(normRK(rk), salt, RK_ITER);
  return {rkdf:{iter:RK_ITER, salt:b64e(salt)}, rwrap:await seal(kek, dekRaw, 'vl-rwrap'), rkAt:now()};
}
async function makeHeader(pw, pc, dekRaw, rk){
  const a = await wrapCreds(pw, pc, dekRaw);
  const b = await wrapRecovery(rk, dekRaw);
  return {app:APP, v:VER, ...a, ...b, createdAt:now(), hdrAt:now()};
}
async function unwrapCreds(h, pw, pc){
  const kek = await kdf(credStr(pw, pc), b64d(h.kdf.salt), h.kdf.iter);
  return unseal(kek, h.wrap, 'vl-wrap');
}
async function unwrapRecovery(h, rk){
  const kek = await kdf(normRK(rk), b64d(h.rkdf.salt), h.rkdf.iter);
  return unseal(kek, h.rwrap, 'vl-rwrap');
}
const dekKey = raw => crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
const canGz = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function gz(u8, compress){
  const cs = compress ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer());
}
async function sealVault(key, vault){
  let bytes = te.encode(JSON.stringify(vault)), z = false;
  if(canGz){ try{ bytes = await gz(bytes, true); z = true; }catch(e){} }
  const box = await seal(key, bytes, 'vl-body');
  return {...box, z, at:vault.updatedAt, rev:'r' + now().toString(36) + b32enc(rand(4)).toLowerCase()};
}
async function openVault(key, body){
  let bytes = await unseal(key, body, 'vl-body');
  if(body.z) bytes = await gz(bytes, false);
  return JSON.parse(td.decode(bytes));
}

/* ---------- failed-attempt guard ---------- */
const guard = {
  get(){ return LS.get(K.guard) || {fails:0, until:0}; },
  fail(){ const g = this.get(); g.fails++; if(g.fails >= 5) g.until = now() + Math.min(900, 30 * 2 ** (g.fails - 5)) * 1000; LS.set(K.guard, g); return g; },
  reset(){ LS.del(K.guard); },
  wait(){ return Math.max(0, Math.ceil((this.get().until - now()) / 1000)); }
};

/* ---------- cloud sync (encrypted blobs only, in the viewer's private space) ---------- */
const Cloud = {
  ready:false, db:null, uid:null, status:'off', lastAt:0, err:'', pushing:false, again:false, unsub:null, lastRev:null, lastHdr:'',
  async init(){
    try{
      if(!(window.claude && typeof window.claude.use === 'function')) return false;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if(!db || !user || typeof user.id !== 'function') return false;
      const id = await user.id();
      if(!id) return false;
      this.db = db; this.uid = String(id); this.ready = true;
      return true;
    }catch(e){ return false; }
  },
  ref(id){ return this.db.collection('data/users/' + this.uid).doc(id); },
  async retry(fn){ try{ return await fn(); }catch(e){ if(e && e.code === 'unavailable'){ await sleep(400 + Math.random() * 700); return fn(); } throw e; } },
  async getHeader(){ const s = await this.retry(() => this.ref('vl-header').get()); return s.exists ? clone(s.data()) : null; },
  async getMeta(){ const s = await this.retry(() => this.ref('vl-meta').get()); return s.exists ? clone(s.data()) : null; },
  async getBody(meta){
    meta = meta || await this.getMeta();
    if(!meta || meta.off) return null;
    const parts = [];
    for(let i = 0; i < meta.n; i++){
      const s = await this.retry(() => this.ref(`vl-b-${meta.rev}-${i}`).get());
      if(!s.exists) throw new Error('The synced copy is still uploading. Try again in a moment.');
      parts.push(s.data().d);
    }
    return {iv:meta.iv, ct:parts.join(''), z:meta.z, at:meta.at, rev:meta.rev, dev:meta.dev};
  },
  async putHeader(h){
    const str = JSON.stringify(h);
    if(str === this.lastHdr) return;
    await this.retry(() => this.ref('vl-header').set(clone(h)));
    this.lastHdr = str;
  },
  async putBody(body){
    const prev = await this.getMeta().catch(() => null);
    if(prev && prev.rev === body.rev) return;
    if(prev && prev.off) prev.n = 0;
    const CH = 180000, n = Math.max(1, Math.ceil(body.ct.length / CH));
    for(let i = 0; i < n; i++){ const d = body.ct.slice(i * CH, (i + 1) * CH); await this.retry(() => this.ref(`vl-b-${body.rev}-${i}`).set({d})); }
    await this.retry(() => this.ref('vl-meta').set({rev:body.rev, n, iv:body.iv, z:body.z, at:body.at, dev:DEVICE}));
    this.lastRev = body.rev;
    if(prev && prev.rev && prev.rev !== body.rev){ for(let i = 0; i < prev.n; i++){ try{ await this.ref(`vl-b-${prev.rev}-${i}`).delete(); }catch(e){} } }
  },
  async wipe(){
    const m = await this.getMeta().catch(() => null);
    if(m) for(let i = 0; i < m.n; i++){ try{ await this.ref(`vl-b-${m.rev}-${i}`).delete(); }catch(e){} }
    try{ await this.ref('vl-header').delete(); }catch(e){}
    try{ await this.ref('vl-meta').set({off:true, at:now(), dev:DEVICE}); }catch(e){}
    this.lastHdr = ''; this.lastRev = null;
  }
};

/* ---------- field types ---------- */
const FT = {
  password:{name:'Password', secret:true, mono:true},
  pin:{name:'PIN', secret:true, mono:true},
  key:{name:'Key or token', secret:true, mono:true},
  phrase:{name:'Secret phrase', secret:true, mono:true},
  totp:{name:'2FA code', secret:true, mono:true},
  secret:{name:'Hidden text', secret:true},
  text:{name:'Text'},
  url:{name:'Link'},
  email:{name:'Email'},
  phone:{name:'Phone'},
  date:{name:'Date'},
  note:{name:'Note'}
};
const ftype = t => FT[t] || FT.text;

/* ---------- vault model ---------- */
function newVault(profile){
  const t = now();
  return {v:1, profile:{name:profile.name || '', email:profile.email || '', updatedAt:t},
    settings:{view:'modern', theme:'auto', autoLockMin:5, lockOnHide:true, revealSec:30, clipSec:30, sync:true, rotateDays:0, sort:'updated', updatedAt:t},
    labels:[], accounts:[], tombstones:[], nextNo:1, createdAt:t, updatedAt:t, meta:{lastBackupAt:0}};
}
function upgradeVault(v){
  const d = newVault({});
  v.settings = {...d.settings, ...(v.settings || {})};
  v.profile = {...d.profile, ...(v.profile || {})};
  v.meta = {...d.meta, ...(v.meta || {})};
  v.labels = v.labels || []; v.accounts = v.accounts || []; v.tombstones = v.tombstones || [];
  v.nextNo = v.nextNo || (v.accounts.reduce((m, a) => Math.max(m, a.no || 0), 0) + 1);
  for(const a of v.accounts){ const b = blankAccount(); for(const k in b) if(a[k] === undefined) a[k] = b[k]; }
  return v;
}
function blankAccount(){
  return {id:uid(), no:0, tool:'', accountName:'', url:'', username:'', email:'', password:'', fields:[], qa:[], admins:[], labels:[], fav:false, notes:'', rotateDays:0,
    createdAt:0, updatedAt:0, pwChangedAt:0, history:[], secrets:[], copies:[], lastCopiedAt:0, trashedAt:0, example:false, order:[]};
}
const byId = (p, q) => p.id < q.id ? -1 : p.id > q.id ? 1 : 0;
function unionById(a = [], b = [], cap = 100){ const m = new Map(); for(const e of [...a, ...b]) if(e && e.id) m.set(e.id, e); return [...m.values()].sort((p, q) => q.at - p.at || byId(p, q)).slice(0, cap); }
function mergeAccount(x, y){
  const base = (y.updatedAt || 0) > (x.updatedAt || 0) ? y : x, other = base === x ? y : x;
  return {...base, copies:unionById(base.copies, other.copies, 100), history:unionById(base.history, other.history, 200), secrets:unionById(base.secrets, other.secrets, 60),
    lastCopiedAt:Math.max(base.lastCopiedAt || 0, other.lastCopiedAt || 0)};
}
function restoreMerge(cur, bak){
  /* Bring back anything in the backup, even if it was deleted here since; keep this device's settings. */
  const ids = new Set([...(bak.accounts || []), ...(bak.labels || [])].map(x => x.id));
  const fresh = {...bak, tombstones:[], settings:{...(bak.settings || {}), updatedAt:-1}, profile:{...(bak.profile || {}), updatedAt:-1}};
  const a = {...cur, tombstones:(cur.tombstones || []).filter(x => !ids.has(x.id))};
  return mergeVaults(a, fresh);
}
function mergeVaults(a, b){
  const tomb = new Map();
  for(const t of [...(a.tombstones || []), ...(b.tombstones || [])]) if(!tomb.has(t.id) || tomb.get(t.id).at < t.at) tomb.set(t.id, t);
  const acc = new Map();
  for(const x of [...(a.accounts || []), ...(b.accounts || [])]){ const y = acc.get(x.id); acc.set(x.id, y ? mergeAccount(y, x) : x); }
  const lab = new Map();
  for(const l of [...(a.labels || []), ...(b.labels || [])]){ const y = lab.get(l.id); if(!y || (l.updatedAt || 0) > (y.updatedAt || 0)) lab.set(l.id, l); }
  const alive = x => !(tomb.has(x.id) && tomb.get(x.id).at >= (x.updatedAt || 0));
  const sNew = (a.settings.updatedAt || 0) >= (b.settings.updatedAt || 0) ? a.settings : b.settings;
  const pNew = (a.profile.updatedAt || 0) >= (b.profile.updatedAt || 0) ? a.profile : b.profile;
  const cutoff = now() - 180 * DAY;
  return {...a, settings:{...sNew}, profile:{...pNew},
    accounts:[...acc.values()].filter(alive).sort(byId), labels:[...lab.values()].filter(alive).sort(byId),
    tombstones:[...tomb.values()].filter(t => t.at > cutoff).sort(byId),
    nextNo:Math.max(a.nextNo || 1, b.nextNo || 1), updatedAt:Math.max(a.updatedAt || 0, b.updatedAt || 0),
    meta:{lastBackupAt:Math.max(a.meta?.lastBackupAt || 0, b.meta?.lastBackupAt || 0)}};
}
function stable(o){ return JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((r, kk) => (r[kk] = v[kk], r), {}) : v); }

/* ---------- classic notes text <-> account ---------- */
const CORE_KEYS = [['accountName','Account'],['url','Website'],['username','Username'],['email','Email'],['password','Password']];
function adminStr(ad){ let s = ad.name || ''; if(ad.email) s += (s ? ' ' : '') + '<' + ad.email + '>'; if(ad.role) s += ' (' + ad.role + ')'; return s.trim(); }
function parseAdmin(v){
  const m = String(v).match(/^(.*?)\s*(?:<([^>]*)>)?\s*(?:\(([^)]*)\))?\s*$/);
  let name = (m && m[1] || '').trim(), email = (m && m[2] || '').trim(); const role = (m && m[3] || '').trim();
  if(!email){ const em = name.match(/[^\s<>()]+@[^\s<>()]+\.[^\s<>()]+/); if(em){ email = em[0]; name = name.replace(em[0], '').trim(); } }
  return {id:uid(), name, email, role};
}
function guessType(label){
  const s = String(label).toLowerCase();
  if(/2fa|totp|\botp\b|authenticator|\bmfa\b/.test(s)) return 'totp';
  if(/seed|mnemonic|recovery phrase|secret phrase|passphrase|phrase/.test(s)) return 'phrase';
  if(/\bpin\b|passcode/.test(s)) return 'pin';
  if(/\bapi\b|\bkey\b|token|licen[cs]e|serial|\bssh\b/.test(s)) return 'key';
  if(/password|\bpass\b|\bpwd\b/.test(s)) return 'password';
  if(/secret|\bcvv\b|\bcvc\b|security code|recovery code|backup code|answer/.test(s)) return 'secret';
  if(/\burl\b|website|\blink\b|\bsite\b/.test(s)) return 'url';
  if(/e-?mail/.test(s)) return 'email';
  if(/phone|mobile|\btel\b/.test(s)) return 'phone';
  if(/\bdate\b|expir|renew|birthday|\bdob\b/.test(s)) return 'date';
  return 'text';
}
const KEYMAP = [
  [/^(tool|tool name|service|app|name|title)$/i, 'tool'],
  [/^(account|account name|acct)$/i, 'accountName'],
  [/^(website|url|site|web|login url|web address)$/i, 'url'],
  [/^(username|user name|user|login|user id|userid|login id)$/i, 'username'],
  [/^(email|e-mail|mail|email address)$/i, 'email'],
  [/^(password|pass|pw|pwd|passwd)$/i, 'password'],
  [/^(q|question|security question|sq)\s*\d*$/i, 'q'],
  [/^(a|answer|ans)\s*\d*$/i, 'a'],
  [/^(admin|admins|administrator|admin user|admin users|admin email|admin emails|owner)$/i, 'admin'],
  [/^(labels?|tags?|folder|groups?|category)$/i, 'labels'],
  [/^(notes?|comments?|memo)$/i, 'notes'],
  [/^(change every|rotate every|rotate|reminder)$/i, 'rotate']
];
const mapKey = k => { for(const [re, p] of KEYMAP) if(re.test(k.trim())) return p; return null; };
function matchKV(line){
  const m = line.match(/^\s?([^:\n]{1,40}?)\s*:\s?(.*)$/);
  if(!m) return null;
  const ci = line.indexOf(':');
  if(/\d/.test(line[ci - 1] || '') && /\d/.test(line[ci + 1] || '')) return null; /* a time like 10:30 */
  const k = m[1].trim();
  if(!/[a-z]/i.test(k) || /^(https?|ftp|otpauth|mailto)$/i.test(k) || k.split(/\s+/).length > 4) return null;
  return {k, v:m[2].trim()};
}
const looksUrl = s => /^(https?:\/\/|www\.)\S+$/i.test(s.trim()) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s.trim());
const looksEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function accountLines(a, labelPathFn){
  const L = [];
  for(const [p, lab] of CORE_KEYS) if(a[p]) L.push({k:lab, v:a[p], key:p, secret:p === 'password', type:p === 'password' ? 'password' : p === 'url' ? 'url' : p === 'email' ? 'email' : 'text'});
  for(const f of a.fields) if(f.value || f.label) L.push({k:f.label || ftype(f.type).name, v:f.value || '', key:'f:' + f.id, secret:!!ftype(f.type).secret, type:f.type});
  for(const q of a.qa){ L.push({k:'Q', v:q.q || '', key:'q:' + q.id, type:'text'}); L.push({k:'A', v:q.a || '', key:'a:' + q.id, secret:true, type:'secret'}); }
  for(const ad of a.admins) L.push({k:'Admin', v:adminStr(ad), key:'ad:' + ad.id, type:'text'});
  if(a.labels.length && labelPathFn) L.push({k:'Labels', v:a.labels.map(labelPathFn).filter(Boolean).join(', '), key:'labels', type:'text'});
  if(a.rotateDays) L.push({k:'Change every', v:a.rotateDays + ' days', key:'rotate', type:'text'});
  const ord = a.order || [];
  if(ord.length){
    const pos = (l, i) => { let k = l.key, add = 0; if(k.startsWith('a:')){ k = 'q:' + k.slice(2); add = 0.5; } const j = ord.indexOf(k); return j < 0 ? 1000 + i : j + add; };
    return L.map((l, i) => [pos(l, i), i, l]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(x => x[2]);
  }
  return L;
}
function accountToText(a, labelPathFn){
  const out = [a.tool || 'Untitled'];
  for(const l of accountLines(a, labelPathFn)){ const parts = String(l.v).split('\n'); out.push(l.k + ': ' + parts[0]); for(const p of parts.slice(1)) out.push('  ' + p); }
  if(a.notes){ out.push(''); out.push('Notes:'); out.push(a.notes); }
  return out.join('\n');
}
function textToAccount(text, base){
  const a = base ? clone(base) : blankAccount();
  const oldFields = base ? base.fields : [];
  Object.assign(a, {tool:'', accountName:'', url:'', username:'', email:'', password:'', notes:'', rotateDays:0, fields:[], qa:[], admins:[]});
  let labelPaths = null;
  const order = []; const mark = k => { if(!order.includes(k)) order.push(k); };
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let i = 0; while(i < lines.length && !lines[i].trim()) i++;
  const notes = []; let inNotes = false, last = null, pendingQ = null;
  if(i < lines.length){
    const kv = matchKV(lines[i]);
    if(!kv){ a.tool = lines[i].trim(); i++; }
    else if(mapKey(kv.k) === 'tool'){ a.tool = kv.v; i++; }
  }
  const usedIds = new Set();
  const addField = (k, v) => {
    const prev = oldFields.find(f => !usedIds.has(f.id) && (f.label || '').toLowerCase() === k.toLowerCase());
    const f = {id:prev ? prev.id : uid(), type:prev ? prev.type : guessType(k), label:k, value:v};
    usedIds.add(f.id); a.fields.push(f); last = {o:f, p:'value'}; mark('f:' + f.id);
  };
  for(; i < lines.length; i++){
    const line = lines[i];
    if(inNotes){ notes.push(line); continue; }
    if(!line.trim()){ last = null; continue; }
    if(/^\s{2,}\S/.test(line) && last){ last.o[last.p] = (last.o[last.p] ? last.o[last.p] + '\n' : '') + line.trim(); continue; }
    const kv = matchKV(line);
    if(kv){
      const p = mapKey(kv.k);
      if(p === 'tool' && !a.tool){ a.tool = kv.v; last = {o:a, p:'tool'}; }
      else if(['accountName','url','username','email','password'].includes(p)){
        if(!a[p]){ a[p] = kv.v; last = {o:a, p}; mark(p); } else addField(kv.k, kv.v);
      }
      else if(p === 'q'){ pendingQ = {id:uid(), q:kv.v, a:''}; a.qa.push(pendingQ); last = {o:pendingQ, p:'q'}; mark('q:' + pendingQ.id); }
      else if(p === 'a'){ if(pendingQ && !pendingQ.a){ pendingQ.a = kv.v; last = {o:pendingQ, p:'a'}; } else { const q = {id:uid(), q:'', a:kv.v}; a.qa.push(q); last = {o:q, p:'a'}; mark('q:' + q.id); } pendingQ = null; }
      else if(p === 'admin'){ for(const part of kv.v.split(/[;,](?![^<]*>)/)) if(part.trim()){ const ad = parseAdmin(part); a.admins.push(ad); mark('ad:' + ad.id); } last = null; }
      else if(p === 'labels'){ labelPaths = (labelPaths || []).concat(kv.v.split(/[,;]/).map(s => s.trim()).filter(Boolean)); last = null; mark('labels'); }
      else if(p === 'notes'){ inNotes = true; if(kv.v) notes.push(kv.v); }
      else if(p === 'rotate'){ a.rotateDays = parseInt(kv.v, 10) || 0; last = null; mark('rotate'); }
      else addField(kv.k, kv.v);
      continue;
    }
    const t = line.trim();
    if(!a.url && looksUrl(t) && !/\s/.test(t)){ a.url = t; last = null; mark('url'); continue; }
    if(!a.email && looksEmail(t)){ a.email = t; last = null; mark('email'); continue; }
    notes.push(line); last = null;
  }
  while(notes.length && !notes[0].trim()) notes.shift();
  while(notes.length && !notes[notes.length - 1].trim()) notes.pop();
  a.notes = notes.join('\n');
  if(!a.tool) a.tool = 'Untitled';
  a.order = order;
  a._labelPaths = labelPaths;
  return a;
}
function splitNotes(text, mode){
  const t = String(text).replace(/\r\n?/g, '\n').trim();
  if(!t) return [];
  if(mode === 'dash') return t.split(/\n\s*(?:-{3,}|={3,}|_{3,})\s*\n/).map(s => s.trim()).filter(Boolean);
  return t.split(/\n\s*\n\s*\n+/).map(s => s.trim()).filter(Boolean);
}

/* ---------- CSV ---------- */
function parseCSV(text){
  const rows = []; let row = [], f = '', q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
    else if(c === '"') q = true;
    else if(c === ','){ row.push(f); f = ''; }
    else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if(f !== '' || row.length){ row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const CSV_MAP = {
  tool:['name','title','service'], url:['url','login_uri','website','uri','web site','login url'], username:['username','login_username','user','login','user name'],
  password:['password','login_password','pass'], totp:['totp','login_totp','otpauth','otp','2fa'], notes:['notes','note','extra','comments'], email:['email','e-mail'],
  labels:['folder','grouping','tags','label','labels','category'], fav:['favorite','fav'], accountName:['account','account name']
};
function csvToAccounts(text){
  const rows = parseCSV(text);
  if(rows.length < 2) return {items:[], error:'Add a header row and at least one account row.'};
  const head = rows[0].map(h => String(h).trim().toLowerCase());
  const col = {}; for(const [k, names] of Object.entries(CSV_MAP)){ const i = head.findIndex(h => names.includes(h)); if(i >= 0) col[k] = i; }
  if(col.password === undefined && col.username === undefined) return {items:[], error:'No username or password column found. Check that the first row has column names.'};
  const items = [];
  for(const r of rows.slice(1)){
    const g = k => col[k] !== undefined ? String(r[col[k]] ?? '').trim() : '';
    const a = blankAccount();
    a.tool = g('tool'); a.url = g('url'); a.username = g('username'); a.password = String(col.password !== undefined ? r[col.password] ?? '' : ''); a.notes = g('notes'); a.email = g('email'); a.accountName = g('accountName');
    if(!a.email && looksEmail(a.username)) { /* keep as username */ }
    if(!a.tool){ try{ a.tool = new URL(/^https?:/i.test(a.url) ? a.url : 'https://' + a.url).hostname.replace(/^www\./, ''); }catch(e){ a.tool = a.username || 'Imported'; } }
    const totp = g('totp'); if(totp) a.fields.push({id:uid(), type:'totp', label:'2FA code', value:totp});
    const lab = g('labels'); a._labelPaths = lab ? lab.split(/[;,]/).map(s => s.replace(/\\/g, '/').trim()).filter(Boolean) : null;
    a.fav = /^(1|true|yes|y)$/i.test(g('fav'));
    if(a.tool || a.username || a.password) items.push(a);
  }
  return {items};
}

/* ---------- strength ---------- */
const COMMON = new Set('123456 123456789 12345678 password qwerty 12345 1234567 111111 123123 abc123 password1 1234567890 000000 iloveyou 1234 1q2w3e4r qwerty123 dragon monkey letmein football baseball welcome admin princess sunshine master shadow superman trustno1 passw0rd starwars hello whatever qazwsx michael 654321 jesus 696969 ninja mustang charlie access login 123qwe zaq12wsx flower hunter2 batman freedom solo'.split(' '));
function strength(pw){
  pw = String(pw || '');
  if(!pw) return {score:-1, bits:0, label:'None'};
  let pool = 0;
  if(/[a-z]/.test(pw)) pool += 26; if(/[A-Z]/.test(pw)) pool += 26; if(/\d/.test(pw)) pool += 10; if(/[^a-zA-Z0-9]/.test(pw)) pool += 33; if(/[^\x00-\x7f]/.test(pw)) pool += 60;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  const low = pw.toLowerCase();
  const stripped = low.replace(/[^a-z]/g, '');
  if(COMMON.has(low) || COMMON.has(stripped) || COMMON.has(low.replace(/\d+$/, ''))) bits = Math.min(bits, 12);
  if(/(.)\1{2,}/.test(pw)) bits *= 0.8;
  if(/(abc|bcd|cde|123|234|345|456|567|678|789|qwe|wer|asd|zxc)/i.test(pw)) bits *= 0.85;
  if(/(19|20)\d\d/.test(pw) && pw.length < 14) bits *= 0.85;
  if(/^[a-z]+\d{1,4}$/i.test(pw) && pw.length < 14) bits *= 0.75;
  bits = Math.round(bits);
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return {score, bits, label:['Very weak','Weak','Fair','Strong','Very strong'][score]};
}
function crackTime(bits){
  const sec = Math.pow(2, bits) / 2 / 1e10;
  if(sec < 1) return 'instantly'; if(sec < 3600) return 'in minutes'; if(sec < 86400) return 'in hours'; if(sec < 86400 * 365) return 'in days to months';
  const yrs = sec / (86400 * 365);
  if(yrs < 1000) return 'in years'; if(yrs < 1e6) return 'in thousands of years'; return 'in more than a million years';
}

/* ---------- generator ---------- */
function randInt(n){ const lim = Math.floor(0x100000000 / n) * n; const buf = new Uint32Array(1); let x; do{ crypto.getRandomValues(buf); x = buf[0]; }while(x >= lim); return x % n; }
const SETS = {lower:'abcdefghijkmnopqrstuvwxyz', lowerA:'abcdefghijklmnopqrstuvwxyz', upper:'ABCDEFGHJKLMNPQRSTUVWXYZ', upperA:'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits:'23456789', digitsA:'0123456789', symbols:'!@#$%^&*-_=+?~.:', symbolsA:'!@#$%^&*()-_=+[]{};:,.<>/?~|'};
function genPassword(o){
  const pick = k => o.ambig ? SETS[k] : SETS[k + 'A'];
  const sets = ['lower','upper','digits','symbols'].filter(k => o[k]).map(pick);
  if(!sets.length) sets.push(pick('lower'));
  const all = sets.join('');
  const len = Math.max(o.len, sets.length);
  const out = sets.map(s => s[randInt(s.length)]);
  while(out.length < len) out.push(all[randInt(all.length)]);
  for(let i = out.length - 1; i > 0; i--){ const j = randInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return {value:out.join(''), bits:Math.round(len * Math.log2(all.length))};
}
function genPassphrase(o){
  const w = []; for(let i = 0; i < o.words; i++){ let x = EFF[randInt(EFF.length)]; if(o.cap) x = x[0].toUpperCase() + x.slice(1); w.push(x); }
  let bits = o.words * Math.log2(EFF.length);
  if(o.num){ const pos = randInt(w.length); w[pos] = w[pos] + randInt(10); bits += Math.log2(10) + Math.log2(o.words); }
  return {value:w.join(o.sep), bits:Math.round(bits)};
}

/* ---------- TOTP (RFC 6238) ---------- */
const totpKeys = new Map();
function totpCfg(v){
  v = String(v || '').trim();
  let secret = v, digits = 6, period = 30, algo = 'SHA-1', issuer = '';
  if(/^otpauth:/i.test(v)){
    try{ const u = new URL(v), p = u.searchParams; secret = p.get('secret') || ''; digits = parseInt(p.get('digits'), 10) || 6; period = parseInt(p.get('period'), 10) || 30;
      const al = (p.get('algorithm') || 'SHA1').toUpperCase(); algo = al === 'SHA256' ? 'SHA-256' : al === 'SHA512' ? 'SHA-512' : 'SHA-1'; issuer = p.get('issuer') || ''; }catch(e){}
  }
  secret = secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
  return {secret, digits, period, algo, issuer, valid:/^[A-Z2-7]{8,}$/.test(secret)};
}
async function totpCode(cfg, t = now()){
  const ck = cfg.secret + '|' + cfg.algo;
  let key = totpKeys.get(ck);
  if(!key){ key = await crypto.subtle.importKey('raw', b32dec(cfg.secret), {name:'HMAC', hash:{name:cfg.algo}}, false, ['sign']); totpKeys.set(ck, key); }
  const ctr = Math.floor(t / 1000 / cfg.period);
  const buf = new ArrayBuffer(8), dv = new DataView(buf);
  dv.setUint32(0, Math.floor(ctr / 0x100000000)); dv.setUint32(4, ctr >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** cfg.digits).padStart(cfg.digits, '0');
}

/* ---------- formatting ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = t => t ? new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : '—';
const fmtDT = t => t ? new Date(t).toLocaleString(undefined, {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'}) : '—';
const fmtTime = t => new Date(t).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
function ago(t){
  if(!t) return 'never';
  const s = (now() - t) / 1000;
  if(s < 45) return 'just now';
  const m = s / 60; if(m < 60) return Math.round(m) + ' min ago';
  const h = m / 60; if(h < 24) return Math.round(h) + ' h ago';
  const d = h / 24; if(d < 2) return 'yesterday'; if(d < 30) return Math.round(d) + ' days ago';
  const mo = d / 30.44; if(mo < 12) return Math.round(mo) + ' mo ago';
  return (d / 365).toFixed(1).replace(/\.0$/, '') + ' yr ago';
}
function dateGroup(t){
  const d = new Date(t), n = new Date();
  const sod = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((sod(n) - sod(d)) / DAY);
  if(diff <= 0) return 'Today'; if(diff === 1) return 'Yesterday'; if(diff <= 7) return 'Previous 7 days'; if(diff <= 30) return 'Previous 30 days';
  if(d.getFullYear() === n.getFullYear()) return d.toLocaleDateString(undefined, {month:'long'});
  return String(d.getFullYear());
}
function hashColor(s){ let h = 0; for(const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
function initials(s){ const w = String(s || '').trim().split(/\s+/).filter(x => /[a-z0-9]/i.test(x)); if(!w.length) return '?'; const f = x => (x.match(/[a-z0-9]/i) || ['?'])[0]; return (f(w[0]) + (w.length > 1 ? f(w[1]) : '')).toUpperCase(); }
