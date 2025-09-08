/**
 * Front-end logic for Create Order page.
 * Renders form fields using Frappe metadata and
 * submits data to imogi_pos.api.orders.create_order.
 */

async function fetchMeta(doctype) {
  try {
    const r = await frappe.call({
      method: 'imogi_pos.api.utils.get_meta',
      args: { doctype }
    });
    return r.message;
  } catch (e) {
    console.error(e);
    frappe.msgprint(__('Unable to load metadata. Please refresh the page.'));
    throw e;
  }
}

async function init() {
  const orderMeta = await fetchMeta('POS Order');
  if (orderMeta) {
    renderOrderFields(orderMeta);
    const itemsField = orderMeta.fields.find(f => f.fieldname === 'items');
    if (itemsField) {
      window.itemMeta = await fetchMeta(itemsField.options);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('add-item').addEventListener('click', addItemRow);

  document.getElementById('create-order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitOrder();
  });
});

function renderOrderFields(meta) {
  const container = document.getElementById('order-fields');
  const fields = ['order_type', 'branch', 'pos_profile', 'customer', 'table', 'discount_amount', 'discount_percent', 'promo_code'];
  fields.forEach(fn => {
    const df = meta.fields.find(f => f.fieldname === fn);
    if (!df) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = df.label;
    label.setAttribute('for', fn);
    const input = document.createElement('input');
    input.id = fn;
    input.name = fn;
    input.className = 'form-control';
    input.type = df.fieldtype === 'Int' || df.fieldtype === 'Float' ? 'number' : 'text';
    if (df.reqd) input.required = true;
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    container.appendChild(wrapper);
  });
}

function addItemRow() {
  if (!window.itemMeta) return;
  const tbody = document.querySelector('#items-table tbody');
  const tr = document.createElement('tr');

  const itemDf = window.itemMeta.fields.find(f => f.fieldname === 'item');
  const qtyDf = window.itemMeta.fields.find(f => f.fieldname === 'qty');
  const discDf = window.itemMeta.fields.find(f => f.fieldname === 'discount_percentage') || window.itemMeta.fields.find(f => f.fieldname === 'discount');

  const itemTd = document.createElement('td');
  const itemInput = document.createElement('input');
  itemInput.name = 'items_item';
  itemInput.className = 'form-control';
  itemInput.placeholder = itemDf ? itemDf.label : 'Item';
  itemTd.appendChild(itemInput);
  tr.appendChild(itemTd);

  const qtyTd = document.createElement('td');
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.name = 'items_qty';
  qtyInput.className = 'form-control';
  qtyInput.placeholder = qtyDf ? qtyDf.label : 'Qty';
  qtyTd.appendChild(qtyInput);
  tr.appendChild(qtyTd);

  const rateTd = document.createElement('td');
  const rateInput = document.createElement('input');
  rateInput.type = 'number';
  rateInput.name = 'items_rate';
  rateInput.className = 'form-control';
  rateInput.placeholder = 'Price';
  rateTd.appendChild(rateInput);
  tr.appendChild(rateTd);

  const discTd = document.createElement('td');
  const discInput = document.createElement('input');
  discInput.type = 'number';
  discInput.name = 'items_discount';
  discInput.className = 'form-control';
  discInput.placeholder = discDf ? discDf.label : 'Discount';
  discTd.appendChild(discInput);
  tr.appendChild(discTd);

  const imgTd = document.createElement('td');
  const img = document.createElement('img');
  img.style.maxWidth = '50px';
  img.style.maxHeight = '50px';
  imgTd.appendChild(img);
  tr.appendChild(imgTd);

  const removeTd = document.createElement('td');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '×';
  btn.className = 'btn btn-default';
  btn.addEventListener('click', () => tr.remove());
  removeTd.appendChild(btn);
  tr.appendChild(removeTd);

  tbody.appendChild(tr);

  itemInput.addEventListener('change', () => {
    const item_code = itemInput.value;
    if (!item_code) return;
    frappe.client
      .get_value('Item', item_code, ['image', 'standard_rate'])
      .then(r => {
        if (r && r.message) {
          if (r.message.standard_rate !== undefined) {
            rateInput.value = r.message.standard_rate;
          }
          if (r.message.image) {
            img.src = r.message.image;
          }
        }
      })
      .catch(err => {
        console.error('Error fetching item details', err);
        frappe.msgprint(__('Unable to fetch item details'));
      });
  });
}

function submitOrder() {
  const form = document.getElementById('create-order-form');
  const formData = new FormData(form);

  const args = {};
  ['order_type', 'branch', 'pos_profile', 'customer', 'table', 'discount_amount', 'discount_percent', 'promo_code']
    .forEach(key => {
      const val = formData.get(key);
      if (val) args[key] = val;
    });

  const items = [];
  document.querySelectorAll('#items-table tbody tr').forEach(tr => {
    const item = tr.querySelector('input[name="items_item"]').value;
    const qty = tr.querySelector('input[name="items_qty"]').value;
    const rate = tr.querySelector('input[name="items_rate"]').value;
    const discount = tr.querySelector('input[name="items_discount"]').value;
    if (item || qty || discount || rate) {
      items.push({ item, qty, discount, rate });
    }
  });
  if (items.length) {
    args.items = items;
  }

  if (args.items) {
    args.items = JSON.stringify(args.items);
  }

  frappe.call({
    method: 'imogi_pos.api.orders.create_order',
    args: args
  }).then(r => {
    if (r && r.message) {
      frappe.msgprint(__('Order created successfully'));
      window.location.href = '/cashier-console';
    }
  });
}
