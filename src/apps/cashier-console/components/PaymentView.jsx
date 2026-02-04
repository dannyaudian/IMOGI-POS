import { useState, useEffect } from 'react'
import { apiCall } from '@/shared/utils/api'
import { usePaymentMethods } from '@/shared/api/imogi-api'
import { formatCurrency } from '@/shared/utils/formatters'

export function PaymentView({ order, onClose, onPaymentComplete, posProfile, effectiveOpeningName, revalidateOpening }) {
  const [selectedMethod, setSelectedMethod] = useState(null)
  const [cashAmount, setCashAmount] = useState('')
  const [showCashModal, setShowCashModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  // Fetch payment methods from POS Profile
  const { data: paymentMethodsData, isLoading: loadingMethods } = usePaymentMethods(posProfile)
  const paymentMethods = paymentMethodsData?.payment_methods || []
  const handleMethodSelect = (method) => {
    setError(null)
    setSelectedMethod(method)
    
    // For cash, show modal with amount input
    if (method.mode_of_payment === 'Cash') {
      setShowCashModal(true)
    } else {
      // For other methods (Card, QRIS, etc.), process directly
      processNonCashPayment(method)
    }
  }

  const processNonCashPayment = async (method) => {
    setProcessing(true)
    setError(null)
    
    try {
      await processPayment(method.mode_of_payment, order.grand_total, order.grand_total)
    } catch (err) {
      console.error('[Payment] Non-cash payment error:', err)
      setError(err.message || 'Payment processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const processCashPayment = async () => {
    const cash = parseFloat(cashAmount)
    const total = order?.grand_total || 0
    
    if (cash < total) {
      setError('Insufficient cash amount')
      return
    }
    
    setProcessing(true)
    setError(null)
    
    try {
      await processPayment('Cash', cash, total)
      setShowCashModal(false)
    } catch (err) {
      console.error('[Payment] Cash payment error:', err)
      setError(err.message || 'Payment processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const processPayment = async (modeOfPayment, amount, total) => {
    // Step 0: Re-validate opening before payment (multi-session consistency)
    if (revalidateOpening) {
      console.log('[Payment] Re-validating opening before payment...')
      try {
        await revalidateOpening()
        // Check revalidation status
        if (!effectiveOpeningName) {
          console.error('[Payment] Opening validation failed')
          throw new Error('Opening validation failed. Please reload.')
        }
      } catch (err) {
        console.error('[Payment] Opening revalidation error:', err)
        throw new Error('Opening validation failed. Please reload.')
      }
    }
    
    // Step 1: Check if opening exists (native v15 requirement)
    console.log('[Payment] Checking POS opening...')
    const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')
    
    if (!openingRes?.has_opening) {
      console.error('[Payment] No active POS Opening:', openingRes)
      throw new Error('Tidak ada POS Opening aktif. Silakan buka POS terlebih dulu.')
    }
    
    console.log('[Payment] Active opening found:', openingRes.opening?.name)
    
    // Step 2: Create invoice from order (if not exists)
    console.log('[Payment] Creating invoice from order:', order.name)
    const invoiceRes = await apiCall('imogi_pos.api.cashier.create_invoice_from_order', {
      order_name: order.name,
      customer: order.customer,
      customer_name: order.customer_name
    })
    
    if (!invoiceRes?.success) {
      console.error('[Payment] Create invoice failed:', invoiceRes)
      throw new Error(invoiceRes?.error || 'Failed to create invoice')
    }
    
    console.log('[Payment] Invoice created:', invoiceRes.invoice)
    
    // Step 3: Process payment (submit invoice with payment)
    console.log('[Payment] Processing payment for invoice:', invoiceRes.invoice)
    const paymentRes = await apiCall('imogi_pos.api.cashier.process_payment', {
      invoice_name: invoiceRes.invoice,
      payments: [{
        mode_of_payment: modeOfPayment,
        amount: amount
      }],
      cash_received: modeOfPayment === 'Cash' ? amount : total
    })
    
    if (!paymentRes?.success) {
      console.error('[Payment] Process payment failed:', paymentRes)
      throw new Error(paymentRes?.error || 'Failed to process payment')
    }
    
    console.log('[Payment] Payment successful:', paymentRes)
    
    // Step 4: Complete order workflow
    console.log('[Payment] Completing order:', order.name)
    const completeRes = await apiCall('imogi_pos.api.cashier.complete_order', {
      order_name: order.name
    })
    
    if (!completeRes?.success) {
      console.warn('[Payment] Complete order warning:', completeRes)
    }
    
    // Success callback
    if (onPaymentComplete) {
      onPaymentComplete({
        method: modeOfPayment,
        amount: amount,
        change: paymentRes.change_amount || (modeOfPayment === 'Cash' ? amount - total : 0),
        invoice: invoiceRes.invoice,
        session: invoiceRes.session
      })
    }
  }

  const addToAmount = (value) => {
    setCashAmount(prev => prev + value)
  }

  const clearAmount = () => {
    setCashAmount('')
  }

  const quickAmount = (amount) => {
    setCashAmount(amount.toString())
  }

  const calculateChange = () => {
    const cash = parseFloat(cashAmount) || 0
    const total = order?.grand_total || 0
    return cash - total
  }

  if (!order) {
    return null
  }

  return (
    <div className="payment-panel">
      <div className="payment-container">
        <div className="payment-header">
          <h3>Payment Request</h3>
          <button onClick={onClose} className="btn-close" disabled={processing}>
            <i className="fa fa-times"></i>
          </button>
        </div>
        
        {error && (
          <div className="payment-error" style={{ 
            padding: '12px', 
            margin: '12px 16px', 
            backgroundColor: '#fee', 
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33'
          }}>
            <i className="fa fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
            {error}
          </div>
        )}
        
        <div className="payment-content">
          <div className="payment-info">
            <div className="payment-info-row">
              <div className="payment-info-label">Order Number</div>
              <div className="payment-info-value">{order.name}</div>
            </div>
            
            <div className="payment-info-row">
              <div className="payment-info-label">Total Amount</div>
              <div className="payment-info-value grand-total">
                {formatCurrency(order.grand_total)}
              </div>
            </div>
            
            {order.table_name && (
              <div className="payment-info-row">
                <div className="payment-info-label">Table</div>
                <div className="payment-info-value">{order.table_name}</div>
              </div>
            )}
          </div>
          
          <div className="payment-actions">
            <h4 style={{ margin: '16px 0 12px', fontSize: '14px', color: '#666' }}>
              Select Payment Method
            </h4>
            
            {loadingMethods ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                <i className="fa fa-spinner fa-spin"></i> Loading payment methods...
              </div>
            ) : paymentMethods.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                No payment methods configured in POS Profile
              </div>
            ) : (
              <div className="payment-method-buttons">
                {paymentMethods.map((method) => (
                  <button 
                    key={method.mode_of_payment}
                    className="payment-method-button"
                    onClick={() => handleMethodSelect(method)}
                    disabled={processing}
                  >
                    <i className={`fa ${
                      method.mode_of_payment === 'Cash' ? 'fa-money-bill' :
                      method.mode_of_payment === 'Card' ? 'fa-credit-card' :
                      method.mode_of_payment === 'Bank Transfer' ? 'fa-university' :
                      'fa-wallet'
                    }`}></i>
                    {method.mode_of_payment}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Cash Payment Modal */}
      {showCashModal && (
        <div className="modal-overlay" onClick={() => !processing && setShowCashModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cash Payment</h3>
              <button 
                className="modal-close"
                onClick={() => {
                  setShowCashModal(false)
                  setError(null)
                }}
                disabled={processing}
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              <div className="payment-amount-display">
                <div className="amount-label">Total Amount</div>
                <div className="amount-value">{formatCurrency(order.grand_total)}</div>
              </div>
              
              <div className="cash-payment-form">
                <div className="form-group">
                  <label>Cash Received</label>
                  <input
                    type="text"
                    className="payment-amount-input"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    disabled={processing}
                  />
                </div>
                
                <div className="quick-amounts">
                  {[50000, 100000, 200000, 500000].map(amount => (
                    <button
                      key={amount}
                      className="quick-amount-btn"
                      onClick={() => quickAmount(amount)}
                      disabled={processing}
                    >
                      {formatCurrency(amount)}
                    </button>
                  ))}
                </div>
                
                <div className="payment-keypad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, '000', 0, 'C'].map(key => (
                    <button
                      key={key}
                      className={`keypad-btn ${key === 'C' ? 'clear' : ''}`}
                      onClick={() => key === 'C' ? clearAmount() : addToAmount(key.toString())}
                      disabled={processing}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                
                {cashAmount && (
                  <div className="change-display">
                    <div className="change-label">Change</div>
                    <div className={`change-value ${calculateChange() < 0 ? 'insufficient' : ''}`}>
                      {formatCurrency(calculateChange())}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => {
                  setShowCashModal(false)
                  setError(null)
                }}
                disabled={processing}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={processCashPayment}
                disabled={!cashAmount || calculateChange() < 0 || processing}
              >
                {processing ? (
                  <>
                    <i className="fa fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                    Processing...
                  </>
                ) : (
                  'Confirm Payment'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
