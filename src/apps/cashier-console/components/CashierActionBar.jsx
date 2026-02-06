import { useState } from 'react'
import { useCashierContext } from '../context/CashierContext'

export function CashierActionBar() {
  const {
    selectedOrder,
    viewMode,
    setViewMode,
    posMode,
    selectedTable,
    setShowTableSelector,
    setShowPayment,
    setShowSplit,
    creatingOrder,
    isCustomerDisplayOpen,
    openCustomerDisplay,
    closeCustomerDisplay
  } = useCashierContext()
  
  const [showMoreActions, setShowMoreActions] = useState(false)
  const hasOrder = !!selectedOrder
  const isCounterMode = posMode === 'Counter'
  const isTableMode = posMode === 'Table'

  // Action handlers
  const handleNewOrder = () => {
    if (isTableMode) {
      setShowTableSelector(true)
    } else {
      // Counter mode: trigger new order creation
      // This would be handled by the main app logic
      console.log('[CashierActionBar] New order requested')
      window.dispatchEvent(new CustomEvent('createNewOrder'))
    }
  }

  const handleRequestPayment = () => {
    setShowPayment(true)
    setViewMode('payment')
  }

  const handlePrintBill = () => {
    console.log('[CashierActionBar] Print bill requested for order:', selectedOrder?.name)
    // TODO: Implement print bill logic
  }

  const handleSplitBill = () => {
    setShowSplit(true)
    setViewMode('split')
  }

  const handleHoldOrder = () => {
    console.log('[CashierActionBar] Hold order requested for order:', selectedOrder?.name)
    // TODO: Implement hold order logic
  }

  const handleClearOrder = () => {
    console.log('[CashierActionBar] Clear order requested for order:', selectedOrder?.name)
    // TODO: Implement clear order logic
  }

  // Primary CTA Logic (State Machine)
  const getPrimaryCTA = () => {
    if (creatingOrder) {
      return {
        label: 'Creating...',
        icon: 'fa-spinner fa-spin',
        disabled: true,
        onClick: null
      }
    }

    // Table mode: if no table selected, show "Select Table"
    if (isTableMode && !selectedTable) {
      return {
        label: 'Select Table',
        icon: 'fa-chair',
        disabled: false,
        onClick: handleNewOrder
      }
    }

    // If has order and in catalog view, show "Charge"
    if (hasOrder && viewMode === 'catalog') {
      return {
        label: 'Charge',
        icon: 'fa-credit-card',
        disabled: false,
        onClick: handleRequestPayment,
        accent: true
      }
    }

    // Default: New Order
    return {
      label: isCounterMode ? 'New Order' : 'New Table',
      icon: 'fa-plus',
      disabled: false,
      onClick: handleNewOrder
    }
  }

  const primaryCTA = getPrimaryCTA()

  // Secondary actions for overflow menu
  const secondaryActions = [
    {
      label: 'Hold Order',
      icon: 'fa-pause',
      onClick: handleHoldOrder,
      disabled: !hasOrder,
      show: true
    },
    {
      label: 'Clear Order',
      icon: 'fa-trash',
      onClick: handleClearOrder,
      disabled: !hasOrder,
      show: true,
      danger: true
    }
  ]

  return (
    <div className="cashier-action-bar">
      <div className="action-bar-container">
        {/* Left: View Controls */}
        <div className="view-controls-mobile">
          <button
            className={`view-tab ${viewMode === 'orders' ? 'active' : ''}`}
            onClick={() => setViewMode('orders')}
            aria-label="View Orders"
          >
            <i className="fa fa-list"></i>
            <span className="view-tab-label">Orders</span>
          </button>
          <button
            className={`view-tab ${viewMode === 'catalog' ? 'active' : ''}`}
            onClick={() => setViewMode('catalog')}
            disabled={!hasOrder}
            aria-label="View Catalog"
          >
            <i className="fa fa-shopping-cart"></i>
            <span className="view-tab-label">Catalog</span>
          </button>
        </div>

        {/* Center: Quick Actions */}
        <div className="quick-actions">
          <button
            className="action-btn icon-btn"
            onClick={handlePrintBill}
            disabled={!hasOrder}
            title="Print Bill"
            aria-label="Print Bill"
          >
            <i className="fa fa-print"></i>
          </button>

          <button
            className="action-btn icon-btn"
            onClick={handleSplitBill}
            disabled={!hasOrder}
            title="Split Bill"
            aria-label="Split Bill"
          >
            <i className="fa fa-cut"></i>
          </button>

          <button
            className={`action-btn icon-btn ${isCustomerDisplayOpen ? 'active' : ''}`}
            onClick={isCustomerDisplayOpen ? closeCustomerDisplay : openCustomerDisplay}
            title={isCustomerDisplayOpen ? 'Close Customer Display' : 'Open Customer Display'}
            aria-label="Customer Display"
          >
            <i className={`fa ${isCustomerDisplayOpen ? 'fa-eye-slash' : 'fa-desktop'}`}></i>
          </button>

          {/* More Actions Menu */}
          <div className="more-actions-container">
            <button
              className="action-btn icon-btn more-btn"
              onClick={() => setShowMoreActions(!showMoreActions)}
              title="More Actions"
              aria-label="More Actions"
            >
              <i className="fa fa-ellipsis-v"></i>
            </button>

            {showMoreActions && (
              <>
                <div 
                  className="more-actions-overlay" 
                  onClick={() => setShowMoreActions(false)}
                />
                <div className="more-actions-menu">
                  {secondaryActions.filter(a => a.show).map((action, idx) => (
                    <button
                      key={idx}
                      className={`more-action-item ${action.danger ? 'danger' : ''}`}
                      onClick={() => {
                        action.onClick?.()
                        setShowMoreActions(false)
                      }}
                      disabled={action.disabled}
                    >
                      <i className={`fa ${action.icon}`}></i>
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Primary CTA */}
        <button
          className={`action-btn primary-cta ${primaryCTA.accent ? 'accent' : ''}`}
          onClick={primaryCTA.onClick}
          disabled={primaryCTA.disabled}
        >
          <i className={`fa ${primaryCTA.icon}`}></i>
          <span>{primaryCTA.label}</span>
        </button>
      </div>
    </div>
  )
}
