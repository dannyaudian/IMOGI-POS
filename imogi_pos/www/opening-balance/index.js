(function() {
  const init = () => {
    const params = new URLSearchParams(window.location.search);
  const device = params.get('device') || 'kiosk';
  const next = params.get('next') || '/service-select';

  const form = document.getElementById('opening-balance-form');
  const tbody = document.querySelector('#denomination-table tbody');
  const totalCell = document.getElementById('denomination-total');

  const elTs = document.getElementById('timestamp');
  const elShift = document.getElementById('shift_id');
  const elUser = document.getElementById('user');
  const elDev  = document.getElementById('device');
  const elOB   = document.getElementById('opening_balance');

  // --- Formatter Rupiah ---
  function formatRupiah(val) {
    const digits = String(val).replace(/[^\d]/g, '');
    if (!digits) return 'Rp 0';
    const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'Rp ' + withDots;
  }

  // --- Render rows pecahan ---
  const denominationValues = [100000, 50000, 20000, 10000, 5000, 2000];
  denominationValues.forEach((val) => {
    const tr = document.createElement('tr');
    tr.dataset.nominal = val;
    tr.innerHTML = `
      <td>${formatRupiah(val)}</td>
      <td>
        <input
          type="number"
          min="0"
          value="0"
          class="count"
          inputmode="numeric"
          pattern="[0-9]*"
        />
      </td>
      <td class="subtotal">Rp 0</td>
    `;
    tbody.appendChild(tr);
  });

  // Normalisasi input angka: buang non-digit & leading zero
  function normalizeNumberInput(el) {
    let v = (el.value || '').toString();

    // buang karakter non-digit
    v = v.replace(/[^\d]/g, '');

    // hapus leading zero apabila masih ada digit setelahnya (01 -> 1, 0009 -> 9)
    v = v.replace(/^0+(?=\d)/, '');

    // kalau jadi kosong, jangan paksa 0 di sini—biarkan user lanjut ketik
    el.value = v;
  }

  // Pasang handler ke semua input qty
  tbody.querySelectorAll('input.count').forEach((inp) => {
    // Saat fokus: kalau nilainya 0, kosongkan supaya ketikan pertama langsung mengganti 0
    inp.addEventListener('focus', () => {
      if (inp.value === '0') inp.value = '';
      // pilih seluruh isi (kalau ada) biar mudah ditimpa
      if (inp.select) inp.select();
    });

    // Saat mengetik
    inp.addEventListener('input', () => {
      normalizeNumberInput(inp);
      updateTotals();
    });

    // Blurring: jika kosong, kembalikan ke 0
    inp.addEventListener('blur', () => {
      if (inp.value === '' || isNaN(parseInt(inp.value, 10))) {
        inp.value = '0';
      } else {
        // rapikan lagi (pastikan tidak ada leading zero)
        inp.value = String(parseInt(inp.value, 10));
      }
      updateTotals();
    });

    // Cegah karakter yang tidak relevan untuk number input di beberapa browser
    inp.addEventListener('keydown', (e) => {
      if (['e', 'E', '+', '-', '.', ',', ' '].includes(e.key)) {
        e.preventDefault();
      }
    });
  });

  function updateTotals() {
    let total = 0;
    const denoms = [];
    tbody.querySelectorAll('tr').forEach((tr) => {
      const nominal = parseInt(tr.dataset.nominal, 10);
      const count = parseInt(tr.querySelector('input').value || '0', 10) || 0;
      const subtotal = nominal * count;
      tr.querySelector('.subtotal').textContent = formatRupiah(subtotal);
      if (count > 0) denoms.push({ nominal, quantity: count, subtotal });
      total += subtotal;
    });
    totalCell.textContent = formatRupiah(total);
    if (elOB) elOB.textContent = formatRupiah(total);
    return { total, denoms };
  }

  // Hitung awal
  updateTotals();

  // Isi panel kiri (ambil session terakhir kalau ada)
  frappe.call({
    method: 'imogi_pos.api.public.get_cashier_device_sessions',
    callback: (r) => {
      const s = (r.message || [])[0];
      if (!s) return;
      if (elTs)    elTs.textContent    = s.timestamp || '';
      if (elShift) elShift.textContent = s.name || '';
      if (elUser)  elUser.textContent  = s.user || '';
      if (elDev)   elDev.textContent   = s.device || '';
      if (elOB)    elOB.textContent    = formatRupiah(s.opening_balance || 0);
    }
  });

  // Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { total, denoms } = updateTotals();

    frappe.call({
      method: 'imogi_pos.api.public.record_opening_balance',
      args: { device_type: device, opening_balance: total, denominations: denoms },
      callback: () => {
        if (elOB) elOB.textContent = formatRupiah(total);
        window.location.href = next;
      },
      error: (err) => {
        const msg = err?.message || err?._server_messages || __('Failed to open session');
        frappe.msgprint(msg);
      }
    });
  });

  // Click to copy di panel kiri
  document.querySelectorAll('.session-details .form-group div').forEach((div) => {
    div.addEventListener('click', () => {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(div.textContent).then(() => {
        const originalBg = div.style.background;
        const originalColor = div.style.color;
        div.style.background = '#4CAF50';
        div.style.color = 'white';
        setTimeout(() => {
          div.style.background = originalBg;
          div.style.color = originalColor;
        }, 500);
      });
    });
  });
  }; // End init function

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(); // End IIFE
