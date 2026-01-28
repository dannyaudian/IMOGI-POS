import { useEffect, useState } from 'react'

export function CustomerDisplay({ order, branding }) {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const primaryColor = branding?.primary_color || '#667eea'
  const companyName = branding?.company_name || 'IMOGI POS'

  return (
    <div className="customer-display-container" style={{ backgroundColor: primaryColor }}>
      {/* Header */}
      <div className="customer-display-header">
        {branding?.logo && (
          <img src={branding.logo} alt={companyName} className="customer-display-logo" />
        )}
        <h1 className="customer-display-title">{companyName}</h1>
        <div className="customer-display-time">{formatTime(currentTime)}</div>
      </div>

      {/* Content */}
      <div className="customer-display-content">
        {!order || !order.items || order.items.length === 0 ? (
          <div className="customer-display-welcome">
            <div className="welcome-icon">🛒</div>
            <h2>Welcome!</h2>
            <p>Your items will appear here</p>
          </div>
        ) : (
          <>
            {/* Order Info */}
            <div className="customer-display-order-info">
              <div className="order-number">Order: {order.name}</div>
              {order.table_name && (
                <div className="table-info">Table: {order.table_name}</div>
              )}
            </div>

            {/* Items List */}
            <div className="customer-display-items">
              {order.items.map((item, idx) => (
                <div key={idx} className="customer-display-item">
                  <div className="item-qty">{item.qty}x</div>
                  <div className="item-details">
                    <div className="item-name">{item.item_name}</div>
                    {item.notes && (
                      <div className="item-notes">{item.notes}</div>
                    )}
                  </div>
                  <div className="item-amount">
                    {formatCurrency(item.amount || (item.rate * item.qty))}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="customer-display-totals">
              <div className="total-row">
                <span>Subtotal</span>
                <span>{formatCurrency(order.total || 0)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="total-row discount">
                  <span>Discount</span>
                  <span>-{formatCurrency(order.discount_amount)}</span>
                </div>
              )}
              {order.total_taxes_and_charges > 0 && (
                <div className="total-row">
                  <span>Tax</span>
                  <span>{formatCurrency(order.total_taxes_and_charges)}</span>
                </div>
              )}
              <div className="total-row grand-total">
                <span>Total</span>
                <span>{formatCurrency(order.grand_total || 0)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="customer-display-footer">
        <p>Thank you for your order!</p>
      </div>
    </div>
  )
}

// Hook to manage customer display window
export function useCustomerDisplay(order, branding) {
  const [displayWindow, setDisplayWindow] = useState(null)
  const [isOpen, setIsOpen] = useState(false)

  const openDisplay = () => {
    // Check if window already exists and is open
    if (displayWindow && !displayWindow.closed) {
      displayWindow.focus()
      return
    }

    // Open new window for customer display
    const width = 800
    const height = 600
    const left = window.screen.width - width
    const top = 0
    
    const newWindow = window.open(
      '',
      'CustomerDisplay',
      `width=${width},height=${height},left=${left},top=${top}`
    )

    if (newWindow) {
      // Set up the display window
      newWindow.document.title = 'Customer Display'
      newWindow.document.body.innerHTML = '<div id="customer-display-root"></div>'
      
      // Copy styles to new window
      const styles = Array.from(document.styleSheets)
        .map(sheet => {
          try {
            return Array.from(sheet.cssRules)
              .map(rule => rule.cssText)
              .join('\n')
          } catch (e) {
            return ''
          }
        })
        .join('\n')
      
      const styleEl = newWindow.document.createElement('style')
      styleEl.textContent = styles
      newWindow.document.head.appendChild(styleEl)

      setDisplayWindow(newWindow)
      setIsOpen(true)

      // Handle window close
      newWindow.addEventListener('beforeunload', () => {
        setIsOpen(false)
        setDisplayWindow(null)
      })
    }
  }

  const closeDisplay = () => {
    if (displayWindow && !displayWindow.closed) {
      displayWindow.close()
    }
    setIsOpen(false)
    setDisplayWindow(null)
  }

  // Update display when order changes
  useEffect(() => {
    if (displayWindow && !displayWindow.closed && order) {
      // Update display content
      const root = displayWindow.document.getElementById('customer-display-root')
      if (root) {
        // In a real implementation, you'd use ReactDOM to render to the other window
        // For now, we'll use a simple HTML update
        root.innerHTML = `
          <div class="customer-display-container">
            <div class="customer-display-header">
              ${branding?.logo ? `<img src="${branding.logo}" class="customer-display-logo" />` : ''}
              <h1>${branding?.company_name || 'IMOGI POS'}</h1>
            </div>
            <div class="customer-display-content">
              ${order.items && order.items.length > 0 ? `
                <div class="customer-display-items">
                  ${order.items.map(item => `
                    <div class="customer-display-item">
                      <span>${item.qty}x</span>
                      <span>${item.item_name}</span>
                      <span>${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.amount || item.rate * item.qty)}</span>
                    </div>
                  `).join('')}
                </div>
                <div class="customer-display-totals">
                  <div class="total-row grand-total">
                    <span>Total</span>
                    <span>${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(order.grand_total)}</span>
                  </div>
                </div>
              ` : '<div class="customer-display-welcome"><h2>Welcome!</h2></div>'}
            </div>
          </div>
        `
      }
    }
  }, [order, displayWindow, branding])

  return { isOpen, openDisplay, closeDisplay }
}
