import { useState } from 'react'

export function SplitBillView({ order, onClose, onSplitConfirm }) {
  const [splitMethod, setSplitMethod] = useState('equal') // equal, item, amount
  const [splitCount, setSplitCount] = useState(2)
  const [splits, setSplits] = useState([])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const generateEqualSplit = () => {
    if (!order) return []
    
    const perBill = order.grand_total / splitCount
    const result = []
    
    for (let i = 0; i < splitCount; i++) {
      result.push({
        number: i + 1,
        items: order.items || [],
        total: perBill
      })
    }
    
    return result
  }

  const handleSplitMethodChange = (method) => {
    setSplitMethod(method)
    if (method === 'equal') {
      setSplits(generateEqualSplit())
    }
  }

  const handleSplitCountChange = (delta) => {
    const newCount = Math.max(2, Math.min(10, splitCount + delta))
    setSplitCount(newCount)
    if (splitMethod === 'equal') {
      // Regenerate splits with new count
      const perBill = order.grand_total / newCount
      const newSplits = []
      for (let i = 0; i < newCount; i++) {
        newSplits.push({
          number: i + 1,
          items: order.items || [],
          total: perBill
        })
      }
      setSplits(newSplits)
    }
  }

  const handleConfirm = () => {
    if (onSplitConfirm) {
      onSplitConfirm(splits, splitMethod)
    }
  }

  // Initialize equal split
  useState(() => {
    if (order && splits.length === 0) {
      setSplits(generateEqualSplit())
    }
  }, [order])

  if (!order) return null

  return (
    <div className="split-bill-panel">
      <div className="split-container">
        <div className="split-header">
          <h3>Split Bill - {order.name}</h3>
          <div className="split-controls">
            <button onClick={onClose} className="split-button">
              Cancel
            </button>
            <button onClick={handleConfirm} className="split-button primary">
              Confirm Split
            </button>
          </div>
        </div>
        
        <div className="split-content">
          <div className="split-options">
            <div className="split-option-group">
              <label>Split Method</label>
              <div className="split-option-buttons">
                <button
                  className={`split-option-button ${splitMethod === 'equal' ? 'active' : ''}`}
                  onClick={() => handleSplitMethodChange('equal')}
                >
                  Equal
                </button>
                <button
                  className={`split-option-button ${splitMethod === 'item' ? 'active' : ''}`}
                  onClick={() => handleSplitMethodChange('item')}
                >
                  By Item
                </button>
                <button
                  className={`split-option-button ${splitMethod === 'amount' ? 'active' : ''}`}
                  onClick={() => handleSplitMethodChange('amount')}
                >
                  By Amount
                </button>
              </div>
            </div>
            
            <div className="split-option-group">
              <label>Number of Bills</label>
              <div className="split-number-selector">
                <button
                  className="split-number-btn"
                  onClick={() => handleSplitCountChange(-1)}
                  disabled={splitCount <= 2}
                >
                  -
                </button>
                <input
                  type="number"
                  className="split-number-input"
                  value={splitCount}
                  min="2"
                  max="10"
                  readOnly
                />
                <button
                  className="split-number-btn"
                  onClick={() => handleSplitCountChange(1)}
                  disabled={splitCount >= 10}
                >
                  +
                </button>
              </div>
            </div>
          </div>
          
          <div className="split-bills-container">
            {splits.map((split, idx) => (
              <div key={idx} className="split-col">
                <div className="split-col-header">
                  <span className="split-col-title">Bill {split.number}</span>
                </div>
                <div className="split-col-body">
                  {splitMethod === 'equal' ? (
                    <div className="split-equal-info">
                      <p>Equal split of total amount</p>
                      <p className="split-item-count">
                        {order.items?.length || 0} items included
                      </p>
                    </div>
                  ) : (
                    <div className="split-items-list">
                      {split.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="split-item">
                          <div className="split-item-details">
                            <div className="split-item-name">{item.item_name}</div>
                            <div className="split-item-price">
                              {formatCurrency(item.rate)}
                            </div>
                          </div>
                          <div className="split-item-qty">x{item.qty}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="split-col-footer">
                  <div className="split-total">
                    <span>Total</span>
                    <span>{formatCurrency(split.total)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
