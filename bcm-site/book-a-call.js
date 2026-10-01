// Multi-step form controller + submit
(function () {
  'use strict';

  const form = document.getElementById('bookForm');
  const steps = Array.from(form.querySelectorAll('.step'));
  const progressFill = document.getElementById('progressFill');
  const stepLabel = document.getElementById('stepLabel');
  const totalSteps = steps.filter(s => /^[0-9]+$/.test(s.dataset.step)).length;

  let current = 1;

  function stepEl(n) {
    return form.querySelector('.step[data-step="' + n + '"]');
  }

  function updateProgress() {
    const pct = Math.min(100, (current / totalSteps) * 100);
    progressFill.style.width = pct + '%';
    stepLabel.textContent = 'Step ' + current + ' of ' + totalSteps;
  }

  function echoName() {
    const first = (form.firstName.value || '').trim().split(/\s+/)[0] || 'friend';
    form.querySelectorAll('.echo-name').forEach(el => { el.textContent = first; });
  }

  function show(stepKey) {
    steps.forEach(s => s.classList.remove('is-active'));
    const el = form.querySelector('.step[data-step="' + stepKey + '"]');
    if (!el) return;
    el.classList.add('is-active');
    if (stepKey === 'done' || stepKey === 'error') {
      document.querySelector('.progress-wrap').style.visibility = 'hidden';
    } else {
      document.querySelector('.progress-wrap').style.visibility = 'visible';
      current = parseInt(stepKey, 10);
      updateProgress();
    }
    // focus first input/button in the new step
    setTimeout(() => {
      const focusable = el.querySelector('input, textarea, button');
      if (focusable && focusable.type !== 'submit') focusable.focus();
    }, 50);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Validate the fields on the currently visible step
  function validateCurrent() {
    const el = stepEl(current);
    const inputs = el.querySelectorAll('input[required], textarea[required]');
    let ok = true;

    // Group required radios by name
    const radioGroups = {};
    inputs.forEach(i => {
      if (i.type === 'radio') {
        radioGroups[i.name] = radioGroups[i.name] || [];
        radioGroups[i.name].push(i);
      }
    });
    Object.keys(radioGroups).forEach(name => {
      const anyChecked = radioGroups[name].some(r => r.checked);
      if (!anyChecked) ok = false;
    });

    // Text / email / tel / textarea
    inputs.forEach(i => {
      if (i.type === 'radio') return;
      const wrap = i.closest('.field');
      if (!i.value.trim()) {
        ok = false;
        if (wrap) wrap.classList.add('invalid');
      } else if (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)) {
        ok = false;
        if (wrap) wrap.classList.add('invalid');
      } else if (wrap) {
        wrap.classList.remove('invalid');
      }
    });

    return ok;
  }

  // Clear invalid state on input
  form.addEventListener('input', (e) => {
    const wrap = e.target.closest('.field');
    if (wrap) wrap.classList.remove('invalid');
  });

  // Advance to the next step via Next buttons
  form.addEventListener('click', (e) => {
    const nextBtn = e.target.closest('[data-next]');
    if (nextBtn) {
      if (!validateCurrent()) return;
      if (current === 1) echoName();
      if (current < totalSteps) show(current + 1);
      return;
    }
    const backBtn = e.target.closest('[data-back]');
    if (backBtn) {
      if (current > 1) show(current - 1);
      return;
    }
    if (e.target.id === 'retryBtn') {
      show(1);
      return;
    }
  });

  // Pressing Enter inside an input advances
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit') {
      e.preventDefault();
      const nextBtn = stepEl(current).querySelector('[data-next], button[type="submit"]');
      if (nextBtn) nextBtn.click();
    }
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateCurrent()) return;

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.classList.add('is-loading');
    submitBtn.disabled = true;

    const data = {
      firstName: form.firstName.value.trim(),
      business:  form.business.value.trim(),
      pain:      (form.pain.value || ''),
      teamSize:  (form.teamSize.value || ''),
      urgency:   (form.urgency.value || ''),
      timeOfDay: (form.timeOfDay.value || ''),
      email:     form.email.value.trim(),
      phone:     form.phone.value.trim(),
      notes:     form.notes.value.trim(),
      submittedAt: new Date().toISOString(),
      source: 'bcm.mambaykanu.com book-a-call'
    };

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('bad status ' + res.status);
      echoName();
      show('done');
    } catch (err) {
      console.error('submit failed', err);
      show('error');
    } finally {
      submitBtn.classList.remove('is-loading');
      submitBtn.disabled = false;
    }
  });

  // Init
  updateProgress();
})();
