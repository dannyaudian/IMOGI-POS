/**
 * Cashier Main Content Area Component
 * 
 * Handles rendering of different views:
 * - Orders (default)
 * - Catalog (item selection)
 * - Payment
 * - Split bill
 * - Shift summary
 * - Close shift
 */

import React from 'react'
import { useCashierContext } from '../context/CashierContext'
import { OrderDetailPanel } from './OrderDetailPanel'
import { CatalogView } from './CatalogView'
import { PaymentView } from './PaymentView'
import { SplitBillView } from './SplitBillView'
import { ShiftSummaryView } from './ShiftSummaryView'
import { CloseShiftView } from './CloseShiftView'

export function CashierMainContent() {
  const {
    viewMode,
    setViewMode,
    selectedOrder,
    showPayment,
    showSplit,
    showSummary,
    showCloseShift,
    orders,
    posMode,
    posProfile,
    branch,
    onAddItemToOrder,
    pendingOrderType
  } = useCashierContext()

  // Render empty state if no order selected and not in draft mode
  if (!selectedOrder && !pendingOrderType && viewMode === 'orders') {
    return (
      <main className="cashier-main">
        <div className="cashier-empty-state">
          <i className="fa-solid fa-inbox fa-3x"></i>
          <h2>No order selected</h2>
          <p>Select an order from the list or create a new one</p>
        </div>
      </main>
    )
  }

  return (
    <main className="cashier-main">
      {/* Orders view - Order detail panel */}
      {viewMode === 'orders' && selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onAddItem={() => setViewMode('catalog')}
          onPayment={() => setViewMode('payment')}
          onSplit={() => setViewMode('split')}
          posMode={posMode}
        />
      )}

      {/* Catalog view - Item selection */}
      {viewMode === 'catalog' && (
        <CatalogView
          posProfile={posProfile}
          branch={branch}
          menuChannel="Cashier"
          onSelectItem={onAddItemToOrder}
        />
      )}

      {/* Payment view */}
      {viewMode === 'payment' && selectedOrder && (
        <PaymentView
          order={selectedOrder}
          onBack={() => setViewMode('orders')}
          onPaymentSuccess={() => {
            setViewMode('orders')
          }}
        />
      )}

      {/* Split bill view */}
      {viewMode === 'split' && selectedOrder && (
        <SplitBillView
          order={selectedOrder}
          onBack={() => setViewMode('orders')}
          onConfirm={() => setViewMode('orders')}
        />
      )}

      {/* Shift summary view */}
      {showSummary && (
        <ShiftSummaryView
          isOpen={showSummary}
          onClose={() => {
            const closeShift = window.confirm(
              'Do you want to proceed to close shift?'
            )
            if (closeShift) {
              setViewMode('orders')
            }
          }}
        />
      )}

      {/* Close shift view */}
      {showCloseShift && (
        <CloseShiftView
          isOpen={showCloseShift}
          onClose={() => setViewMode('orders')}
          onSuccess={() => {
            // Redirect or refresh after successful close
            window.location.reload()
          }}
        />
      )}
    </main>
  )
}
