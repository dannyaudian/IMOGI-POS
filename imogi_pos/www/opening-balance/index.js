frappe.ready(() => {
  const params = new URLSearchParams(window.location.search);
  const device = params.get('device') || 'kiosk';
  const next = params.get('next') || '/kiosk';

  localStorage.setItem('imogi_device', device);

  const form = document.getElementById('opening-balance-form');
  const amountInput = document.getElementById('opening-balance');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(amountInput.value);
    frappe.call({
      method: 'imogi_pos.api.public.record_opening_balance',
      args: { device_type: device, opening_balance: amount },
      callback: () => {
        window.location.href = next;
      },
    });
  });
});
