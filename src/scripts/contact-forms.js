import { messages, validateContact } from '../lib/contact/validation.mjs';
for (const form of document.querySelectorAll('[data-contact-form]')) initialize(form);
async function initialize(form) {
  const language = form.dataset.contactForm === 'ar' ? 'ar' : 'en', t = messages[language];
  const endpoint = `/api/contact/?lang=${language}`, submit = form.querySelector('[type=submit]');
  const status = form.querySelector('.wpcf7-response-output');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.removeAttribute('aria-hidden'); status.hidden = true;
  const mapping = { name: 'your-name', email: 'your-email', subject: 'your-subject', message: 'your-message' };
  let bootstrap, busy = false, sent = false, requestId = crypto.randomUUID();
  function show(text, error = false) {
    status.hidden = !text; status.textContent = text; status.classList.toggle('contact-error', error);
  }
  function values() { return Object.fromEntries(Object.entries(mapping).map(([key, name]) => [key, form.elements.namedItem(name).value])); }
  function errors(errors) {
    form.querySelectorAll('[data-contact-error]').forEach(el => el.remove());
    for (const name of Object.values(mapping)) { const field = form.elements.namedItem(name); field.setAttribute('aria-invalid', 'false'); field.removeAttribute('aria-describedby'); }
    let first;
    for (const [key, text] of Object.entries(errors)) {
      if (!mapping[key]) continue;
      const field = form.elements.namedItem(mapping[key]), error = document.createElement('span');
      error.className = 'wpcf7-not-valid-tip'; error.dataset.contactError = ''; error.id = `contact-error-${key}`; error.textContent = text;
      field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', error.id); field.parentElement.append(error); first ||= field;
    }
    first?.focus(); return !first;
  }
  async function load() {
    submit.disabled = true; show(t.loading);
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const body = await response.json(); if (!response.ok || !body.ok) throw Error();
      bootstrap = body; submit.disabled = false; show('');
    } catch {
      show(t.unavailable, true);
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = t.retry; retry.addEventListener('click', load); status.append(' ', retry);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || sent || !bootstrap) return;
    const fields = values(); if (!errors(validateContact(fields, language))) { show(t.review, true); return; }
    if (!bootstrap.configured) { show(t.unavailable, true); return; }
    busy = true; submit.disabled = true; show(t.sending);
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields, csrf: bootstrap.csrf, requestId, website: form.elements.namedItem('website').value }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if ([400, 422].includes(response.status)) requestId = crypto.randomUUID();
        if (result.errors) errors(result.errors);
        show(result.message || t.uncertain, true); return;
      }
      sent = true; form.reset(); errors({}); show(t.success);
    } catch { show(t.uncertain, true); }
    finally { busy = false; submit.disabled = sent; }
  });
  await load();
}
