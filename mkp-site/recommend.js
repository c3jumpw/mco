/* Book recommendation form on /library */
(function () {
  'use strict';
  var form = document.getElementById('rec-form');
  if (!form) return;

  var btn = document.getElementById('rc-submit');
  var statusEl = document.getElementById('rc-status');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var FALLBACK = 'contact@mambaykanu.com';

  function setStatus(tone, html) {
    if (!statusEl) return;
    if (!tone) {
      statusEl.hidden = true;
      statusEl.removeAttribute('data-tone');
      statusEl.innerHTML = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.setAttribute('data-tone', tone);
    statusEl.innerHTML = html;
  }

  function fieldError(name, message) {
    var input = form.elements[name];
    var slot = form.querySelector('[data-error-for="' + name + '"]');
    if (input) input.setAttribute('aria-invalid', 'true');
    if (slot) { slot.textContent = message; slot.hidden = false; }
  }

  function clearErrors() {
    form.querySelectorAll('[data-error-for]').forEach(function (s) { s.hidden = true; s.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
  }

  form.addEventListener('input', function (e) {
    var slot = e.target.name && form.querySelector('[data-error-for="' + e.target.name + '"]');
    if (slot && !slot.hidden) {
      slot.hidden = true; slot.textContent = '';
      e.target.removeAttribute('aria-invalid');
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    setStatus(null);

    var data = {
      title: form.elements.title.value.trim(),
      author: form.elements.author.value.trim(),
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      note: form.elements.note.value.trim(),
      website: form.elements.website.value.trim()
    };

    var bad = [];
    if (!data.title) bad.push(['title', 'Which book do you mean?']);
    if (!data.email) bad.push(['email', 'Enter your email so I can reply.']);
    else if (!EMAIL_RE.test(data.email)) bad.push(['email', 'That address looks incomplete. Check for a typo.']);
    if (bad.length) {
      bad.forEach(function (p) { fieldError(p[0], p[1]); });
      var first = form.elements[bad[0][0]];
      if (first) first.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';

    fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; })
          .then(function (b) { return { status: res.status, body: b }; });
      })
      .then(function (r) {
        if (r.status === 200) {
          form.reset();
          setStatus('ok', 'Got it. Thanks for the recommendation, there is a note on its way to your inbox.');
          return;
        }
        if (r.status === 400 && r.body && r.body.field) {
          fieldError(r.body.field, r.body.error || 'Check this field and try again.');
          setStatus('error', 'Fix the highlighted field and send again.');
          return;
        }
        if (r.status === 429) {
          setStatus('error', 'That is a few in quick succession. Wait a minute and try again.');
          return;
        }
        if (r.status === 503) {
          setStatus('error', 'Recommendations are not switched on yet. Email <a href="mailto:' + FALLBACK + '">' + FALLBACK + '</a> instead.');
          return;
        }
        setStatus('error', 'That did not go through. Try again, or email <a href="mailto:' + FALLBACK + '">' + FALLBACK + '</a>.');
      })
      .catch(function () {
        setStatus('error', 'We could not reach the server. Check your connection and try again.');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Send the recommendation';
      });
  });
})();
