/**
 * Waiter Right Panel - Order Cart
 */

import React from 'react'
import { useWaiterContext } from '../context/WaiterContext'
import { OrderCart } from './index'

export function WaiterRightPanel() {
  const {
    cartItems,
    updateQuantity,
    removeItem,
    updateNotes,
    clearCart,
    handleSendToKitchen,
    orderLoading,
    getCartSummary
  } = useWaiterContext()

  const cartSummary = getCartSummary()

  return (
    <>
      <div className="waiter-right-panel">
        <OrderCart
          items={cartItems}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={removeItem}
          onAddNote={updateNotes}
          onClearCart={clearCart}
          onSendToKitchen={handleSendToKitchen}
          loading={orderLoading}
        />
      </div>

      {/* Fixed Bottom Action Bar for Touch Devices */}
      {cartItems.length > 0 && (
        <div className="waiter-action-bar-fixed">
          <div className="cart-summary">
            <div>{cartSummary.totalItems} items</div>
            <div className="total">
              {frappe.format(cartSummary.subtotal, { fieldtype: 'Currency' })}
            </div>
          </div>
          
          <button 
            className="btn-primary"
            disabled={orderLoading || cartItems.length === 0}
            onClick={handleSendToKitchen}
          >
            {orderLoading ? 'Sending...' : `Send to Kitchen (${cartSummary.totalItems})`}
          </button>
        </div>
      )}
    </>
  )
}
