import { validateFields } from '../lib/currentdesk/validation.mjs';
import { marketingNames } from '../lib/currentdesk/dictionaries.mjs';

for (const form of document.querySelectorAll('form[data-currentdesk-form]')) initialize(form);
async function initialize(form) {
  const kind = form.dataset.currentdeskForm;
  const panels = [...form.querySelectorAll('.panels section')];
  const stages = [...form.querySelectorAll('.stages label')];
  const radios = [...form.querySelectorAll('input[name="stage"]')];
  const buttons = [...form.querySelectorAll('button')];
  const status = document.createElement('p');
  status.className = 'currentdesk-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
  form.append(status);
  let current = 0, ready = false, submitting = false, bootstrap;
  let requestId = crypto.randomUUID();
  function message(text, error = false) {
    status.hidden = !text; status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function values() {
    const result = Object.fromEntries(new FormData(form));
    delete result.stage; delete result.website;
    if (kind === 'demo') result['english-status'] = form.querySelector('#english-status')?.checked ? 'true' : 'false';
    if (kind === 'live') {
      const query = new URLSearchParams(location.search);
      for (const name of Object.keys(marketingNames)) if (query.has(name)) result[name] = query.get(name).slice(0, 256);
    }
    return result;
  }
  function showPanel(index) {
    current = index;
    panels.forEach((panel, i) => panel.classList.toggle('active', i === current));
    stages.forEach((stage, i) => {
      stage.classList.toggle('active', i === current); stage.classList.toggle('completed', i < current);
      if (i === current) stage.setAttribute('aria-current', 'step'); else stage.removeAttribute('aria-current');
    });
    radios.forEach((radio, i) => radio.checked = i === current);
    const progress = form.querySelector('.progress-bar span');
    if (progress) progress.style.width = `${panels.length > 1 ? current / (panels.length - 1) * (innerWidth <= 768 ? 85 : 92) : 100}%`;
  }
  function fieldElement(name) { return [...form.elements].find(field => field.name === name); }
  function clearErrors() {
    form.querySelectorAll('[data-currentdesk-error]').forEach(el => el.remove());
    form.querySelectorAll('[aria-invalid]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); el.classList.remove('invalid'); });
  }
  function showErrors(errors, focus = true) {
    clearErrors();
    let first;
    for (const [name, text] of Object.entries(errors)) {
      const field = fieldElement(name); if (!field) continue;
      const error = document.createElement('div'); error.dataset.currentdeskError = ''; error.className = 'error-message';
      error.id = `currentdesk-error-${name}`; error.textContent = text;
      field.classList.add('invalid'); field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', error.id);
      (field.closest('.form-group') || field.parentElement).append(error);
      first ||= field;
    }
    if (first && focus) {
      const index = panels.indexOf(first.closest('section'));
      if (index >= 0) showPanel(index);
      first.focus();
    }
    return !first;
  }
  function validPanel(index) {
    const fields = bootstrap.fields.filter(field => field.panel === index);
    return showErrors(validateFields(fields, values()));
  }
  function navigate(index) {
    if (!ready || submitting || index < 0 || index >= panels.length) return;
    if (index > current) for (let i = current; i < index; i++) if (!validPanel(i)) return;
    clearErrors(); showPanel(index);
  }
  form.querySelectorAll('.button-next').forEach(button => button.addEventListener('click', () => navigate(current + 1)));
  form.querySelectorAll('.button-prev').forEach(button => button.addEventListener('click', () => navigate(current - 1)));
  stages.forEach((stage, i) => {
    stage.setAttribute('role', 'button'); stage.tabIndex = 0;
    stage.addEventListener('click', event => { event.preventDefault(); navigate(i); });
    stage.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); navigate(i); } });
  });
  addEventListener('resize', () => showPanel(current));
  showPanel(0);
  async function load() {
    ready = false; buttons.forEach(button => button.disabled = true); message('Loading form options…');
    try {
      const response = await fetch(`/api/currentdesk/${kind}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.message || 'Unable to load form options. Please try again.');
      bootstrap = result;
      for (const field of result.fields) if (field.dictionary) {
        const select = fieldElement(field.name); if (!select) continue;
        const selected = select.value;
        select.replaceChildren(new Option('Please Select', ''));
        for (const item of result.dictionaries[field.dictionary]) select.add(new Option(item.label, item.id));
        select.value = selected;
      }
      ready = true; buttons.forEach(button => button.disabled = false); message('');
    } catch (error) {
      message(error.message === 'The operation was aborted due to timeout' ? 'Unable to load form options. Please try again.' : error.message, true);
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry'; retry.addEventListener('click', load); status.append(' ', retry);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || submitting) return;
    const fields = values();
    const errors = validateFields(bootstrap.fields, fields);
    if (!showErrors(errors)) return;
    submitting = true; buttons.forEach(button => button.disabled = true); message('Submitting…');
    try {
      const response = await fetch(`/api/currentdesk/${kind}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields, csrf: bootstrap.csrf, requestId, website: form.elements.namedItem('website')?.value || '' }), signal: AbortSignal.timeout(45000) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if ([400, 422].includes(response.status)) requestId = crypto.randomUUID();
        if (result.errors) showErrors(result.errors);
        message(result.message || 'Unable to submit your request. Please try again later.', true);
        return;
      }
      form.querySelectorAll('input[type=password]').forEach(input => input.value = '');
      if (result.redirect) { location.assign(result.redirect); return; }
      form.hidden = true; form.style.display = 'none';
      const success = document.createElement('p'); success.className = 'submit-success'; success.setAttribute('role', 'status'); success.textContent = result.message;
      form.parentElement.append(success); success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch { message('We could not confirm whether your request completed. Please check your email before submitting again.', true); }
    finally { submitting = false; buttons.forEach(button => button.disabled = false); }
  });
  await load();
}
