import React, { useState, useEffect } from 'react'

/**
 * PaymentPanel Component
 * Handle payment method selection and amount entry
 */
export function PaymentPanel({ 
  order, 
  paymentMethods, 
  onProcessPayment, 
  processing,
  disabled 
}) {
  const [selectedMethod, setSelectedMethod] = useState(null)
  const [amountPaid, setAmountPaid] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [changeAmount, setChangeAmount] = useState(0)

  // Set default payment method
  useEffect(() => {
    if (paymentMethods && paymentMethods.length > 0 && !selectedMethod) {
      const cashMethod = paymentMethods.find(m => m.type === 'Cash')
      setSelectedMethod(cashMethod || paymentMethods[0])
    }
  }, [paymentMethods, selectedMethod])

  // Auto-set amount to grand total
  useEffect(() => {
    if (order && !amountPaid) {
      setAmountPaid(order.grand_total.toString())
    }
  }, [order, amountPaid])

  // Calculate change
  useEffect(() => {
    if (order && amountPaid) {
      const paid = parseFloat(amountPaid) || 0
      const change = paid - order.grand_total
      setChangeAmount(change > 0 ? change : 0)
    }
  }, [amountPaid, order])

  const handleProcessPayment = () => {
    if (!selectedMethod || !amountPaid) return

    const paid = parseFloat(amountPaid)
    if (paid < order.grand_total) {
      frappe.show_alert({
        message: 'Amount paid is less than total',
        indicator: 'red'
      })
      return
    }

    onProcessPayment({
      mode_of_payment: selectedMethod.name,
      paid_amount: paid,
      reference_no: referenceNo,
      change_amount: changeAmount
    })
  }

  const quickAmounts = [
    order?.grand_total,
    Math.ceil(order?.grand_total / 50000) * 50000,
    Math.ceil(order?.grand_total / 100000) * 100000
  ].filter((v, i, a) => v && a.indexOf(v) === i) // Unique values

  if (!order) {
    return (
      <div className="cashier-payment-panel">
        <div className="payment-disabled">
          <p>Select an order to process payment</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cashier-payment-panel">
      {/* Order Summary */}
      <div className="payment-summary">
        <h3>Payment</h3>
        <div className="payment-total">
          <span>Total Amount</span>
          <span className="total-amount">
            {frappe.format(order.grand_total, { fieldtype: 'Currency' })}
          </span>
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="payment-methods">
        <label>Payment Method</label>
        <div className="payment-method-buttons">
          {paymentMethods && paymentMethods.map(method => (
            <button
              key={method.name}
              className={`payment-method-btn ${selectedMethod?.name === method.name ? 'active' : ''}`}
              onClick={() => setSelectedMethod(method)}
              disabled={disabled}
            >
              {method.type === 'Cash' && '💵'}
              {method.type === 'Bank' && method.is_qris && '📱'}
              {method.type === 'Bank' && !method.is_qris && '💳'}
              <span>{method.mode_of_payment}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Amount Entry */}
      <div className="payment-amount-entry">
        <label>Amount Tendered</label>
        <input
          type="number"
          className="amount-input"
          value={amountPaid}
          onChange={(e) => setAmountPaid(e.target.value)}
          placeholder="Enter amount"
          disabled={disabled}
          min={order.grand_total}
          step="1000"
        />

        {/* Quick Amount Buttons */}
        <div className="quick-amounts">
          {quickAmounts.map((amount, idx) => (
            <button
              key={idx}
              className="quick-amount-btn"
              onClick={() => setAmountPaid(amount.toString())}
              disabled={disabled}
            >
              {frappe.format(amount, { fieldtype: 'Currency' })}
            </button>
          ))}
        </div>
      </div>

      {/* Change Display */}
      {selectedMethod?.type === 'Cash' && changeAmount > 0 && (
        <div className="payment-change">
          <label>Change</label>
          <div className="change-amount">
            {frappe.format(changeAmount, { fieldtype: 'Currency' })}
          </div>
        </div>
      )}

      {/* Reference Number (for QRIS/Card) */}
      {selectedMethod && selectedMethod.type !== 'Cash' && (
        <div className="payment-reference">
          <label>Reference Number</label>
          <input
            type="text"
            className="reference-input"
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="Enter reference/transaction ID"
            disabled={disabled}
          />
        </div>
      )}

      {/* QRIS QR Code Display */}
      {selectedMethod?.is_qris && (
        <div className="payment-qris">
          <div className="qris-placeholder">
            <p>QR Code will be displayed here</p>
            <small>Customer can scan to pay</small>
          </div>
        </div>
      )}

      {/* Process Payment Button */}
      <div className="payment-actions">
        <button
          className="btn-process-payment"
          onClick={handleProcessPayment}
          disabled={disabled || processing || !selectedMethod || !amountPaid}
        >
          {processing ? (
            <>
              <span className="spinner-small"></span>
              Processing...
            </>
          ) : (
            <>
              ✓ Process Payment
            </>
          )}
        </button>
      </div>

      {/* Payment Info */}
      <div className="payment-info">
        <small>
          {selectedMethod?.type === 'Cash' && 'Cash payment will calculate change automatically'}
          {selectedMethod?.is_qris && 'Customer will scan QR code to complete payment'}
          {selectedMethod?.type === 'Bank' && !selectedMethod?.is_qris && 'Enter card transaction reference'}
        </small>
      </div>
    </div>
  )
}
