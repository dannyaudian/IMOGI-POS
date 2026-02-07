import { useState } from 'react'
import { useCashierContext } from '../context/CashierContext'
import { apiCall } from '@/shared/utils/api'
import { API } from '@/shared/api/constants'

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

  const handlePrintBill = async () => {
    if (!selectedOrder?.name) {
      console.warn('[CashierActionBar] Cannot print: no order selected')
      return
    }

    try {
      console.log('[CashierActionBar] Printing bill for order:', selectedOrder.name)
      await apiCall(API.PRINT_BILL, { 
        pos_order: selectedOrder.name 
      })
      
      // Show success message
      if (typeof frappe !== 'undefined' && frappe.show_alert) {
        frappe.show_alert({ message: 'Bill sent to printer', indicator: 'green' })
      }
    } catch (err) {
      console.error('[CashierActionBar] Failed to print bill:', err)
      if (typeof frappe !== 'undefined' && frappe.show_alert) {
        frappe.show_alert({ 
          message: 'Failed to print bill: ' + (err.message || 'Unknown error'), 
          indicator: 'red' 
        })
      } else {
        alert('Failed to print bill: ' + (err.message || 'Unknown error'))
      }
    }
  }

  const handleSplitBill = () => {
    setShowSplit(true)
    setViewMode('split')
  }

  const handleHoldOrder = async () => {
    if (!selectedOrder?.name) {
      console.warn('[CashierActionBar] Cannot hold: no order selected')
      return
    }

    try {
      console.log('[CashierActionBar] Holding order:', selectedOrder.name)
      // Save order with workflow_state = On Hold
      await apiCall(API.UPDATE_ORDER, { 
        pos_order: selectedOrder.name,
        workflow_state: 'On Hold'
      })
      
      if (typeof frappe !== 'undefined' && frappe.show_alert) {
        frappe.show_alert({ message: 'Order held', indicator: 'blue' })
      }
      
      // Trigger order refresh
      window.dispatchEvent(new CustomEvent('refreshOrder'))
    } catch (err) {
      console.error('[CashierActionBar] Failed to hold order:', err)
      if (typeof frappe !== 'undefined' && frappe.show_alert) {
        frappe.show_alert({ 
          message: 'Failed to hold order: ' + (err.message || 'Unknown error'), 
          indicator: 'red' 
        })
      } else {
        alert('Failed to hold order: ' + (err.message || 'Unknown error'))
      }
    }
  }

  const handleClearOrder = async () => {
    if (!selectedOrder?.name) {
      console.warn('[CashierActionBar] Cannot clear: no order selected')
      return
    }

    // Confirm before clearing
    const confirmed = confirm(
      `Clear order ${selectedOrder.name}?\n\nThis will remove all items and cancel the order. This action cannot be undone.`
    )
    
    if (!confirmed) {
      console.log('[CashierActionBar] Clear order cancelled by user')
      return
    }

    try {
      console.log('[CashierActionBar] Clearing order:', selectedOrder.name)
      
      // Cancel the order (this will trigger cleanup)
      await apiCall('imogi_pos.api.orders.cancel_order', { 
        pos_order: selectedOrder.name
      })
      
      if (typeof frappe !== 'undefined' && frappe.show_alert) {
        frappe.show_alert({ message: 'Order cleared', indicator: 'orange' })
      }
      
      // Trigger new order creation
      window.dispatchEvent(new CustomEvent('createNewOrder'))
    } catch (err) {
      console.error('[CashierActionBar] Failed to clear order:', err)
      if (typeof frappe !== 'undefined' && frappe.show_alert) {
        frappe.show_alert({ 
          message: 'Failed to clear order: ' + (err.message || 'Unknown error'), 
          indicator: 'red' 
        })
      } else {
        alert('Failed to clear order: ' + (err.message || 'Unknown error'))
      }
    }
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
