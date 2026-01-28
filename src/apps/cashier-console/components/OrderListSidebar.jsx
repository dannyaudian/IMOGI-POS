import { useState } from 'react'

export function OrderListSidebar({ 
  orders = [], 
  selectedOrder, 
  onSelectOrder,
  posMode 
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')

  // Explicitly define mode-specific labels and icons
  const MODE_CONFIG = {
    'Counter': {
      label: 'Counter',
      icon: 'fa-cash-register',
      color: '#ff9800'
    },
    'Table': {
      label: 'Table/Waiter',
      icon: 'fa-utensils',
      color: '#2196f3'
    }
  }

  const currentMode = posMode || 'Counter' // Default to Counter if not specified
  const modeConfig = MODE_CONFIG[currentMode] || MODE_CONFIG['Counter']
  const modeLabel = modeConfig.label
  const modeIcon = modeConfig.icon
  const isCounterMode = currentMode === 'Counter'
  const isTableMode = currentMode === 'Table'

  // Filter orders
  const filteredOrders = orders.filter(order => {
    // Status filter (only for Table mode)
    if (isTableMode && filterStatus !== 'All' && order.status !== filterStatus) {
      return false
    }
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      return (
        order.name?.toLowerCase().includes(search) ||
        order.table_name?.toLowerCase().includes(search) ||
        order.customer?.toLowerCase().includes(search)
      )
    }
    
    return true
  })

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="cashier-sidebar">
      <div className="filter-bar">
        <div className="mode-indicator">
          <i className={`fa ${modeIcon}`}></i>
          <span>{modeLabel} Mode</span>
        </div>
        
        <div className="search-container">
          <input
            type="text"
            placeholder="Search orders..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="search-button">
            <i className="fa fa-search"></i>
          </button>
        </div>
        
        {/* Status filters only for Table mode */}
        {isTableMode && (
          <div className="filter-buttons">
            {['Ready', 'Served', 'All'].map(status => (
              <button
                key={status}
                className={`filter-button ${filterStatus === status ? 'active' : ''}`}
                onClick={() => setFilterStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <div className="order-list">
        {filteredOrders.length === 0 ? (
          <div className="empty-state-sidebar">
            <i className="fa fa-inbox"></i>
            <p>No orders found</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <div
              key={order.name}
              className={`order-card ${selectedOrder?.name === order.name ? 'active' : ''}`}
              onClick={() => onSelectOrder(order)}
            >
              <div className="order-card-header">
                <span className="order-card-number">{order.name}</span>
                <div className="order-card-badges">
                  {/* Order Type Badge */}
                  {order.order_type === 'Self Order' && (
                    <span className="order-card-badge badge-self-order">
                      <i className="fa fa-mobile-alt"></i>
                      Self Order
                    </span>
                  )}
                  {order.order_type === 'Kiosk' && (
                    <span className="order-card-badge badge-kiosk">
                      <i className="fa fa-desktop"></i>
                      Kiosk
                    </span>
                  )}
                  {order.order_type === 'Dine In' && order.table_name && (
                    <span className="order-card-badge badge-table">
                      <i className="fa fa-utensils"></i>
                      {order.table_name}
                    </span>
                  )}
                  {order.order_type === 'Counter' && (
                    <span className="order-card-badge badge-counter">
                      <i className="fa fa-cash-register"></i>
                      Counter
                    </span>
                  )}
                </div>
              </div>
              
              <div className="order-card-info">
                <span>{order.items?.length || 0} items</span>
                <span className="order-card-time">{formatTime(order.creation)}</span>
              </div>
              
              {order.items && order.items.length > 0 && (
                <div className="order-card-items">
                  {order.items.slice(0, 2).map((item, idx) => (
                    <div key={idx}>
                      {item.qty}x {item.item_name}
                    </div>
                  ))}
                  {order.items.length > 2 && (
                    <div className="order-card-more">
                      +{order.items.length - 2} more items
                    </div>
                  )}
                </div>
              )}
              
              <div className="order-card-total">
                <span>Total</span>
                <span>{formatCurrency(order.grand_total)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
