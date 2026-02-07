/**
 * Order Sidebar Component
 * 
 * Left sidebar containing:
 * - Order list for current mode
 * - Multi-channel order tabs (if enabled)
 * - Order creation button
 * - Search/filter
 */

import React from 'react'
import { useCashierContext } from '../context/CashierContext'
import { OrderListSidebar } from './OrderListSidebar'

export function CashierOrderSidebar() {
  const {
    orders,
    ordersLoading,
    ordersError,
    selfOrders,
    kioskOrders,
    selectedOrder,
    setSelectedOrder,
    posMode,
    creatingOrder,
    setShowTableSelector,
    setVariantPickerContext,
    setShowVariantPicker,
    profileData
  } = useCashierContext()

  // Handle new order creation
  const handleNewOrder = () => {
    if (posMode === 'Table') {
      // Show table selector for Dine In orders
      setShowTableSelector(true)
    } else {
      // Counter mode: dispatch event to create new draft order
      window.dispatchEvent(new CustomEvent('createNewOrder'))
    }
  }

  return (
    <aside className="cashier-sidebar">
      <div className="cashier-sidebar-header">
        <h2>Orders</h2>
        <button
          className="cashier-btn-new-order"
          onClick={handleNewOrder}
          disabled={creatingOrder}
          title="Create new order"
        >
          <i className="fa-solid fa-plus"></i> New
        </button>
      </div>

      {/* Order list or loading state */}
      <div className="cashier-sidebar-content">
        {ordersLoading ? (
          <div className="cashier-loading">
            <i className="fa-solid fa-spinner fa-spin"></i>
            Loading orders...
          </div>
        ) : ordersError ? (
          <div className="cashier-error">
            <i className="fa-solid fa-exclamation-triangle"></i>
            Failed to load orders
          </div>
        ) : (
          <OrderListSidebar
            orders={orders}
            selectedOrder={selectedOrder}
            onSelectOrder={setSelectedOrder}
            selfOrders={selfOrders}
            kioskOrders={kioskOrders}
            multiChannelEnabled={
              profileData?.imogi_enable_self_order === 1 ||
              profileData?.imogi_enable_kiosk === 1
            }
          />
        )}
      </div>
    </aside>
  )
}
