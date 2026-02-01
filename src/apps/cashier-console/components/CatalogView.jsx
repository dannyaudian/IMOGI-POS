import { useState, useEffect } from 'react'
import { apiCall } from '@/shared/utils/api'

export function CatalogView({ posProfile, branch, menuChannel = 'Cashier', onSelectItem }) {
  const [itemGroups, setItemGroups] = useState([])
  const [items, setItems] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Don't fetch if posProfile is null (guard not passed yet)
    if (posProfile) {
      loadItemGroups()
    } else {
      setLoading(false)
    }
  }, [posProfile])

  useEffect(() => {
    // Don't fetch if posProfile is null or no group selected
    if (selectedGroup && posProfile) {
      loadItems()
    } else if (!posProfile) {
      setLoading(false)
    }
  }, [selectedGroup, posProfile, menuChannel])

  const loadItemGroups = async () => {
    if (!posProfile) {
      console.warn('[imogi][catalog] Cannot load item groups: posProfile is null')
      return
    }

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
    if (!posProfile) {
      console.warn('[imogi][catalog] Cannot load items: posProfile is null')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = {
        pos_profile: posProfile,
        item_group: selectedGroup === 'all' ? null : selectedGroup,
        menu_channel: menuChannel
      }

      if (import.meta.env.DEV) {
        console.log('[imogi][catalog] Fetching items:', params)
      }

      const response = await apiCall('imogi_pos.api.variants.get_template_items', params)
      
      // Normalize response - handle both direct array and {message: [...]} wrapper
      let itemsData = []
      if (Array.isArray(response)) {
        itemsData = response
      } else if (response && Array.isArray(response.message)) {
        itemsData = response.message
      } else if (response && response.message) {
        console.warn('[imogi][catalog] Unexpected response format:', response)
        itemsData = []
      }
      
      setItems(itemsData)

      if (import.meta.env.DEV) {
        console.log(`[imogi][catalog] Loaded ${itemsData.length} items for group "${selectedGroup}"`)
        if (itemsData.length === 0) {
          console.warn('[imogi][catalog] ZERO items returned! Check:')
          console.warn('  1. Are there items in database with disabled=0, is_sales_item=1, variant_of=null?')
          console.warn('  2. Does imogi_menu_channel match?', menuChannel)
          console.warn('  3. Check backend logs in developer mode')
        }
      }
    } catch (err) {
      const errorMsg = err?.message || err?.toString() || 'Unknown error'
      const statusCode = err?.httpStatus || err?.status || 'N/A'
      
      setError('Failed to load items')
      console.error('[imogi][catalog] Error loading items:', {
        error: errorMsg,
        status: statusCode,
        params: { posProfile, selectedGroup, menuChannel },
        fullError: err
      })
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
