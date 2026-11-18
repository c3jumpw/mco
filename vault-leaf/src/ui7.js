
/* ---------- guided tour and What's new ----------
   Slides, releases and screenshot callouts come from src/tour.json and tools/shots.json, injected by tools/build.py.
   Screenshots are the guide's own images, retaken automatically on every release. */
const TOUR = /*__TOUR__*/null;
const APP_VERSION = TOUR ? TOUR.version : '';
K.seen = 'vaultleaf.seen';
const vcmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for(let i = 0; i < Math.max(x.length, y.length); i++){ const d = (x[i] || 0) - (y[i] || 0); if(d) return d; } return 0; };
const T = {open:false, track:null, i:0, from:null, back:null};
let tourEl = null;
const tourBtn = (cls, label) => TOUR ? `<button class="${cls}" data-act="tour">${ic('cards','s')}${label}</button>` : guideLink(cls, label);
const fmtRel = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
const newReleases = from => TOUR.releases.filter(r => vcmp(r.version, from) > 0);
function newSlides(from){
  const out = [{id:'releases', chapter:'What\'s new', releases:newReleases(from)}];
  for(const k of ['everyone', 'admin']) for(const s of TOUR.tracks[k].slides){ const f = TOUR.features[s.feature]; if(f && vcmp(f.since, from) > 0 && !out.some(o => o.feature === s.feature && o.title === s.title)) out.push({...s, chapter:k === 'admin' ? 'For admins' : 'What\'s new', track:k}); }
  return out;
}
function tourSlides(){ return T.track === 'new' ? newSlides(T.from) : TOUR.tracks[T.track].slides; }
function baselineFor(at){ let v = TOUR.releases[0].version; for(const r of TOUR.releases) if(new Date(r.date + 'T00:00:00Z').getTime() <= (at || 0)) v = r.version; return v; }
function tourAfterUnlock(fresh){
  if(!TOUR) return;
  const seen = LS.get(K.seen); S.nudge = null;
  if(fresh){ S.nudge = {kind:'welcome'}; LS.set(K.seen, APP_VERSION); }
  else {
    const from = seen || baselineFor(S.header && S.header.createdAt);
    if(vcmp(from, APP_VERSION) < 0) S.nudge = {kind:'new', from}; else LS.set(K.seen, APP_VERSION);
  }
  if(S.nudge) renderList();
}
function nudgeHTML(){
  const n = S.nudge; if(!n || !TOUR) return '';
  const rel = TOUR.releases[TOUR.releases.length - 1];
  const txt = n.kind === 'welcome' ? 'New to Vaultleaf? A 4-minute tour shows every feature, step by step.' : `Vaultleaf ${esc(APP_VERSION)} is here: ${esc(rel.title.toLowerCase())}, and more. See what changed since you last looked.`;
  return `<div class="banner tour-nudge">${ic(n.kind === 'welcome' ? 'cards' : 'star','s')}<b>${txt}</b><button class="btn small primary" data-act="${n.kind === 'welcome' ? 'tour' : 'tour-new'}">${n.kind === 'welcome' ? 'Take the tour' : 'See what\'s new'}</button><button class="icon-btn" data-act="tour-dismiss" aria-label="Dismiss" title="Dismiss">${ic('x','s')}</button></div>`;
}
function markSeen(){ if(!TOUR) return; LS.set(K.seen, APP_VERSION); if(S.nudge){ S.nudge = null; if(S.phase === 'app') renderList(); } }

