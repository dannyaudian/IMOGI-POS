frappe.ready(() => {
  document.querySelectorAll('.service-link').forEach((link) => {
    const service = link.getAttribute('data-service');

    if (service === 'dine_in') {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        showDineInModal();
      });
      return;
    }

    if (service) {
      link.addEventListener('click', () => {
        localStorage.setItem('imogi_service_type', service);
      });
    }
  });
});

function showDineInModal() {
  if (document.getElementById('dine-in-modal')) return;

  const style = document.createElement('style');
  style.textContent = `
    .dine-in-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .dine-in-modal { background: #fff; padding: 1rem; border-radius: 8px; width: 90%; max-width: 320px; }
    .dine-in-modal h3 { margin-top: 0; margin-bottom: 1rem; font-size: 1.25rem; text-align: center; }
    .dine-in-modal label { display: block; margin-top: 0.5rem; }
    .dine-in-modal select, .dine-in-modal input { width: 100%; padding: 0.5rem; margin-top: 0.25rem; }
    .dine-in-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 1rem; }
    .dine-in-keypad button { padding: 0.75rem; font-size: 1.2rem; border: 1px solid #ced4da; background: #e9ecef; border-radius: 4px; cursor: pointer; }
    .dine-in-keypad button.keypad-clear { grid-column: span 3; background: #ffc107; }
    .dine-in-footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .dine-in-footer button { padding: 0.5rem 1rem; }
    .dine-in-error { color: #dc3545; margin-top: 0.5rem; display: none; }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'dine-in-modal';
  modal.className = 'dine-in-overlay';
  modal.innerHTML = `
    <div class="dine-in-modal">
      <h3>Makan di Tempat</h3>
      <label>Nomor Meja</label>
      <input type="text" id="dine-in-table" readonly>
      <label>Zona</label>
      <select id="dine-in-zone"><option value="">Pilih Zona</option></select>
      <div class="dine-in-keypad">
        <button data-value="1">1</button>
        <button data-value="2">2</button>
        <button data-value="3">3</button>
        <button data-value="4">4</button>
        <button data-value="5">5</button>
        <button data-value="6">6</button>
        <button data-value="7">7</button>
        <button data-value="8">8</button>
        <button data-value="9">9</button>
        <button class="keypad-clear" data-value="clear">Clear</button>
        <button data-value="0">0</button>
      </div>
      <div class="dine-in-error" id="dine-in-error"></div>
      <div class="dine-in-footer">
        <button id="dine-in-cancel">Batal</button>
        <button id="dine-in-continue">Lanjut</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Populate zones
  frappe.call({
    method: 'frappe.client.get_list',
    args: {
      doctype: 'Restaurant Floor',
      fields: ['name'],
      limit_page_length: 0,
    },
  }).then((r) => {
    const zones = r.message || [];
    const select = document.getElementById('dine-in-zone');
    zones.forEach((z) => {
      const opt = document.createElement('option');
      opt.value = z.name;
      opt.textContent = z.name;
      select.appendChild(opt);
    });
  });

  const input = document.getElementById('dine-in-table');
  modal.querySelectorAll('.dine-in-keypad button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-value');
      if (val === 'clear') {
        input.value = '';
      } else {
        input.value += val;
      }
    });
  });

  modal.querySelector('#dine-in-cancel').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('#dine-in-continue').addEventListener('click', () => {
    const tableNumber = input.value;
    const zone = document.getElementById('dine-in-zone').value;
    const errorDiv = document.getElementById('dine-in-error');
    errorDiv.style.display = 'none';

    if (!tableNumber || !zone) {
      errorDiv.textContent = 'Nomor meja dan zona wajib diisi';
      errorDiv.style.display = 'block';
      return;
    }

    frappe.call({
      method: 'frappe.client.get_value',
      args: {
        doctype: 'Restaurant Table',
        filters: { table_number: tableNumber, floor: zone },
        fieldname: ['status'],
      },
    }).then((r) => {
      const data = r.message;
      if (!data) {
        errorDiv.textContent = `Meja ${tableNumber} tidak ditemukan`;
        errorDiv.style.display = 'block';
        return;
      }

      if (data.status && data.status !== 'Available') {
        errorDiv.textContent = `Meja ${tableNumber} sudah digunakan`;
        errorDiv.style.display = 'block';
        return;
      }

      localStorage.setItem('imogi_service_type', 'dine_in');
      localStorage.setItem('imogi_table_number', tableNumber);
      localStorage.setItem('imogi_table_zone', zone);
      window.location.href = '/kiosk?service=dine-in';
    });
  });
}

