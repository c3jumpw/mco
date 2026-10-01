/* MK Holding Co — navigation + contact form */
(function () {
  'use strict';

  // ---- Footer year ----
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ---- Mobile navigation ----
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      }
    });
  }

  // ---- Contact form ----
  var form = document.getElementById('contact-form');
  if (!form) return;

  var submitBtn = document.getElementById('cf-submit');
  var statusEl = document.getElementById('cf-status');
  var FALLBACK = 'contact@mkholdingco.com';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

  function showFieldError(name, message) {
    var input = form.elements[name];
    var slot = form.querySelector('[data-error-for="' + name + '"]');
    if (input) input.setAttribute('aria-invalid', 'true');
    if (slot) {
      slot.textContent = message;
      slot.hidden = false;
    }
  }

  function clearFieldErrors() {
    form.querySelectorAll('[data-error-for]').forEach(function (slot) {
      slot.hidden = true;
      slot.textContent = '';
    });
    form.querySelectorAll('[aria-invalid]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
  }

  // Clear a field's error as soon as the person starts fixing it.
  form.addEventListener('input', function (e) {
    var name = e.target.name;
    if (!name) return;
    var slot = form.querySelector('[data-error-for="' + name + '"]');
    if (slot && !slot.hidden) {
      slot.hidden = true;
      slot.textContent = '';
      e.target.removeAttribute('aria-invalid');
    }
  });

  function validate(data) {
    var errors = [];
    if (!data.name) {
      errors.push(['name', 'Enter your name.']);
    }
    if (!data.email) {
      errors.push(['email', 'Enter your email address.']);
    } else if (!EMAIL_RE.test(data.email)) {
      errors.push(['email', 'That email address looks incomplete. Check for a typo.']);
    }
    if (!data.message) {
      errors.push(['message', 'Tell us a little about your company.']);
    } else if (data.message.length < 10) {
      errors.push(['message', 'Add a bit more detail so we can route your note.']);
    }
    return errors;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearFieldErrors();
    setStatus(null);

    var data = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      company: form.elements.company.value.trim(),
      message: form.elements.message.value.trim(),
      website: form.elements.website.value.trim() // honeypot
    };

    var errors = validate(data);
    if (errors.length) {
      errors.forEach(function (pair) { showFieldError(pair[0], pair[1]); });
      var firstField = form.elements[errors[0][0]];
      if (firstField) firstField.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; })
          .then(function (body) { return { status: res.status, body: body }; });
      })
      .then(function (r) {
        if (r.status === 200) {
          form.reset();
          setStatus('ok', 'Message sent. Someone from our team will be in touch shortly.');
          return;
        }

        if (r.status === 400 && r.body && r.body.field) {
          showFieldError(r.body.field, r.body.error || 'Check this field and try again.');
          setStatus('error', 'Fix the highlighted field and send again.');
          return;
        }

        if (r.status === 429) {
          setStatus('error', 'That’s a few messages in quick succession. Wait a minute and try again, or email us at <a href="mailto:' + FALLBACK + '">' + FALLBACK + '</a>.');
          return;
        }

        if (r.status === 503) {
          setStatus('error', 'Email delivery isn’t switched on for this site yet. Reach us directly at <a href="mailto:' + FALLBACK + '">' + FALLBACK + '</a>.');
          return;
        }

        setStatus('error', 'The message didn’t go through. Try again, or email us at <a href="mailto:' + FALLBACK + '">' + FALLBACK + '</a>.');
      })
      .catch(function () {
        setStatus('error', 'We couldn’t reach the server. Check your connection and try again, or email us at <a href="mailto:' + FALLBACK + '">' + FALLBACK + '</a>.');
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send message';
      });
  });
})();
