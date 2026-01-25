/**
 * Cashier Utility Functions
 */

/**
 * Format currency for display
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount)
}

/**
 * Calculate change amount
 */
export function calculateChange(paidAmount, totalAmount) {
  const change = parseFloat(paidAmount) - parseFloat(totalAmount)
  return change > 0 ? change : 0
}

/**
 * Get time elapsed display
 */
export function getTimeElapsed(dateTime) {
  const now = new Date()
  const past = new Date(dateTime)
  const diffMs = now - past
  const diffMins = Math.floor(diffMs / 1000 / 60)

  if (diffMins < 1) return 'Just now'
  if (diffMins === 1) return '1 minute ago'
  if (diffMins < 60) return `${diffMins} minutes ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours === 1) return '1 hour ago'
  if (diffHours < 24) return `${diffHours} hours ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return '1 day ago'
  return `${diffDays} days ago`
}

/**
 * Validate payment amount
 */
export function validatePaymentAmount(paidAmount, totalAmount) {
  const paid = parseFloat(paidAmount)
  const total = parseFloat(totalAmount)

  if (isNaN(paid) || paid <= 0) {
    return { valid: false, message: 'Invalid payment amount' }
  }

  if (paid < total) {
    return { valid: false, message: 'Payment amount is less than total' }
  }

  return { valid: true }
}

/**
 * Get payment method icon
 */
export function getPaymentMethodIcon(paymentMethod) {
  const icons = {
    'Cash': '💵',
    'QRIS': '📱',
    'Card': '💳',
    'Credit Card': '💳',
    'Debit Card': '💳',
    'Bank Transfer': '🏦'
  }
  return icons[paymentMethod] || '💰'
}

/**
 * Generate quick amount suggestions
 */
export function getQuickAmounts(totalAmount) {
  const amounts = []
  
  // Exact amount
  amounts.push(totalAmount)
  
  // Round up to nearest 50k
  const roundTo50k = Math.ceil(totalAmount / 50000) * 50000
  if (roundTo50k !== totalAmount) {
    amounts.push(roundTo50k)
  }
  
  // Round up to nearest 100k
  const roundTo100k = Math.ceil(totalAmount / 100000) * 100000
  if (roundTo100k !== totalAmount && roundTo100k !== roundTo50k) {
    amounts.push(roundTo100k)
  }

  return amounts
}

/**
 * Format order status badge
 */
export function getOrderStatusBadge(order) {
  if (!order) return null

  if (order.all_kots_served) {
    return {
      text: 'Ready for Payment',
      className: 'ready',
      icon: '✓'
    }
  }

  return {
    text: `Preparing (${order.kots_served}/${order.kots_total})`,
    className: 'preparing',
    icon: '⏳'
  }
}

/**
 * Print receipt
 */
export function printReceipt(elementId = 'invoice-print-area') {
  const printContent = document.getElementById(elementId)
  if (!printContent) {
    console.error('Print element not found')
    return
  }

  const printWindow = window.open('', '_blank')
  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body { font-family: monospace; padding: 20px; }
          .invoice-header { text-align: center; margin-bottom: 20px; }
          .invoice-header h1 { margin: 0; font-size: 24px; }
          .invoice-info { margin-bottom: 15px; }
          .invoice-info-row { display: flex; justify-content: space-between; margin: 5px 0; }
          .invoice-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .invoice-table th { border-bottom: 2px solid #000; padding: 5px; text-align: left; }
          .invoice-table td { padding: 5px; border-bottom: 1px solid #ddd; }
          .invoice-totals { margin-top: 15px; }
          .total-row { display: flex; justify-content: space-between; margin: 5px 0; }
          .grand-total { font-weight: bold; font-size: 18px; border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; }
          .invoice-footer { text-align: center; margin-top: 20px; border-top: 1px dashed #000; padding-top: 15px; }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.print()
}

/**
 * Check if all KOTs are served
 */
export function areAllKOTsServed(kots) {
  if (!kots || kots.length === 0) return false
  return kots.every(kot => kot.workflow_state === 'Served')
}

/**
 * Get KOT status summary
 */
export function getKOTStatusSummary(kots) {
  if (!kots || kots.length === 0) {
    return { total: 0, served: 0, preparing: 0, ready: 0 }
  }

  return {
    total: kots.length,
    served: kots.filter(k => k.workflow_state === 'Served').length,
    preparing: kots.filter(k => k.workflow_state === 'Preparing').length,
    ready: kots.filter(k => k.workflow_state === 'Ready').length
  }
}

/**
 * Format date time for display
 */
export function formatDateTime(dateTime) {
  if (!dateTime) return ''
  
  const date = new Date(dateTime)
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Validate customer data
 */
export function validateCustomer(customer) {
  if (!customer) {
    return { valid: false, message: 'Customer is required' }
  }

  if (!customer.customer_name) {
    return { valid: false, message: 'Customer name is required' }
  }

  return { valid: true }
}
