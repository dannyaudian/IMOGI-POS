import { useState, useEffect } from 'react'
import { useKioskContext } from '../context/KioskContext'
import { useItemVariants } from '@/shared/api/imogi-api'

export function VariantPickerModal() {
  const { 
    showVariantPicker, 
    selectedTemplateItem, 
    closeVariantPicker,
    selectVariant 
  } = useKioskContext()

  const [selectedVariantCode, setSelectedVariantCode] = useState(null)

  const { 
    data: variants, 
    error: variantsError, 
    isLoading: variantsLoading 
  } = useItemVariants(
    showVariantPicker && selectedTemplateItem?.item_code ? selectedTemplateItem.item_code : null
  )

  useEffect(() => {
    if (!showVariantPicker) {
      setSelectedVariantCode(null)
    }
  }, [showVariantPicker])

  if (!showVariantPicker) return null

  const handleConfirm = () => {
    if (!selectedVariantCode) {
      alert('Please select a variant')
      return
    }
    const variant = variants?.find(v => v.item_code === selectedVariantCode)
    if (variant) {
      selectVariant(variant)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem'
    }} onClick={closeVariantPicker}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Select Variant
          </h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {selectedTemplateItem?.item_name}
          </p>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.5rem' }}>
          {variantsLoading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Loading variants...
            </div>
          )}
          
          {variantsError && (
            <div style={{ 
              color: '#dc2626', 
              padding: '1rem', 
              background: '#fef2f2', 
              borderRadius: '6px',
              border: '1px solid #fee2e2'
            }}>
              {variantsError.message || 'Failed to load variants'}
            </div>
          )}

          {variants && variants.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              No variants available
            </div>
          )}

          {variants && variants.length > 0 && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {variants.map(variant => (
                <div
                  key={variant.item_code}
                  style={{
                    border: selectedVariantCode === variant.item_code ? '2px solid #667eea' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: selectedVariantCode === variant.item_code ? '#f5f7ff' : 'white'
                  }}
                  onClick={() => setSelectedVariantCode(variant.item_code)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '1rem' }}>{variant.item_name}</strong>
                      {variant.description && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {variant.description}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#667eea' }}>
                      ${(variant.rate || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end',
          flexShrink: 0
        }}>
          <button 
            className="btn-secondary" 
            onClick={closeVariantPicker}
            style={{ padding: '0.625rem 1.5rem' }}
          >
            Cancel
          </button>
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            disabled={!selectedVariantCode}
            style={{ padding: '0.625rem 1.5rem' }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}
