/**
 * Front-end logic for Create Order page.
 * Renders form fields using Frappe metadata and
 * submits data to imogi_pos.api.orders.create_order.
 */

// store references to order level controls and item row controls
const orderControls = {};
const itemControls = [];

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

    container.appendChild(wrapper);
    const ctrl = frappe.ui.form.make_control({
      df: df,
      parent: wrapper
    });
    ctrl.refresh();
    orderControls[fn] = ctrl;
  });
}

function addItemRow() {
  if (!window.itemMeta) return;
  const tbody = document.querySelector('#items-table tbody');
  const tr = document.createElement('tr');
  const itemDf = window.itemMeta.fields.find(f => f.fieldname === 'item');
  const qtyDf = window.itemMeta.fields.find(f => f.fieldname === 'qty');
  const discDf =
    window.itemMeta.fields.find(f => f.fieldname === 'discount_percentage') ||
    window.itemMeta.fields.find(f => f.fieldname === 'discount');

  const controls = {};

  // Item column using Link control
  const itemTd = document.createElement('td');
  tr.appendChild(itemTd);
  controls.item = frappe.ui.form.make_control({
    df: itemDf || { fieldtype: 'Link', options: 'Item', fieldname: 'item', label: 'Item' },
    parent: itemTd,
    only_input: true
  });
  controls.item.refresh();
  controls.item.$input.attr('placeholder', itemDf ? itemDf.label : 'Item');

  // Qty column control
  const qtyTd = document.createElement('td');
  tr.appendChild(qtyTd);
  controls.qty = frappe.ui.form.make_control({
    df: qtyDf || { fieldtype: 'Float', fieldname: 'qty', label: 'Qty' },
    parent: qtyTd,
    only_input: true
  });
  controls.qty.refresh();
  controls.qty.$input.attr('placeholder', qtyDf ? qtyDf.label : 'Qty');

  // Rate column control
  const rateTd = document.createElement('td');
  tr.appendChild(rateTd);
  controls.rate = frappe.ui.form.make_control({
    df: { fieldtype: 'Currency', fieldname: 'rate', label: 'Price' },
    parent: rateTd,
    only_input: true
  });
  controls.rate.refresh();
  controls.rate.$input.attr('placeholder', 'Price');

  // Discount column control
  const discTd = document.createElement('td');
  tr.appendChild(discTd);
  controls.discount = frappe.ui.form.make_control({
    df: discDf || { fieldtype: 'Float', fieldname: 'discount', label: 'Discount' },
    parent: discTd,
    only_input: true
  });
  controls.discount.refresh();
  controls.discount.$input.attr('placeholder', discDf ? discDf.label : 'Discount');

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
  btn.addEventListener('click', () => {
    const idx = itemControls.indexOf(controls);
    if (idx > -1) itemControls.splice(idx, 1);
    tr.remove();
  });
  removeTd.appendChild(btn);
  tr.appendChild(removeTd);

  tbody.appendChild(tr);
  
  itemControls.push(controls);

  controls.item.$input.on('change', () => {
    const item_code = controls.item.get_value();
    if (!item_code) return;
    frappe.client
      .get_value('Item', item_code, ['image', 'standard_rate'])
      .then(r => {
        if (r && r.message) {
          if (r.message.standard_rate !== undefined) {
            controls.rate.set_value(r.message.standard_rate);
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
  const args = {};
  ['order_type', 'branch', 'pos_profile', 'customer', 'table', 'discount_amount', 'discount_percent', 'promo_code']
    .forEach(key => {
      const ctrl = orderControls[key];
      if (!ctrl) return;
      const val = ctrl.get_value();
      if (val) args[key] = val;
    });
  }

  if (args.order_type === 'Dine-in' && !args.table) {
    frappe.msgprint(__('Table is required for Dine-in orders'));
    return;
  }

  const items = itemControls
    .map(ctrls => {
      const item = ctrls.item.get_value();
      const qty = ctrls.qty.get_value();
      const rate = ctrls.rate.get_value();
      const discount = ctrls.discount.get_value();
      if (item || qty || rate || discount) {
        return { item, qty, rate, discount };
      }
      return null;
    })
    .filter(Boolean);

  if (items.length) {
    args.items = JSON.stringify(items);
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