function openTour(track = null, i = 0, from = null){
  if(!TOUR){ if(WEB){ S.tab = 'guide'; renderApp(); } else window.open(GUIDE_URL, '_blank', 'noopener'); return; }
  if(!T.open){ T.back = document.activeElement; }
  Object.assign(T, {open:true, track, i, from});
  if(!tourEl){ tourEl = document.createElement('div'); tourEl.id = 'tour'; tourEl.className = 'tour'; document.body.appendChild(tourEl); wireTourSwipe(); }
  renderTour(true);
  document.documentElement.classList.add('tour-on');
}
function closeTour(){
  if(!tourEl) return;
  tourEl.remove(); tourEl = null; T.open = false; document.documentElement.classList.remove('tour-on');
  if(T.track) markSeen();
  if(T.back && T.back.isConnected) try{ T.back.focus(); }catch(e){}
}
function shotFor(s){
  const phone = matchMedia('(max-width:759px)').matches;
  const name = (phone ? s.p : s.d) || s.d || s.p; const m = name && TOUR.shots[name];
  return m ? {name, w:m[0], h:m[1], marks:s.marks === false ? [] : m[2]} : null;
}
function pickerHTML(){
  const ev = TOUR.tracks.everyone, ad = TOUR.tracks.admin, rel = TOUR.releases[TOUR.releases.length - 1];
  const mins = n => Math.max(1, Math.round(n * 9 / 60));
  const card = (v, icon, title, desc, meta) => `<button class="tour-track" data-act="tour-go" data-v="${v}"><span class="tt-ic">${ic(icon)}</span><span class="tt-tx"><b>${title}</b><span>${desc}</span><small>${meta}</small></span>${ic('right','s')}</button>`;
  return `<div class="tour-head"><span class="tour-crumb">Vaultleaf ${esc(APP_VERSION)}</span><span class="sp"></span><button class="icon-btn" data-act="tour-close" aria-label="Close the tour" title="Close">${ic('x')}</button></div>
  <div class="tour-pick"><div class="tour-pick-h">${MARK(44)}<h2 id="tour-title">Take the tour</h2><p>Pictures of every part of Vaultleaf, one step at a time. Pick where to start. You can leave and come back any time from Settings.</p></div>
    <div class="tour-tracks">
      ${card('everyone', 'key', esc(ev.title), esc(ev.desc), `${ev.slides.length} steps · about ${mins(ev.slides.length)} minutes`)}
      ${card('admin', 'shield', esc(ad.title), esc(ad.desc), `${ad.slides.length} steps · for people who run the site`)}
      ${card('new', 'star', `What's new in ${esc(rel.version)}`, esc(rel.summary), `Updated ${fmtRel(rel.date)}`)}
    </div>
    <p class="tour-pick-f">Want every detail? ${WEB ? `<button class="linkish" data-act="tour-guide">Read the full illustrated guide</button>` : `<a href="${GUIDE_URL}" target="_blank" rel="noopener">Read the full illustrated guide</a>`}</p>
  </div>`;
}
function releasesHTML(rs){
  if(!rs.length) return `<div class="tour-rel"><p>You're up to date. Nothing has changed since you last looked.</p></div>`;
  return `<div class="tour-rel">${rs.slice().reverse().map(r => `<div class="rel"><span class="rel-v">${esc(r.version)}</span><div><b>${esc(r.title)}</b><small>${fmtRel(r.date)}</small><p>${esc(r.summary)}</p></div></div>`).join('')}</div>`;
}
function slideHTML(){
  const slides = tourSlides(), n = slides.length; T.i = Math.max(0, Math.min(T.i, n - 1));
  const s = slides[T.i], last = T.i === n - 1;
  const title = T.track === 'new' ? 'What\'s new' : TOUR.tracks[T.track].title;
  const chapters = [...new Set(slides.map(x => x.chapter))];
  const sh = s.releases ? null : shotFor(s);
  const fig = s.releases ? releasesHTML(s.releases) : sh ? `<figure class="tour-fig ${sh.h > sh.w ? 'tall' : ''}" style="--ar:${(sh.w / sh.h).toFixed(4)}"><img src="/guide/img/${sh.name}.webp" width="${sh.w}" height="${sh.h}" alt="Screenshot: ${esc(s.title)}" decoding="async">${sh.marks.map(m => `<span class="tour-mk${m[2] < 3 || m[3] < 3 ? ' edge' : ''}" style="left:${m[2]}%;top:${m[3]}%;width:${m[4]}%;height:${m[5]}%"><b>${m[0]}</b></span>`).join('')}</figure>` : '';
  const legend = sh && sh.marks.length ? `<ol class="tour-legend">${sh.marks.map(m => `<li><b>${m[0]}</b>${esc(m[1])}</li>`).join('')}</ol>` : '';
  const body = s.releases ? `<h2 id="tour-title">${s.releases.length ? `What's new since ${esc(T.from)}` : 'All caught up'}</h2><p>${s.releases.length ? `The next ${n - 1 === 1 ? 'step shows' : (n - 1) + ' steps show'} each new feature, with pictures.` : ''}</p>`
    : `<h2 id="tour-title">${esc(s.title)}</h2><p>${esc(s.text)}</p>${s.points ? `<ul class="tour-pts">${s.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}${legend}`;
  return `<div class="tour-head"><button class="tour-crumb linkish" data-act="tour-pick" title="Pick another tour">${ic('left','s')}<span class="tc-t">${esc(title)}</span></button>
    ${chapters.length > 1 ? `<select id="tour-chap" class="input tour-chap" aria-label="Jump to a chapter">${chapters.map(c => `<option ${c === s.chapter ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : `<span class="tour-chap-1">${esc(s.chapter)}</span>`}
    <span class="sp"></span><span class="tour-count" aria-live="polite">${T.i + 1} of ${n}</span>
    <button class="icon-btn" data-act="tour-close" aria-label="Close the tour" title="Close">${ic('x')}</button></div>
  <div class="tour-main ${s.releases ? 'is-rel' : ''}">${fig}<div class="tour-text">${s.track === 'admin' && T.track === 'new' ? '<span class="tour-chip">For admins</span>' : ''}${body}</div></div>
  <div class="tour-foot"><button class="btn" data-act="tour-prev" ${T.i ? '' : 'disabled'}>${ic('left','s')}Back</button>
    <div class="tour-prog" role="progressbar" aria-label="Tour progress" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${T.i + 1}"><span style="width:${((T.i + 1) / n * 100).toFixed(1)}%"></span></div>
    <button class="btn primary" data-act="tour-next">${last ? 'Finish' : 'Next'}${last ? '' : ic('right','s')}</button></div>`;
}
function renderTour(focus){
  if(!tourEl) return;
  tourEl.innerHTML = `<div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">${T.track ? slideHTML() : pickerHTML()}</div>`;
  const main = tourEl.querySelector('.tour-main'); if(main) main.scrollTop = 0;
  if(T.track){ const sl = tourSlides(), nx = sl[T.i + 1]; const sh = nx && !nx.releases && shotFor(nx); if(sh){ const im = new Image(); im.src = `/guide/img/${sh.name}.webp`; } }
  if(focus){ const f = tourEl.querySelector(T.track ? '[data-act="tour-next"]' : '.tour-track'); if(f) setTimeout(() => f.focus(), 30); }
}
function tourStep(d){
  const n = tourSlides().length, j = T.i + d;
  if(j >= n){ const done = T.track; closeTour(); toast(done === 'new' ? 'You\'re up to date' : 'Tour finished. Take it again any time from Settings.', 'check'); return; }
  if(j < 0) return;
  T.i = j; renderTour(); const b = tourEl.querySelector(d > 0 ? '[data-act="tour-next"]' : '[data-act="tour-prev"]'); if(b && !b.disabled) b.focus(); else { const nb = tourEl.querySelector('[data-act="tour-next"]'); if(nb) nb.focus(); }
}
function wireTourSwipe(){
  let x0 = null, y0 = 0;
  tourEl.addEventListener('touchstart', e => { if(!T.track || e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, {passive:true});
  tourEl.addEventListener('touchend', e => { if(x0 === null) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null; if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) tourStep(dx < 0 ? 1 : -1); }, {passive:true});
  tourEl.addEventListener('change', e => { if(e.target.id !== 'tour-chap') return; const i = tourSlides().findIndex(s => s.chapter === e.target.value); if(i >= 0){ T.i = i; renderTour(); const sel = $('#tour-chap'); if(sel) sel.focus(); } });
}
document.addEventListener('keydown', e => {
  if(!T.open || !tourEl) return;
  const t = e.target, inSelect = t && t.tagName === 'SELECT';
  if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); closeTour(); return; }
  if(e.key === 'Tab'){
    const fs = [...tourEl.querySelectorAll('button:not([disabled]),select,a[href]')]; if(!fs.length) return;
    const i = fs.indexOf(document.activeElement);
    if(e.shiftKey && i <= 0){ e.preventDefault(); fs[fs.length - 1].focus(); } else if(!e.shiftKey && (i === fs.length - 1 || i < 0)){ e.preventDefault(); fs[0].focus(); }
    e.stopImmediatePropagation(); return;
  }
  if(T.track && !inSelect && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')){ e.preventDefault(); tourStep(e.key === 'ArrowRight' ? 1 : -1); }
  e.stopImmediatePropagation();
}, true);
Object.assign(ACT, {
  tour(){ if(S.m) closeModal(); if(S.nudge && S.nudge.kind === 'welcome') markSeen(); openTour(null); },
  'tour-go'(el){ const v = el.dataset.v; openTour(v, 0, v === 'new' ? (S.nudge && S.nudge.from) || (TOUR.releases.length > 1 ? TOUR.releases[TOUR.releases.length - 2].version : '0') : null); },
  'tour-new'(){ openTour('new', 0, (S.nudge && S.nudge.from) || APP_VERSION); },
  'tour-pick'(){ openTour(null); },
  'tour-close'(){ closeTour(); },
  'tour-next'(){ tourStep(1); },
  'tour-prev'(){ tourStep(-1); },
  'tour-dismiss'(){ markSeen(); },
  'tour-guide'(){ closeTour(); if(S.phase === 'app'){ S.tab = 'guide'; renderApp(); } else window.open(GUIDE_URL, '_blank', 'noopener'); },
});
