import { useState } from 'react'
import PropTypes from 'prop-types'
import { formatCurrency } from '@/shared/utils/formatters'

export function OrderListSidebar({ 
  orders = [], 
  selectedOrder, 
  onSelectOrder,
  onClaimOrder,
  claimedOrders = {},
  posMode,
  isMultiSession = false
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [claimingOrderId, setClaimingOrderId] = useState(null)
  const [claimError, setClaimError] = useState(null)
  const [showRequestedOnly, setShowRequestedOnly] = useState(false)

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
    // Restaurant flow: Filter for requested bills only
    if (showRequestedOnly) {
      if (!order.request_payment) {
        return false
      }
    }
    
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

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const handleClaimOrder = async (e, order) => {
    e.stopPropagation()
    
    if (!onClaimOrder) {
      console.warn('[OrderListSidebar] onClaimOrder handler not provided')
      return
    }

    setClaimingOrderId(order.name)
    setClaimError(null)

    try {
      await onClaimOrder(order)
      setClaimingOrderId(null)
    } catch (error) {
      console.error('[OrderListSidebar] Error claiming order:', error)
      setClaimError(error.message || 'Failed to claim order')
      setClaimingOrderId(null)
    }
  }

  const getCurrentUser = () => {
    return frappe?.session?.user || 'unknown'
  }

  const isOrderClaimed = (order) => {
    return order.claimed_by && order.claimed_by !== ''
  }

  const isOrderClaimedByMe = (order) => {
    return order.claimed_by === getCurrentUser()
  }

  const isOrderClaimedByOther = (order) => {
    return isOrderClaimed(order) && !isOrderClaimedByMe(order)
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
          <>
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
            
            {/* Restaurant Flow: Requested Bills toggle */}
            <div className="requested-bills-toggle">
              <button
                className={`filter-button ${showRequestedOnly ? 'active' : ''}`}
                onClick={() => setShowRequestedOnly(!showRequestedOnly)}
              >
                <i className="fa fa-receipt"></i> 
                Requested Bills Only
                {showRequestedOnly && ` (${filteredOrders.length})`}
              </button>
            </div>
          </>
        )}
      </div>
      
      <div className="order-list">
        {filteredOrders.length === 0 ? (
          <div className="empty-state-sidebar">
            <i className="fa fa-inbox"></i>
            <p>No orders found</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const isClaimed = isOrderClaimed(order)
            const isClaimedByMe = isOrderClaimedByMe(order)
            const isClaimedByOther = isOrderClaimedByOther(order)
            const canClaim = !isClaimed || isClaimedByMe
            
            return (
            <div
              key={order.name}
              className={`order-card ${selectedOrder?.name === order.name ? 'active' : ''} ${isClaimedByOther ? 'order-claimed-other' : ''}`}
              onClick={() => !isClaimedByOther && onSelectOrder(order)}
              title={isClaimedByOther ? `Claimed by ${order.claimed_by}` : ''}
            >
              <div className="order-card-header">
                <span className="order-card-number">{order.name}</span>
                <div className="order-card-badges">
                  {/* Restaurant Flow: Bill Requested Badge */}
                  {order.request_payment && !order.paid_at && (
                    <span className="order-card-badge badge-bill-requested">
                      <i className="fa fa-receipt"></i>
                      Bill Requested
                    </span>
                  )}
                  
                  {/* Claim Status Badge (Multi-Session) */}
                  {isMultiSession && isClaimed && (
                    <span className={`order-card-badge ${isClaimedByMe ? 'badge-claimed-by-me' : 'badge-claimed-by-other'}`}>
                      <i className={`fa ${isClaimedByMe ? 'fa-check-circle' : 'fa-lock'}`}></i>
                      {isClaimedByMe ? 'Claimed' : 'Locked'}
                    </span>
                  )}
                  
                  {/* Restaurant Flow: Claim Button for Bill Requested Orders */}
                  {order.request_payment && !isClaimed && (
                    <button
                      className="order-card-claim-btn btn-claim-primary"
                      onClick={(e) => handleClaimOrder(e, order)}
                      disabled={claimingOrderId === order.name}
                      title="Claim order for payment"
                    >
                      <i className={`fa ${claimingOrderId === order.name ? 'fa-spinner fa-spin' : 'fa-hand-holding-usd'}`}></i>
                      Claim for Payment
                    </button>
                  )}
                  
                  {/* Claim Button (Multi-Session, non-requested orders) */}
                  {isMultiSession && !isClaimed && !order.request_payment && (
                    <button
                      className="order-card-claim-btn"
                      onClick={(e) => handleClaimOrder(e, order)}
                      disabled={claimingOrderId === order.name}
                      title="Claim this order for processing"
                    >
                      <i className={`fa ${claimingOrderId === order.name ? 'fa-spinner fa-spin' : 'fa-lock-open'}`}></i>
                      Claim
                    </button>
                  )}
                  
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
            )
          })
        )}
      </div>
    </div>
  )
}

OrderListSidebar.propTypes = {
  orders: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string,
    table_name: PropTypes.string,
    status: PropTypes.string,
    grand_total: PropTypes.number,
    requested_payment: PropTypes.number,
  })),
  selectedOrder: PropTypes.object,
  onSelectOrder: PropTypes.func.isRequired,
  onClaimOrder: PropTypes.func,
  claimedOrders: PropTypes.object,
  posMode: PropTypes.string,
  isMultiSession: PropTypes.bool,
}
