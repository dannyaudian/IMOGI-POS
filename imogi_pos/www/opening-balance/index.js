frappe.ready(() => {
  const params = new URLSearchParams(window.location.search);
  const device = params.get('device') || 'kiosk';
  const next = params.get('next') || '/kiosk';

  localStorage.setItem('imogi_device', device);

  const form = document.getElementById('opening-balance-form');
  const amountInput = document.getElementById('opening-balance');
  const sessionList = document.getElementById('session-list');

  frappe.call({
    method: 'imogi_pos.api.public.get_cashier_device_sessions',
    callback: (r) => {
      const sessions = r.message || [];
      sessions.forEach((s) => {
        const card = document.createElement('div');
        card.className = 'card';

        const body = document.createElement('div');
        body.className = 'card-body';

        const formattedTimestamp = frappe.datetime.str_to_user(s.timestamp);
        const formattedBalance = frappe.format_currency(s.opening_balance);

        body.innerHTML = `
          <div class="form-group">
            <label>${__('Timestamp')}</label>
            <input class="form-control" value="${formattedTimestamp}" readonly />
          </div>
          <div class="form-group">
            <label>${__('User')}</label>
            <input class="form-control" value="${s.user}" readonly />
          </div>
          <div class="form-group">
            <label>${__('Device')}</label>
            <input class="form-control" value="${s.device}" readonly />
          </div>
          <div class="form-group">
            <label>${__('Opening Balance')}</label>
            <input class="form-control" value="${formattedBalance}" readonly />
          </div>
        `;

        card.appendChild(body);
        sessionList.appendChild(card);
      });
    },
  });

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
