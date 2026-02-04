import { formatCurrency } from '@/shared/utils/formatters'

export function OrderDetailPanel({ order, posMode }) {
  if (!order) {
    return (
      <div className="empty-state">
        <i className="fa fa-receipt empty-icon"></i>
        <h3>No Order Selected</h3>
        <p>Select an order from the list or create a new one</p>
      </div>
    )
  }

  const currentMode = posMode || 'Counter'
  const isTableMode = currentMode === 'Table'
  const isCounterMode = currentMode === 'Counter'

  const formatDateTime = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="order-details">
      <div className="order-details-header">
        <div>
          <h3>{order.name}</h3>
          <div className="order-meta">
            {isTableMode && order.table_name && (
              <span className="order-meta-item">
                <i className="fa fa-utensils"></i>
                Table: {order.table_name}
              </span>
            )}
            {isCounterMode && (
              <span className="order-meta-item">
                <i className="fa fa-cash-register"></i>
                Counter Order
              </span>
            )}
            <span className="order-meta-item">
              <i className="fa fa-clock"></i>
              {formatDateTime(order.creation)}
            </span>
            <span className={`order-status-badge status-${order.status?.toLowerCase()}`}>
              {order.status}
            </span>
          </div>
        </div>
      </div>

      <div className="order-details-body">
        {order.customer && (
          <div className="customer-section">
            <div className="customer-info">
              <div className="customer-name">
                <i className="fa fa-user"></i>
                {order.customer}
              </div>
              {order.customer_phone && (
                <div className="customer-phone">
                  <i className="fa fa-phone"></i>
                  {order.customer_phone}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="order-items-section">
          <h4>Order Items</h4>
          {order.items && order.items.length > 0 ? (
            <div className="order-items-list">
              {order.items.map((item, idx) => {
                const isTemplate = item.has_variants === 1 || item.has_variants === true
                
                return (
                  <div key={idx} className={`order-item ${isTemplate ? 'template-item' : ''}`}>
                    <div className="order-item-name">
                      {item.item_name}
                      {isTemplate && (
                        <span className="template-badge">
                          <i className="fa fa-list"></i> Template
                        </span>
                      )}
                    </div>
                    <div className="order-item-qty">{item.qty}</div>
                    <div className="order-item-price">{formatCurrency(item.rate)}</div>
                    <div className="order-item-total">{formatCurrency(item.amount)}</div>
                    
                    {isTemplate && (
                      <div className="order-item-actions">
                        <button 
                          className="select-variant-btn"
                          onClick={() => window.dispatchEvent(new CustomEvent('selectVariant', { 
                            detail: { itemRow: item.name, itemCode: item.item_code } 
                          }))}
                        >
                          <i className="fa fa-edit"></i> Select Variant
                        </button>
                      </div>
                    )}
                    
                    {item.notes && (
                      <div className="order-item-notes">
                        <i className="fa fa-comment"></i> {item.notes}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="no-items">No items in this order</div>
          )}
        </div>

        <div className="order-totals">
          <div className="total-row">
            <span>Subtotal</span>
            <span>{formatCurrency(order.net_total || order.total)}</span>
          </div>
          
          {order.total_taxes_and_charges > 0 && (
            <div className="total-row">
              <span>Tax</span>
              <span>{formatCurrency(order.total_taxes_and_charges)}</span>
            </div>
          )}
          
          {order.discount_amount > 0 && (
            <div className="total-row">
              <span>Discount</span>
              <span>-{formatCurrency(order.discount_amount)}</span>
            </div>
          )}
          
          <div className="total-row grand-total">
            <span>Grand Total</span>
            <span>{formatCurrency(order.grand_total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
