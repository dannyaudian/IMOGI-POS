import { useState } from 'react'

export function PaymentView({ order, onClose, onPaymentComplete }) {
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashAmount, setCashAmount] = useState('')
  const [showCashModal, setShowCashModal] = useState(false)

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const handleCashPayment = () => {
    setShowCashModal(true)
  }

  const handleCardPayment = () => {
    // Generate QR code or process card payment
    alert('Card payment integration - QR code will be displayed here')
  }

  const processCashPayment = () => {
    const cash = parseFloat(cashAmount)
    const total = order?.grand_total || 0
    
    if (cash < total) {
      alert('Insufficient cash amount')
      return
    }
    
    // Process payment
    console.log('Processing cash payment:', {
      order: order?.name,
      amount: cash,
      change: cash - total
    })
    
    if (onPaymentComplete) {
      onPaymentComplete({
        method: 'Cash',
        amount: cash,
        change: cash - total
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
          <button onClick={onClose} className="btn-close">
            <i className="fa fa-times"></i>
          </button>
        </div>
        
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
            <div className="payment-method-buttons">
              <button 
                className="payment-method-button"
                onClick={handleCashPayment}
              >
                <i className="fa fa-money-bill"></i>
                Cash
              </button>
              <button 
                className="payment-method-button"
                onClick={handleCardPayment}
              >
                <i className="fa fa-credit-card"></i>
                Card/QR
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Cash Payment Modal */}
      {showCashModal && (
        <div className="modal-overlay" onClick={() => setShowCashModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cash Payment</h3>
              <button 
                className="modal-close"
                onClick={() => setShowCashModal(false)}
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
                  />
                </div>
                
                <div className="quick-amounts">
                  {[50000, 100000, 200000, 500000].map(amount => (
                    <button
                      key={amount}
                      className="quick-amount-btn"
                      onClick={() => quickAmount(amount)}
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
                onClick={() => setShowCashModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={processCashPayment}
                disabled={!cashAmount || calculateChange() < 0}
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
