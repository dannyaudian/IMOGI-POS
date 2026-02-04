import React, { useEffect, useState } from 'react'
import { BlockRenderer } from './BlockRenderer'

/**
 * PreviewPanel Component
 * Live preview of customer display with blocks layout
 */
export function PreviewPanel({ blocks = [], deviceType = 'tablet' }) {
  const [sampleData, setSampleData] = useState({
    items: [
      { item_name: 'Nasi Goreng Special', qty: 2, rate: 25000, amount: 50000 },
      { item_name: 'Es Teh Manis', qty: 1, rate: 5000, amount: 5000 },
      { item_name: 'Ayam Bakar', qty: 1, rate: 35000, amount: 35000 }
    ],
    subtotal: 90000,
    tax: 10000,
    total: 100000,
    order_number: 'ORD-001',
    brand_name: 'IMOGI POS'
  })

  // Device dimensions for preview
  const deviceDimensions = {
    tablet: { width: 768, height: 1024 },
    phone: { width: 375, height: 667 },
    monitor: { width: 1920, height: 1080 }
  }

  const dimensions = deviceDimensions[deviceType] || deviceDimensions.tablet
  const scale = deviceType === 'monitor' ? 0.4 : deviceType === 'tablet' ? 0.6 : 0.8

  // Sort blocks by y position, then x position
  const sortedBlocks = [...blocks].sort((a, b) => {
    if (a.layout.y === b.layout.y) {
      return a.layout.x - b.layout.x
    }
    return a.layout.y - b.layout.y
  })

  return (
    <div className="cde-preview-panel">
      <div className="cde-preview-header">
        <h3>Live Preview</h3>
        <span className="cde-preview-badge">{deviceType}</span>
      </div>

      <div className="cde-preview-viewport">
        <div 
          className="cde-preview-device"
          style={{
            width: dimensions.width,
            height: dimensions.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top center'
          }}
        >
          <div className="cde-preview-screen">
            {sortedBlocks.length === 0 ? (
              <div className="cde-preview-empty">
                <div className="cde-empty-icon">📱</div>
                <p>No blocks added yet</p>
                <small>Add blocks from the library to see the preview</small>
              </div>
            ) : (
              <div 
                className="cde-preview-blocks"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  gap: '10px',
                  padding: '20px',
                  minHeight: '100%'
                }}
              >
                {sortedBlocks.map((block) => (
                  <div
                    key={block.id}
                    style={{
                      gridColumn: `span ${block.layout.w}`,
                      minHeight: `${block.layout.h * 30}px`
                    }}
                  >
                    <BlockRenderer block={block} sampleData={sampleData} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="cde-preview-info">
        <small>
          Live preview updates in real-time as you add and edit blocks.
        </small>
      </div>
    </div>
  )
}
