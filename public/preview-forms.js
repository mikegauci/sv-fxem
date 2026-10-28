// Content preview only: never post comments to the production WordPress site.
document.querySelectorAll('form[data-preview-form]').forEach(form => {
  form.addEventListener('submit', event => {
    event.preventDefault();
    let status = form.querySelector('[data-preview-status]');
    if (!status) {
      status = document.createElement('p');
      status.dataset.previewStatus = '';
      status.setAttribute('role', 'status');
      form.append(status);
    }
    status.textContent = form.dataset.previewForm === 'deposit'
      ? 'This is a design preview. Payments are not enabled.'
      : 'Comments are not enabled on this preview.';
  });
});
