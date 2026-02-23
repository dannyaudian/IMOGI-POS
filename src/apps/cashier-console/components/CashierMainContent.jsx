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
import { formatCurrency } from '@/shared/utils/formatters'

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
    pendingOrderType,
    localCartItems,
    clearLocalCart,
    onChargeLocalCart,
    onAfterPayment
  } = useCashierContext()

  const isCounterDraft = posMode === 'Counter' && !selectedOrder && pendingOrderType === 'POS'
  const cartCount = localCartItems?.reduce((sum, i) => sum + i.qty, 0) || 0
  const cartTotal = localCartItems?.reduce((sum, i) => sum + (i.rate * i.qty), 0) || 0

  // Render empty state if no order selected and not in draft mode
  if (!selectedOrder && !pendingOrderType && !localCartItems?.length && viewMode === 'orders') {
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

      {/* Draft cart panel - Counter mode, orders view, no confirmed order yet */}
      {viewMode === 'orders' && !selectedOrder && localCartItems?.length > 0 && (
        <div className="draft-cart-panel">
          <div className="draft-cart-header">
            <h3>Keranjang</h3>
            <button className="btn-link draft-cart-clear" onClick={clearLocalCart}>
              Hapus semua
            </button>
          </div>
          <div className="draft-cart-items">
            {localCartItems.map(item => (
              <div key={item.item_code} className="draft-cart-item">
                <span className="draft-cart-item-name">{item.item_name}</span>
                <span className="draft-cart-item-qty">x{item.qty}</span>
                <span className="draft-cart-item-total">{formatCurrency(item.rate * item.qty)}</span>
              </div>
            ))}
          </div>
          <div className="draft-cart-footer">
            <div className="draft-cart-total">
              <span>Total</span>
              <span className="draft-cart-total-amount">{formatCurrency(cartTotal)}</span>
            </div>
            <button className="btn-charge-cart" onClick={onChargeLocalCart}>
              <i className="fa fa-credit-card"></i>
              Charge ({cartCount} item)
            </button>
          </div>
        </div>
      )}

      {/* Catalog view - Item selection */}
      {viewMode === 'catalog' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <CatalogView
            posProfile={posProfile}
            branch={branch}
            menuChannel="Cashier"
            onSelectItem={onAddItemToOrder}
          />
          {/* Cart strip - visible while selecting items in Counter draft mode */}
          {isCounterDraft && cartCount > 0 && (
            <div className="local-cart-strip">
              <span className="local-cart-strip-info">
                <strong>{cartCount}</strong> item &middot; {formatCurrency(cartTotal)}
              </span>
              <button className="local-cart-strip-clear btn-link" onClick={clearLocalCart}>
                Hapus
              </button>
            </div>
          )}
        </div>
      )}

      {/* Payment view */}
      {viewMode === 'payment' && selectedOrder && (
        <PaymentView
          order={selectedOrder}
          onBack={() => setViewMode('orders')}
          onPaymentSuccess={onAfterPayment}
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
