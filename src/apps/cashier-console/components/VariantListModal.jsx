import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { apiCall } from '@/shared/utils/api'
import { API, ITEM_MODES } from '@/shared/api/constants'
import { formatCurrency } from '@/shared/utils/formatters'

/**
 * VariantListModal - Display variants as a list (not grid)
 * User clicks a row to select variant and add to cart
 */
export function VariantListModal({
  isOpen,
  onClose,
  templateItem,
  posProfile,
  onSelectVariant
}) {
  const [variants, setVariants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen && templateItem) {
      loadVariants()
    } else {
      setVariants([])
      setError(null)
    }
  }, [isOpen, templateItem])

  const loadVariants = async () => {
    if (!templateItem || !posProfile) {
      console.warn('[VariantListModal] Missing templateItem or posProfile')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = {
        pos_profile: posProfile,
        mode: ITEM_MODES.VARIANT,
        item_code: templateItem.name,
        debug: import.meta.env.DEV ? 1 : 0
      }

      if (import.meta.env.DEV) {
        console.log('[VariantListModal] Loading variants:', params)
      }

      const response = await apiCall(API.GET_POS_ITEMS, params)

      // Normalize response
      let variantItems = []
      if (Array.isArray(response)) {
        variantItems = response
      } else if (response && response.items && Array.isArray(response.items)) {
        variantItems = response.items
      } else if (response && Array.isArray(response.message)) {
        variantItems = response.message
      }

      setVariants(variantItems)

      if (import.meta.env.DEV) {
        console.log('[VariantListModal] Loaded variants:', variantItems.length)
        console.log('[VariantListModal] Variants:', variantItems)
      }
    } catch (err) {
      console.error('[VariantListModal] Error loading variants:', err)
      setError(err?.message || 'Failed to load variants')
    } finally {
      setLoading(false)
    }
  }

  const handleVariantClick = (variant) => {
    if (onSelectVariant) {
      onSelectVariant(variant)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container variant-list-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {templateItem?.item_name || 'Select Variant'}
          </h2>
          <button className="modal-close-btn" onClick={onClose}>
            <i className="fa fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading variants...</p>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={loadVariants} className="btn-retry">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {variants.length === 0 ? (
                <div className="empty-state">
                  <i className="fa fa-info-circle"></i>
                  <p>No variants available for this item</p>
                </div>
              ) : (
                <div className="variant-list">
                  {variants.map(variant => {
                    const attributes = variant.attributes || {}
                    const attributeEntries = Object.entries(attributes)
                    const price = variant.price_list_rate || variant.standard_rate || 0

                    return (
                      <div
                        key={variant.name}
                        className="variant-list-item"
                        onClick={() => handleVariantClick(variant)}
                      >
                        <div className="variant-info">
                          <div className="variant-name">{variant.item_name}</div>
                          {attributeEntries.length > 0 && (
                            <div className="variant-attributes">
                              {attributeEntries.map(([attr, value]) => (
                                <span key={attr} className="attribute-badge">
                                  {attr}: {value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="variant-price">{formatCurrency(price)}</div>
                        <div className="variant-action">
                          <i className="fa fa-chevron-right"></i>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {variants.length > 0 && (
                <div className="variant-list-footer">
                  <p className="text-muted">
                    Showing {variants.length} variant{variants.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

VariantListModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  templateItem: PropTypes.object,
  posProfile: PropTypes.string,
  onSelectVariant: PropTypes.func.isRequired,
}
