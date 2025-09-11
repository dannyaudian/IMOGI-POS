frappe.ready(() => {
  const params = new URLSearchParams(window.location.search);
  const device = params.get('device') || 'kiosk';
  const next = params.get('next') || '/service-select';

  const form = document.getElementById('opening-balance-form');
  const amountInput = document.getElementById('new-opening-balance');

  const elTs = document.getElementById('timestamp');
  const elUser = document.getElementById('user');
  const elDev = document.getElementById('device');
  const elOB  = document.getElementById('opening_balance');

  // --- Formatter & parser Rupiah ---
  function formatRupiah(val) {
    const digits = String(val).replace(/[^\d]/g, '');
    if (!digits) return 'Rp 0';
    // sisipkan titik setiap 3 digit dari belakang
    const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'Rp ' + withDots;
  }
  function parseRupiah(str) {
    const digits = String(str || '').replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  // Isi panel kiri (ambil session terakhir kalau ada)
  frappe.call({
    method: 'imogi_pos.api.public.get_cashier_device_sessions',
    callback: (r) => {
      const s = (r.message || [])[0];
      if (!s) return;
      if (elTs)   elTs.textContent = s.timestamp || '';
      if (elUser) elUser.textContent = s.user || '';
      if (elDev)  elDev.textContent = s.device || '';
      if (elOB)   elOB.textContent  = formatRupiah(s.opening_balance || 0);
    }
  });

  // Format saat user mengetik
  amountInput.addEventListener('input', (e) => {
    const raw = parseRupiah(e.target.value);
    e.target.value = formatRupiah(raw);
  });

  // Pre-fill tampilan input agar jelas
  amountInput.value = formatRupiah(0);

  // Submit: kirim angka bersih ke backend
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const opening_balance = parseRupiah(amountInput.value); // angka murni

    frappe.call({
      method: 'imogi_pos.api.public.record_opening_balance',
      args: { device_type: device, opening_balance },
      callback: () => {
        // opsional: update panel kiri sebelum pindah halaman
        if (elOB) elOB.textContent = formatRupiah(opening_balance);
        window.location.href = next;
      },
      error: (err) => {
        // tampilkan pesan error dari backend (mis. session masih aktif)
        const msg = err?.message || err?._server_messages || __('Failed to open session');
        frappe.msgprint(msg);
      }
    });
  });
});
