import React from 'react'

/**
 * OrderList Component
 * Sidebar showing pending orders ready for payment
 */
export function OrderList({ orders, selectedOrder, onOrderSelect, loading }) {
  if (loading) {
    return (
      <div className="cashier-order-list">
        <div className="order-list-header">
          <h3>Pending Orders</h3>
        </div>
        <div className="order-list-loading">
          <div className="spinner"></div>
          <p>Loading orders...</p>
        </div>
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="cashier-order-list">
        <div className="order-list-header">
          <h3>Pending Orders</h3>
          <span className="order-count">0</span>
        </div>
        <div className="order-list-empty">
          <div className="empty-icon">📋</div>
          <p>No pending orders</p>
          <small>Orders will appear here when ready for payment</small>
        </div>
      </div>
    )
  }

  return (
    <div className="cashier-order-list">
      <div className="order-list-header">
        <h3>Pending Orders</h3>
        <span className="order-count">{orders.length}</span>
      </div>

      <div className="order-list-items">
        {orders.map(order => (
          <button
            key={order.name}
            className={`order-list-item ${selectedOrder === order.name ? 'active' : ''} ${!order.all_kots_served ? 'not-ready' : ''}`}
            onClick={() => onOrderSelect(order.name)}
          >
            {/* Order Header */}
            <div className="order-item-header">
              <span className="order-table">{order.table || 'Counter'}</span>
              <span className="order-time">{order.time_elapsed}</span>
            </div>

            {/* Order Info */}
            <div className="order-item-info">
              <div className="order-total">
                {frappe.format(order.grand_total, { fieldtype: 'Currency' })}
              </div>
              <div className="order-items-count">
                {order.item_count} item{order.item_count !== 1 ? 's' : ''}
              </div>
            </div>

            {/* KOT Status */}
            <div className="order-item-status">
              {order.all_kots_served ? (
                <span className="status-badge ready">
                  ✓ Ready for Payment
                </span>
              ) : (
                <span className="status-badge preparing">
                  ⏳ Preparing ({order.kots_served}/{order.kots_total})
                </span>
              )}
            </div>

            {/* Customer/Waiter */}
            {order.waiter && (
              <div className="order-item-meta">
                <small>Waiter: {order.waiter}</small>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
