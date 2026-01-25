import React from 'react'

/**
 * OrderDetails Component
 * Display complete order information for checkout
 */
export function OrderDetails({ order, kots, table, customer, loading }) {
  if (loading) {
    return (
      <div className="cashier-order-details">
        <div className="order-details-loading">
          <div className="spinner"></div>
          <p>Loading order details...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="cashier-order-details">
        <div className="order-details-empty">
          <div className="empty-icon">📄</div>
          <h3>No Order Selected</h3>
          <p>Select an order from the list to view details</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cashier-order-details">
      {/* Header */}
      <div className="order-details-header">
        <div className="order-number">
          <h2>Order #{order.name}</h2>
          <span className="order-date">{frappe.datetime.get_datetime_as_string(order.creation)}</span>
        </div>
        {table && (
          <div className="order-table-info">
            <span className="table-badge">{table.name}</span>
            {table.capacity && <small>{table.capacity} seats</small>}
          </div>
        )}
      </div>

      {/* Customer Info */}
      {customer && (
        <div className="order-customer-info">
          <div className="customer-name">
            <strong>{customer.customer_name}</strong>
          </div>
          {customer.mobile_no && (
            <div className="customer-phone">
              📞 {customer.mobile_no}
            </div>
          )}
        </div>
      )}

      {/* Items List */}
      <div className="order-items-section">
        <h3>Order Items</h3>
        <div className="order-items-list">
          {order.items && order.items.map((item, idx) => (
            <div key={idx} className="order-item-row">
              <div className="item-info">
                <div className="item-name">{item.item_name}</div>
                {item.description && (
                  <div className="item-description">{item.description}</div>
                )}
                <div className="item-qty">Qty: {item.qty}</div>
              </div>
              <div className="item-amount">
                <div className="item-rate">{frappe.format(item.rate, { fieldtype: 'Currency' })}</div>
                <div className="item-total">{frappe.format(item.amount, { fieldtype: 'Currency' })}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KOT Status */}
      {kots && kots.length > 0 && (
        <div className="order-kots-section">
          <h4>Kitchen Status</h4>
          <div className="kots-list">
            {kots.map(kot => (
              <div key={kot.name} className={`kot-item ${kot.workflow_state.toLowerCase()}`}>
                <div className="kot-station">{kot.station}</div>
                <div className="kot-status">
                  <span className={`status-dot ${kot.workflow_state.toLowerCase()}`}></span>
                  {kot.workflow_state}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="order-totals">
        <div className="total-row">
          <span>Subtotal</span>
          <span>{frappe.format(order.total || 0, { fieldtype: 'Currency' })}</span>
        </div>
        
        {order.taxes && order.taxes.length > 0 && order.taxes.map((tax, idx) => (
          <div key={idx} className="total-row tax-row">
            <span>{tax.description}</span>
            <span>{frappe.format(tax.tax_amount, { fieldtype: 'Currency' })}</span>
          </div>
        ))}

        <div className="total-row grand-total">
          <span>Grand Total</span>
          <span>{frappe.format(order.grand_total, { fieldtype: 'Currency' })}</span>
        </div>
      </div>

      {/* Order Notes */}
      {order.notes && (
        <div className="order-notes">
          <h4>Order Notes</h4>
          <p>{order.notes}</p>
        </div>
      )}
    </div>
  )
}
