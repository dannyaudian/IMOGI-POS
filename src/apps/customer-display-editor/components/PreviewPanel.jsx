import React, { useEffect, useState } from 'react'

/**
 * PreviewPanel Component
 * Live preview of customer display with sample data
 */
export function PreviewPanel({ config, sampleData }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (sampleData && sampleData.items) {
      setItems(sampleData.items)
      setTotal(sampleData.total || sampleData.items.reduce((sum, item) => sum + item.amount, 0))
    } else {
      // Default sample data
      setItems([
        { item_name: 'Sample Item 1', qty: 2, rate: 25000, amount: 50000 },
        { item_name: 'Sample Item 2', qty: 1, rate: 35000, amount: 35000 },
        { item_name: 'Sample Item 3', qty: 3, rate: 15000, amount: 45000 }
      ])
      setTotal(130000)
    }
  }, [sampleData])

  const bgColor = config.backgroundColor || '#1f2937'
  const textColor = config.textColor || '#ffffff'
  const accentColor = config.accentColor || '#3b82f6'
  const priceColor = config.priceColor || '#10b981'
  const fontSize = config.fontSize || '1rem'
  const layoutType = config.layout_type || config.layoutType || 'List'

  return (
    <div className="cde-preview-panel">
      <div className="cde-preview-header">
        <h3>Live Preview</h3>
        <span className="cde-preview-badge">{layoutType} Layout</span>
      </div>

      <div 
        className={`cde-preview-display ${layoutType.toLowerCase()}`}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          fontSize: fontSize
        }}
      >
        {/* Header */}
        {config.showLogo && config.brand_name && (
          <div className="cde-display-header" style={{ borderBottomColor: accentColor }}>
            <h2>{config.brand_name}</h2>
          </div>
        )}

        {/* Items */}
        <div className="cde-display-content">
          <div className="cde-display-title">
            <h3>Current Order</h3>
          </div>

          <div className="cde-display-items">
            {items.map((item, idx) => (
              <div key={idx} className="cde-display-item">
                <div className="cde-item-left">
                  {config.showImages && (
                    <div className="cde-item-image">
                      <div className="cde-item-image-placeholder">📷</div>
                    </div>
                  )}
                  <div className="cde-item-info">
                    <div className="cde-item-name">{item.item_name}</div>
                    {config.showDescription && item.description && (
                      <div className="cde-item-description">{item.description}</div>
                    )}
                    <div className="cde-item-qty">Qty: {item.qty}</div>
                  </div>
                </div>
                <div className="cde-item-right">
                  <div className="cde-item-price" style={{ color: priceColor }}>
                    {frappe.format(item.amount, { fieldtype: 'Currency' })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="cde-display-totals">
            {config.showSubtotal && sampleData?.subtotal && (
              <div className="cde-total-row">
                <span>Subtotal</span>
                <span>{frappe.format(sampleData.subtotal, { fieldtype: 'Currency' })}</span>
              </div>
            )}
            {config.showTaxes && sampleData?.tax && (
              <div className="cde-total-row">
                <span>Tax</span>
                <span>{frappe.format(sampleData.tax, { fieldtype: 'Currency' })}</span>
              </div>
            )}
            <div className="cde-total-row cde-total-grand" style={{ borderTopColor: accentColor }}>
              <span>Total</span>
              <span style={{ color: priceColor }}>
                {frappe.format(total, { fieldtype: 'Currency' })}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cde-display-footer" style={{ backgroundColor: accentColor }}>
          <p>Thank you for your purchase!</p>
        </div>
      </div>

      {/* Preview Info */}
      <div className="cde-preview-info">
        <small>
          This is a live preview. Changes to configuration will update in real-time.
        </small>
      </div>
    </div>
  )
}
