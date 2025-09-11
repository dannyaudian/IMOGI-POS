frappe.ready(() => {
  document.querySelectorAll('.service-card').forEach((link) => {
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
        window.location.href = href;
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
    .dine-in-modal select { width: 100%; padding: 0.5rem; margin-top: 0.25rem; }
    .dine-in-table-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 1rem; }
    .dine-in-table-list .table-item { padding: 0.75rem; font-size: 1.2rem; border: 1px solid #ced4da; background: #e9ecef; border-radius: 4px; cursor: pointer; text-align: center; }
    .dine-in-table-list .no-tables { grid-column: span 3; text-align: center; color: #6c757d; }
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
      <label>Zona</label>
      <select id="dine-in-zone"><option value="">Pilih Zona</option></select>
      <div class="dine-in-table-list" id="dine-in-table-list"></div>
      <div class="dine-in-error" id="dine-in-error"></div>
      <div class="dine-in-footer">
        <button id="dine-in-cancel">Batal</button>
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

  modal.querySelector('#dine-in-cancel').addEventListener('click', () => {
    modal.remove();
  });

  const zoneSelect = document.getElementById('dine-in-zone');
  const tableList = document.getElementById('dine-in-table-list');
  const errorDiv = document.getElementById('dine-in-error');

  zoneSelect.addEventListener('change', () => {
    const zone = zoneSelect.value;
    tableList.innerHTML = '';
    errorDiv.style.display = 'none';

    if (!zone) {
      return;
    }

    frappe.call({
      method: 'frappe.client.get_list',
      args: {
        doctype: 'Restaurant Table',
        fields: ['table_number'],
        filters: { floor: zone, status: 'Available' },
        limit_page_length: 0,
      },
    }).then((r) => {
      const tables = r.message || [];
      if (tables.length === 0) {
        const noTables = document.createElement('div');
        noTables.className = 'no-tables';
        noTables.textContent = 'Tidak ada meja kosong di zona ini';
        tableList.appendChild(noTables);
        return;
      }

      tables.forEach((t) => {
        const div = document.createElement('div');
        div.className = 'table-item';
        div.setAttribute('data-table', t.table_number);
        div.textContent = `Meja ${t.table_number}`;
        div.addEventListener('click', () => {
          localStorage.setItem('imogi_service_type', 'dine_in');
          localStorage.setItem('imogi_table_number', t.table_number);
          localStorage.setItem('imogi_table_zone', zone);
          window.location.href = '/kiosk?service=dine-in';
        });
        tableList.appendChild(div);
      });
    });
  });
}

