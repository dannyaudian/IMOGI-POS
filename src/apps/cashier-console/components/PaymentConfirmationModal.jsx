import React from 'react'
import PropTypes from 'prop-types'
import { formatCurrency } from '@/shared/utils/formatters'

/**
 * PaymentConfirmationModal - Konfirmasi sebelum proses payment
 * Menampilkan breakdown amount dan meminta konfirmasi user
 */
export function PaymentConfirmationModal({
  isOpen,
  order,
  paymentMethod,
  cashAmount,
  onConfirm,
  onCancel
}) {
  if (!isOpen) return null

  const total = order?.grand_total || 0
  const cash = parseFloat(cashAmount) || 0
  const change = cash - total
  const isCash = paymentMethod?.mode_of_payment === 'Cash'

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel()
    } else if (e.key === 'Enter') {
      onConfirm()
    }
  }

  return (
    <div 
      className="payment-confirmation-overlay" 
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-confirmation-title"
    >
      <div 
        className="payment-confirmation-dialog" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="payment-confirmation-header">
          <i className="fa-solid fa-circle-check payment-confirmation-icon"></i>
          <h2 id="payment-confirmation-title">Confirm Payment</h2>
        </div>

        <div className="payment-confirmation-body">
          <div className="payment-info-grid">
            <div className="payment-info-row">
              <span className="payment-label">Order Number:</span>
              <span className="payment-value">{order?.name}</span>
            </div>

            {order?.table_name && (
              <div className="payment-info-row">
                <span className="payment-label">Table:</span>
                <span className="payment-value">{order.table_name}</span>
              </div>
            )}

            <div className="payment-info-row">
              <span className="payment-label">Payment Method:</span>
              <span className="payment-value payment-method">
                {paymentMethod?.mode_of_payment || 'Unknown'}
              </span>
            </div>

            <div className="payment-divider"></div>

            <div className="payment-info-row">
              <span className="payment-label">Total Amount:</span>
              <span className="payment-value payment-amount">
                {formatCurrency(total)}
              </span>
            </div>

            {isCash && (
              <>
                <div className="payment-info-row">
                  <span className="payment-label">Cash Received:</span>
                  <span className="payment-value payment-cash">
                    {formatCurrency(cash)}
                  </span>
                </div>

                <div className="payment-info-row payment-change-row">
                  <span className="payment-label">Change:</span>
                  <span className="payment-value payment-change">
                    {formatCurrency(change >= 0 ? change : 0)}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="payment-confirmation-warning">
            <i className="fa-solid fa-info-circle"></i>
            <p>This action will process the payment and cannot be undone.</p>
          </div>
        </div>

        <div className="payment-confirmation-footer">
          <button 
            className="cashier-btn cashier-btn-secondary"
            onClick={onCancel}
            aria-label="Cancel payment"
          >
            <i className="fa-solid fa-times"></i>
            Cancel
          </button>
          <button 
            className="cashier-btn cashier-btn-primary cashier-btn-confirm"
            onClick={onConfirm}
            aria-label="Confirm payment"
            autoFocus
          >
            <i className="fa-solid fa-check"></i>
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  )
}

PaymentConfirmationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  order: PropTypes.shape({
    name: PropTypes.string,
    table_name: PropTypes.string,
    grand_total: PropTypes.number,
  }),
  paymentMethod: PropTypes.shape({
    mode_of_payment: PropTypes.string,
  }),
  cashAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
}

PaymentConfirmationModal.defaultProps = {
  order: null,
  paymentMethod: null,
  cashAmount: 0,
}
