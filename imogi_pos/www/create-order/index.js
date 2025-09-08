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
    window.orderMeta = orderMeta;
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
  meta.fields.forEach(df => {
    if (df.fieldtype === 'Table') return;

    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = df.label;
    label.setAttribute('for', df.fieldname);
    wrapper.appendChild(label);

    if (df.fieldtype === 'Select') {
      const select = document.createElement('select');
      select.id = df.fieldname;
      select.name = df.fieldname;
      select.className = 'form-control';
      if (df.reqd) select.required = true;
      (df.options || '').split('\n').forEach(opt => {
        if (!opt) return;
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
      });
      if (df.default) select.value = df.default;
      wrapper.appendChild(select);
    } else if (df.fieldtype === 'Link') {
      const inputWrapper = document.createElement('div');
      wrapper.appendChild(inputWrapper);
      const control = frappe.ui.form.make_control({
        df: df,
        parent: inputWrapper,
        only_input: true
      });
      control.refresh();
    } else {
      const input = document.createElement('input');
      input.id = df.fieldname;
      input.name = df.fieldname;
      input.className = 'form-control';
      if (['Int', 'Float', 'Currency'].includes(df.fieldtype)) {
        input.type = 'number';
      } else if (df.fieldtype === 'Date') {
        input.type = 'date';
      } else {
        input.type = 'text';
      }
      if (df.reqd) input.required = true;
      if (df.default) input.value = df.default;
      wrapper.appendChild(input);
    }

    container.appendChild(wrapper);
  });
}

function addItemRow() {
  if (!window.itemMeta) return;
  const tbody = document.querySelector('#items-table tbody');
  const tr = document.createElement('tr');

  const itemDf = window.itemMeta.fields.find(f => f.fieldname === 'item');
  const qtyDf = window.itemMeta.fields.find(f => f.fieldname === 'qty');
  const rateDf = window.itemMeta.fields.find(f => f.fieldname === 'rate');
  const discDf = window.itemMeta.fields.find(f => f.fieldname === 'discount_percentage') ||
    window.itemMeta.fields.find(f => f.fieldname === 'discount');

  let rateControl;
  let img;

  // Item column using Link control
  const itemTd = document.createElement('td');
  const itemControl = frappe.ui.form.make_control({
    df: Object.assign({}, itemDf || { fieldtype: 'Link', label: 'Item', options: 'Item' }, {
      fieldname: 'items_item',
      onchange: function () {
        const item_code = this.get_value();
        if (!item_code) return;
        frappe.client
          .get_value('Item', item_code, ['image', 'standard_rate'])
          .then(r => {
            if (r && r.message) {
              if (r.message.standard_rate !== undefined && rateControl) {
                rateControl.set_value(r.message.standard_rate);
              }
              if (r.message.image && img) {
                img.src = r.message.image;
              }
            }
          })
          .catch(err => {
            console.error('Error fetching item details', err);
            frappe.msgprint(__('Unable to fetch item details'));
          });
      }
    }),
    parent: itemTd,
    render_input: true
  });
  itemControl.$input.attr('name', 'items_item');
  tr.appendChild(itemTd);

  // Qty column control
  const qtyTd = document.createElement('td');
  const qtyControl = frappe.ui.form.make_control({
    df: Object.assign({}, qtyDf || { fieldtype: 'Float', label: 'Qty' }, {
      fieldname: 'items_qty'
    }),
    parent: qtyTd,
    render_input: true
  });
  qtyControl.$input.attr('name', 'items_qty');
  tr.appendChild(qtyTd);

  // Rate column control
  const rateTd = document.createElement('td');
  rateControl = frappe.ui.form.make_control({
    df: Object.assign({}, rateDf || { fieldtype: 'Currency', label: 'Rate' }, {
      fieldname: 'items_rate'
    }),
    parent: rateTd,
    render_input: true
  });
  rateControl.$input.attr('name', 'items_rate');
  tr.appendChild(rateTd);

  // Discount column control
  const discTd = document.createElement('td');
  const discControl = frappe.ui.form.make_control({
    df: Object.assign({}, discDf || { fieldtype: 'Float', label: 'Discount' }, {
      fieldname: 'items_discount'
    }),
    parent: discTd,
    render_input: true
  });
  discControl.$input.attr('name', 'items_discount');
  tr.appendChild(discTd);

  const imgTd = document.createElement('td');
  img = document.createElement('img');
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
}

function submitOrder() {
  const form = document.getElementById('create-order-form');
  const formData = new FormData(form);

  const args = {};
  if (window.orderMeta) {
    window.orderMeta.fields.forEach(df => {
      if (df.fieldtype === 'Table') return;
      const val = formData.get(df.fieldname);
      if (val) args[df.fieldname] = val;
    });
  }

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
