// Retained legacy forms stay disabled until processing is deliberately enabled.
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
    const arabic = document.documentElement.lang.startsWith('ar');
    status.textContent = form.dataset.previewForm === 'deposit'
      ? (arabic ? 'طلبات كاش يو غير متاحة حالياً. يرجى التواصل عبر support@fxem.com.' : 'CashU requests are currently unavailable. Please contact support@fxem.com.')
      : (arabic ? 'التعليقات عبر الموقع غير متاحة حالياً.' : 'Online comments are currently unavailable.');
  });
});
