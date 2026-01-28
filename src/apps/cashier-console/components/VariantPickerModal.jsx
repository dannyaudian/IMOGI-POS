import { useState, useEffect } from 'react'
import { apiCall } from '@/shared/utils/api'

export function VariantPickerModal({ 
  isOpen, 
  onClose, 
  templateName,
  mode = 'add', // 'add' or 'convert'
  onSelectVariant 
}) {
  const [variants, setVariants] = useState([])
  const [attributes, setAttributes] = useState([])
  const [selectedFilters, setSelectedFilters] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen && templateName) {
      loadVariants()
    }
  }, [isOpen, templateName])

  const loadVariants = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await apiCall('imogi_pos.api.variants.get_item_variants', {
        template: templateName
      })
      setVariants(result.variants || [])
      setAttributes(result.attributes || [])
    } catch (err) {
      setError('Failed to load variants')
      console.error('[imogi][variants] Error loading variants:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (attributeName, value) => {
    setSelectedFilters(prev => ({
      ...prev,
      [attributeName]: value
    }))
  }

  const clearFilters = () => {
    setSelectedFilters({})
  }

  const getFilteredVariants = () => {
    if (Object.keys(selectedFilters).length === 0) {
      return variants
    }

    return variants.filter(variant => {
      const variantAttrs = variant.attributes || {}
      
      return Object.entries(selectedFilters).every(([attr, value]) => {
        if (!value) return true // Skip empty filters
        return variantAttrs[attr] === value
      })
    })
  }

  const handleVariantClick = (variant) => {
    if (onSelectVariant) {
      onSelectVariant(variant.name, mode)
    }
    onClose()
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const getAttributeValues = (attributeName) => {
    const values = new Set()
    variants.forEach(variant => {
      const attrs = variant.attributes || {}
      if (attrs[attributeName]) {
        values.add(attrs[attributeName])
      }
    })
    return Array.from(values).sort()
  }

  if (!isOpen) return null

  const filteredVariants = getFilteredVariants()
  const modalTitle = mode === 'convert' ? 'Select Variant to Replace Template' : 'Select Variant'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content variant-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{modalTitle}</h3>
          <button className="modal-close" onClick={onClose}>
            &times;
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
              {/* Attribute Filters */}
              {attributes.length > 0 && (
                <div className="variant-filters">
                  <div className="filter-header">
                    <h4>Filter by Attributes</h4>
                    {Object.keys(selectedFilters).length > 0 && (
                      <button onClick={clearFilters} className="btn-clear-filters">
                        Clear All
                      </button>
                    )}
                  </div>
                  
                  <div className="filter-grid">
                    {attributes.map(attr => {
                      const attrName = attr.name || attr.attribute
                      const values = getAttributeValues(attrName)
                      
                      return (
                        <div key={attrName} className="variant-filter">
                          <label>{attrName}</label>
                          <select
                            value={selectedFilters[attrName] || ''}
                            onChange={(e) => handleFilterChange(attrName, e.target.value)}
                            className="variant-attribute-select"
                          >
                            <option value="">All {attrName}</option>
                            {values.map(value => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Variant List */}
              <div className="variant-list">
                {filteredVariants.length === 0 ? (
                  <div className="empty-state">
                    <i className="fa fa-inbox"></i>
                    <p>No variants found</p>
                    {Object.keys(selectedFilters).length > 0 && (
                      <button onClick={clearFilters} className="btn-secondary">
                        Clear Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="variant-grid">
                    {filteredVariants.map(variant => {
                      const attrs = variant.attributes || {}
                      const price = variant.rate || variant.standard_rate || 0
                      
                      return (
                        <div
                          key={variant.name}
                          className="variant-card"
                          onClick={() => handleVariantClick(variant)}
                        >
                          {variant.image && (
                            <div className="variant-image">
                              <img src={variant.image} alt={variant.item_name} />
                            </div>
                          )}
                          
                          <div className="variant-info">
                            <div className="variant-name">{variant.item_name}</div>
                            
                            {Object.keys(attrs).length > 0 && (
                              <div className="variant-attrs">
                                {Object.entries(attrs).map(([key, value]) => (
                                  <span key={key} className="variant-attr-badge">
                                    {value}
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            <div className="variant-price">{formatCurrency(price)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Results Count */}
              {filteredVariants.length > 0 && (
                <div className="variant-count">
                  Showing {filteredVariants.length} of {variants.length} variants
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
