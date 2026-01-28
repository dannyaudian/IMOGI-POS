import { useState, useEffect } from 'react'
import { apiCall } from '@/shared/utils/api'

export function CatalogView({ posProfile, onSelectItem }) {
  const [itemGroups, setItemGroups] = useState([])
  const [items, setItems] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadItemGroups()
  }, [posProfile])

  useEffect(() => {
    if (selectedGroup) {
      loadItems()
    }
  }, [selectedGroup, posProfile])

  const loadItemGroups = async () => {
    try {
      const groups = await apiCall('imogi_pos.api.variants.get_item_groups', {
        pos_profile: posProfile
      })
      setItemGroups(groups || [])
    } catch (err) {
      console.error('[imogi][catalog] Error loading item groups:', err)
    }
  }

  const loadItems = async () => {
    setLoading(true)
    setError(null)

    try {
      const items = await apiCall('imogi_pos.api.variants.get_template_items', {
        pos_profile: posProfile,
        item_group: selectedGroup === 'all' ? null : selectedGroup
      })
      setItems(items || [])
    } catch (err) {
      setError('Failed to load items')
      console.error('[imogi][catalog] Error loading items:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const handleItemClick = (item) => {
    if (onSelectItem) {
      onSelectItem(item)
    }
  }

  return (
    <div className="catalog-panel">
      <div className="catalog-container">
        {/* Item Groups Sidebar */}
        <div className="catalog-sidebar">
          <div className="item-group-list">
            <button
              className={`item-group-btn ${selectedGroup === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedGroup('all')}
            >
              <i className="fa fa-th"></i>
              All Items
            </button>
            
            {itemGroups.map(group => (
              <button
                key={group.name}
                className={`item-group-btn ${selectedGroup === group.name ? 'active' : ''}`}
                onClick={() => setSelectedGroup(group.name)}
              >
                {group.name}
              </button>
            ))}
          </div>
        </div>

        {/* Items Grid */}
        <div className="catalog-main">
          {loading && (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading items...</p>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={loadItems} className="btn-retry">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="catalog-items">
              {items.length === 0 ? (
                <div className="empty-state">
                  <i className="fa fa-shopping-cart empty-icon"></i>
                  <p>No items found in this category</p>
                </div>
              ) : (
                <div className="catalog-grid">
                  {items.map(item => {
                    const hasVariants = item.has_variants === 1 || item.has_variants === true
                    const priceText = hasVariants && item.price_display 
                      ? item.price_display 
                      : formatCurrency(item.standard_rate || 0)

                    return (
                      <div
                        key={item.name}
                        className={`catalog-item ${hasVariants ? 'has-variants' : ''}`}
                        onClick={() => handleItemClick(item)}
                      >
                        {item.image && (
                          <div className="item-image">
                            <img src={item.image} alt={item.item_name} />
                          </div>
                        )}
                        
                        <div className="item-details">
                          <div className="item-name">
                            {item.item_name}
                            {hasVariants && (
                              <i className="fa fa-list variant-icon" title="Has variants"></i>
                            )}
                          </div>
                          <div className="item-price">{priceText}</div>
                          
                          {item.description && (
                            <div className="item-description">{item.description}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
