frappe.ready(() => {
  const kioskBtn = document.getElementById('kiosk-btn');
  const cashierBtn = document.getElementById('cashier-btn');

  if (cashierBtn) {
    cashierBtn.addEventListener('click', () => {
      localStorage.setItem('imogi_device', 'cashier');
      window.location.href = '/cashier-console';
    });
  }

  if (kioskBtn) {
    kioskBtn.addEventListener('click', () => {
      frappe.prompt(
        {
          fieldname: 'amount',
          label: __('Opening Balance'),
          fieldtype: 'Currency',
          reqd: 1
        },
        (values) => {
          localStorage.setItem('imogi_device', 'kiosk');
          frappe.call({
            method: 'imogi_pos.api.public.record_opening_balance',
            args: { amount: values.amount },
            callback: () => {
              window.location.href = '/kiosk';
            }
          });
        },
        __('Enter Opening Balance'),
        __('Start')
      );
    });
  }
});
