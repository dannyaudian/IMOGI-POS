import { useState, useEffect, useMemo, useRef } from 'react'
import { apiCall } from '@/shared/utils/api'
import { API, ITEM_MODES } from '@/shared/api/constants'
import { formatCurrency } from '@/shared/utils/formatters'

/**
 * VariantPickerModal - Cascading/hierarchical variant attribute selection
 *
 * UX: User picks attribute values one step at a time (berjenjang).
 * Each selection narrows down available values for the next attribute.
 * Auto-confirms when only one variant remains after a selection.
 */
export function VariantPickerModal({
  isOpen,
  onClose,
  templateName,
  templateItem,   // full template item object (optional, for display)
  posProfile,
  mode = 'add',  // 'add' or 'convert'
  onSelectVariant
}) {
  const [variants, setVariants] = useState([])
  const [attrOrder, setAttrOrder] = useState([])   // ordered list of attribute names
  const [selectedAttrs, setSelectedAttrs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Guard: prevent auto-confirm from firing more than once per modal open cycle
  const autoConfirmedRef = useRef(false)

  // Reset state whenever modal opens for a new template
  useEffect(() => {
    if (isOpen && templateName) {
      setSelectedAttrs({})
      autoConfirmedRef.current = false
      loadVariants()
    }
    if (!isOpen) {
      setSelectedAttrs({})
      setVariants([])
      setAttrOrder([])
      setError(null)
      autoConfirmedRef.current = false
    }
  }, [isOpen, templateName, posProfile])

  // Auto-confirm immediately if only 1 variant (no selection step needed)
  useEffect(() => {
    if (!isOpen || loading || error || variants.length !== 1) return
    if (autoConfirmedRef.current) return
    const variantName = variants[0]?.name
    if (!variantName) return
    autoConfirmedRef.current = true
    if (onSelectVariant) onSelectVariant(variantName)
    onClose()
  }, [isOpen, loading, error, variants])

  const loadVariants = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await apiCall(API.GET_POS_ITEMS, {
        mode: ITEM_MODES.VARIANT,
        item_code: templateName,
        pos_profile: posProfile,
        debug: import.meta.env.DEV ? 1 : 0
      })

      const variantItems = Array.isArray(response)
        ? response
        : response?.items || response?.message || []

      setVariants(variantItems)

      // Extract attribute order from first variant — ERPNext inserts in template order
      if (variantItems.length > 0) {
        const firstAttrs = variantItems[0]?.attributes || {}
        setAttrOrder(Object.keys(firstAttrs))
      }

      if (import.meta.env.DEV) {
        console.log('[VariantPicker] Loaded variants:', variantItems.length)
      }
    } catch (err) {
      setError('Gagal memuat variant')
      console.error('[VariantPicker] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // --- Cascading selection logic ---

  // Variants that still match all currently-selected attributes
  const matchingVariants = useMemo(() => {
    if (Object.keys(selectedAttrs).length === 0) return variants
    return variants.filter(v => {
      const attrs = v.attributes || {}
      return Object.entries(selectedAttrs).every(([key, val]) => attrs[key] === val)
    })
  }, [selectedAttrs, variants])

  // Index of the next attribute step to fill in
  const currentStepIndex = useMemo(() =>
    attrOrder.findIndex(attr => selectedAttrs[attr] === undefined),
    [attrOrder, selectedAttrs]
  )

  // Name of the attribute we're currently picking
  const currentAttr = currentStepIndex >= 0 ? attrOrder[currentStepIndex] : null

  // Available values for the current step (from matching variants only)
  const availableValues = useMemo(() => {
    if (!currentAttr) return []
    const vals = new Set(
      matchingVariants
        .map(v => (v.attributes || {})[currentAttr])
        .filter(Boolean)
    )
    return Array.from(vals)
  }, [currentAttr, matchingVariants])

  const handleValueSelect = (attrName, value) => {
    const newAttrs = { ...selectedAttrs, [attrName]: value }

    // Check remaining variants after this selection
    const remaining = variants.filter(v => {
      const attrs = v.attributes || {}
      return Object.entries(newAttrs).every(([k, val]) => attrs[k] === val)
    })

    if (remaining.length === 1) {
      // Exactly one variant left — auto-confirm
      const variantName = remaining[0]?.name
      if (onSelectVariant && variantName) onSelectVariant(variantName)
      onClose()
      return
    }

    setSelectedAttrs(newAttrs)
  }

  // Go back to a previous step
  const handleBreadcrumbClick = (stepIndex) => {
    const newAttrs = {}
    attrOrder.slice(0, stepIndex).forEach(attr => {
      if (selectedAttrs[attr] !== undefined) newAttrs[attr] = selectedAttrs[attr]
    })
    setSelectedAttrs(newAttrs)
  }

  // If all attrs are selected and there are multiple matches (shouldn't happen ideally)
  // — show the remaining variants for manual pick
  const isDone = currentStepIndex === -1 && matchingVariants.length > 0

  if (!isOpen) return null

  const displayName = templateItem?.item_name || templateName
  const modalTitle = mode === 'convert' ? 'Ganti Template ke Variant' : 'Pilih Variant'
  const selectedCount = Object.keys(selectedAttrs).length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content variant-picker-modal variant-picker-cascading" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div className="variant-picker-title">
            <h3>{modalTitle}</h3>
            {displayName && (
              <p className="variant-picker-item-name">{displayName}</p>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body variant-picker-body">

          {/* Loading */}
          {loading && (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Memuat variant...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={loadVariants} className="btn-retry">Coba Lagi</button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Breadcrumb & Progress */}
              {attrOrder.length > 0 && (
                <div className="variant-breadcrumb">
                  <div className="variant-breadcrumb-steps">
                    {attrOrder.map((attr, idx) => {
                      const isSelected = selectedAttrs[attr] !== undefined
                      const isCurrent = idx === currentStepIndex
                      const isPast = idx < currentStepIndex

                      return (
                        <span key={attr} className="variant-breadcrumb-step">
                          {idx > 0 && (
                            <span className="variant-breadcrumb-sep">›</span>
                          )}
                          <button
                            className={[
                              'variant-breadcrumb-btn',
                              isSelected ? 'is-selected' : '',
                              isCurrent ? 'is-current' : '',
                              isPast ? 'is-past' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => isPast || isSelected ? handleBreadcrumbClick(idx) : undefined}
                            disabled={!isSelected && !isCurrent}
                            title={isSelected ? `${attr}: ${selectedAttrs[attr]} — klik untuk ubah` : attr}
                          >
                            <span className="variant-breadcrumb-attr">{attr}</span>
                            {isSelected && (
                              <span className="variant-breadcrumb-value">{selectedAttrs[attr]}</span>
                            )}
                          </button>
                        </span>
                      )
                    })}
                  </div>

                  {selectedCount > 0 && (
                    <div className="variant-match-count">
                      {matchingVariants.length} variant cocok
                    </div>
                  )}
                </div>
              )}

              {/* Current Step: attribute value buttons */}
              {currentAttr && !isDone && (
                <div className="variant-step">
                  <div className="variant-step-label">
                    <span className="variant-step-number">{currentStepIndex + 1}</span>
                    Pilih <strong>{currentAttr}</strong>
                  </div>

                  {availableValues.length === 0 ? (
                    <div className="empty-state">
                      <p>Tidak ada kombinasi tersedia</p>
                      <button onClick={() => handleBreadcrumbClick(0)} className="btn-secondary">
                        Mulai ulang
                      </button>
                    </div>
                  ) : (
                    <div className="variant-value-grid">
                      {availableValues.map(value => {
                        // Count how many variants remain if we pick this value
                        const previewCount = matchingVariants.filter(
                          v => (v.attributes || {})[currentAttr] === value
                        ).length

                        // Price range hint
                        const matchedByValue = matchingVariants.filter(
                          v => (v.attributes || {})[currentAttr] === value
                        )
                        const prices = matchedByValue
                          .map(v => v.price_list_rate || v.standard_rate || 0)
                          .filter(p => p > 0)
                        const minPrice = prices.length ? Math.min(...prices) : null
                        const maxPrice = prices.length ? Math.max(...prices) : null
                        const priceHint = minPrice !== null
                          ? minPrice === maxPrice
                            ? formatCurrency(minPrice)
                            : `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}`
                          : null

                        return (
                          <button
                            key={value}
                            className="variant-value-btn"
                            onClick={() => handleValueSelect(currentAttr, value)}
                          >
                            <span className="variant-value-label">{value}</span>
                            {priceHint && (
                              <span className="variant-value-price">{priceHint}</span>
                            )}
                            {previewCount === 1 && (
                              <span className="variant-value-final">
                                <i className="fa fa-check"></i>
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Fallback: multiple variants remain after all attrs selected */}
              {isDone && matchingVariants.length > 1 && (
                <div className="variant-step">
                  <div className="variant-step-label">
                    Pilih variant
                  </div>
                  <div className="variant-final-list">
                    {matchingVariants.map(variant => {
                      const price = variant.price_list_rate || variant.standard_rate || 0
                      const attrSummary = Object.values(variant.attributes || {}).join(' · ')
                      return (
                        <button
                          key={variant.name}
                          className="variant-final-item"
                          onClick={() => {
                            if (onSelectVariant) onSelectVariant(variant.name)
                            onClose()
                          }}
                        >
                          <div className="variant-final-info">
                            <span className="variant-final-name">{variant.item_name}</span>
                            {attrSummary && (
                              <span className="variant-final-attrs">{attrSummary}</span>
                            )}
                            <span className="variant-final-code">{variant.name}</span>
                          </div>
                          {price > 0 && (
                            <span className="variant-final-price">{formatCurrency(price)}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Reset button — only when some attrs are selected */}
              {selectedCount > 0 && !isDone && (
                <div className="variant-picker-reset">
                  <button
                    className="btn-text-muted"
                    onClick={() => setSelectedAttrs({})}
                  >
                    <i className="fa fa-redo"></i> Mulai ulang
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
