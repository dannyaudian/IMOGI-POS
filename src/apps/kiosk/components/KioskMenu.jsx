import { useCallback } from 'react'
import { useKioskContext } from '../context/KioskContext'

export function KioskMenu() {
  const { items, itemsLoading, itemsError, addToCart, openVariantPicker } = useKioskContext()
  const { LoadingSpinner, ErrorMessage, Card } = require('@/shared/components/UI')

  const handleItemClick = useCallback((item) => {
    if (!item?.item_code) return

    // Variant-first UX: template → picker → add variant
    if (item.has_variants) {
      openVariantPicker(item)
      return
    }

    // Regular item: add directly
    addToCart(item, 1)
  }, [addToCart, openVariantPicker])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 0 0.5rem 0', flexShrink: 0 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Welcome! Select your items</h2>
      </div>
      
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 'calc(80px + 1.5rem)' }}>
        {itemsLoading && <LoadingSpinner message="Loading menu..." />}
        {itemsError && <ErrorMessage error={itemsError} />}
        {items && (
          <div className="grid grid-4">
            {items.map(item => (
              <div
                key={item.item_code}
                style={{
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onClick={() => handleItemClick(item)}
                onMouseOver={(e) => e.currentTarget.style.borderColor = '#667eea'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
              >
                {item.has_variants && (
                  <span style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    background: '#667eea',
                    color: 'white',
                    fontSize: '0.625rem',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}>
                    VARIANTS
                  </span>
                )}
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍽️</div>
                <strong>{item.item_name}</strong>
                <div style={{ marginTop: '0.5rem', color: '#667eea', fontSize: '1.125rem' }}>
                  ${(item.rate || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
