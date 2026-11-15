(() => {
  'use strict';
  const field = document.getElementById('top-up');
  if (!field) return;

  function readCents() {
    const value = field.value.trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  }

  function format(cents) {
    return (cents / 100).toFixed(2);
  }

  for (const button of field.form.querySelectorAll('[data-adjust]')) {
    button.addEventListener('click', () => {
      const current = readCents() ?? 5000;
      const next = current + Number(button.dataset.adjust) * 100;
      if (next <= 0 || !Number.isSafeInteger(next)) return;
      field.value = format(next);
      field.setCustomValidity('');
    });
  }

  field.addEventListener('input', () => field.setCustomValidity(''));
  field.form.addEventListener('submit', event => {
    const cents = readCents();
    if (cents === null) {
      event.preventDefault();
      field.setCustomValidity('Enter a positive rand amount with up to two decimal places.');
      field.reportValidity();
      return;
    }
    field.value = format(cents);
  });
})();
