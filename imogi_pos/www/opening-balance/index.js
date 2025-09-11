frappe.ready(() => {
  const params = new URLSearchParams(window.location.search);
  const device = params.get('device') || 'kiosk';
  const next = params.get('next') || '/kiosk';

  localStorage.setItem('imogi_device', device);

  const form = document.getElementById('opening-balance-form');
  const amountInput = document.getElementById('new-opening-balance');

  const timestampElement = document.getElementById('timestamp');
  const userElement = document.getElementById('user');
  const deviceElement = document.getElementById('device');
  const openingBalanceElement = document.getElementById('opening_balance');

  // Fungsi untuk format angka menjadi Rupiah
  function formatRupiah(angka) {
    let number_string = angka.toString().replace(/[^,\d]/g, '');
    let split = number_string.split(',');
    let sisa = split[0].length % 3;
    let rupiah = split[0].substr(0, sisa);
    let ribuan = split[0].substr(sisa).match(/\d{3}/gi);

    if (ribuan) {
      let separator = sisa ? '.' : '';
      rupiah += separator + ribuan.join('.');
    }

    rupiah = split[1] !== undefined ? rupiah + ',' + split[1] : rupiah;
    return 'Rp ' + rupiah;
  }

  // Fetch session data
  frappe.call({
    method: 'imogi_pos.api.public.get_cashier_device_sessions',
    callback: (r) => {
      const sessions = r.message || [];
      if (sessions.length > 0) {
        const s = sessions[0]; // Take the first session for display

        timestampElement.innerText = s.timestamp;
        userElement.innerText = s.user;
        deviceElement.innerText = s.device;
        openingBalanceElement.innerText = formatRupiah(s.opening_balance); // Format Rupiah
      }
    },
  });

  // Handle form submit for opening balance
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(amountInput.value.replace(/[^\d.-]/g, '')); // Clean any existing currency symbols
    const formattedAmount = formatRupiah(amount); // Format the input value as Rupiah
    amountInput.value = formattedAmount; // Display formatted Rupiah in the input

    // Submit the amount as a number (unformatted) to the backend
    frappe.call({
      method: 'imogi_pos.api.public.record_opening_balance',
      args: { device_type: device, opening_balance: amount },
      callback: () => {
        window.location.href = next;
      },
    });
  });

  // Format the amount input when the user types
  amountInput.addEventListener('input', (e) => {
    const value = e.target.value;
    e.target.value = formatRupiah(value.replace(/[^\d.-]/g, '')); // Reformat as the user types
  });
});
