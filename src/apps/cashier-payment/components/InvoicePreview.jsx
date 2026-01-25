import React from 'react'

/**
 * InvoicePreview Component
 * Display receipt/invoice preview before printing
 */
export function InvoicePreview({ 
  invoice, 
  order, 
  payment,
  onClose, 
  onPrint,
  onComplete 
}) {
  if (!invoice || !order) return null

  const handlePrint = () => {
    window.print()
    if (onPrint) onPrint()
  }

  const handleComplete = () => {
    if (onComplete) onComplete()
  }

  return (
    <div className="invoice-preview-overlay">
      <div className="invoice-preview-modal">
        {/* Modal Header */}
        <div className="invoice-preview-header">
          <h2>Invoice Preview</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* Invoice Content */}
        <div className="invoice-content" id="invoice-print-area">
          {/* Company Header */}
          <div className="invoice-header">
            <h1>{frappe.boot.sysdefaults.company || 'IMOGI POS'}</h1>
            <p>Invoice / Receipt</p>
          </div>

          {/* Invoice Info */}
          <div className="invoice-info">
            <div className="invoice-info-row">
              <span>Invoice No:</span>
              <strong>{invoice.name}</strong>
            </div>
            <div className="invoice-info-row">
              <span>Date:</span>
              <span>{frappe.datetime.get_datetime_as_string()}</span>
            </div>
            {order.table && (
              <div className="invoice-info-row">
                <span>Table:</span>
                <span>{order.table}</span>
              </div>
            )}
            {order.waiter && (
              <div className="invoice-info-row">
                <span>Served by:</span>
                <span>{order.waiter}</span>
              </div>
            )}
          </div>

          {/* Customer Info */}
          {invoice.customer_name && invoice.customer_name !== 'Walk-In Customer' && (
            <div className="invoice-customer">
              <h4>Customer</h4>
              <p>{invoice.customer_name}</p>
            </div>
          )}

          {/* Items */}
          <div className="invoice-items">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.items && order.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.item_name}</td>
                    <td>{item.qty}</td>
                    <td>{frappe.format(item.rate, { fieldtype: 'Currency' })}</td>
                    <td>{frappe.format(item.amount, { fieldtype: 'Currency' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="invoice-totals">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>{frappe.format(order.total || 0, { fieldtype: 'Currency' })}</span>
            </div>
            
            {order.taxes && order.taxes.map((tax, idx) => (
              <div key={idx} className="total-row">
                <span>{tax.description}:</span>
                <span>{frappe.format(tax.tax_amount, { fieldtype: 'Currency' })}</span>
              </div>
            ))}

            <div className="total-row grand-total">
              <span>Total:</span>
              <span>{frappe.format(order.grand_total, { fieldtype: 'Currency' })}</span>
            </div>

            {payment && (
              <>
                <div className="total-row">
                  <span>Paid ({payment.mode_of_payment}):</span>
                  <span>{frappe.format(payment.paid_amount, { fieldtype: 'Currency' })}</span>
                </div>
                {payment.change_amount > 0 && (
                  <div className="total-row change-row">
                    <span>Change:</span>
                    <span>{frappe.format(payment.change_amount, { fieldtype: 'Currency' })}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="invoice-footer">
            <p>Thank you for your visit!</p>
            <p>Please come again</p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="invoice-preview-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={handlePrint}>
            🖨️ Print Receipt
          </button>
          <button className="btn-success" onClick={handleComplete}>
            ✓ Complete Order
          </button>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          .invoice-preview-overlay {
            background: white !important;
          }
          .invoice-preview-modal {
            box-shadow: none !important;
            max-width: 100% !important;
          }
          .invoice-preview-header,
          .invoice-preview-actions {
            display: none !important;
          }
          .invoice-content {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
