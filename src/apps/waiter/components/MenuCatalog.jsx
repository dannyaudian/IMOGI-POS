import React, { useState, useEffect, useMemo } from 'react'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { formatCurrency } from '@/shared/utils/formatters'
import { TIMING } from '../constants'

/**
 * MenuCatalog Component
 * Item listing with categories, search, and quick add
 */

export function MenuCatalog({ 
  items, 
  categories, 
  onAddToCart, 
  selectedCategory,
  onCategoryChange,
  loading 
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, TIMING.DEBOUNCE_SEARCH)
  
  // Ensure items and categories are arrays
  const itemList = Array.isArray(items) ? items : []
  const categoryList = Array.isArray(categories) ? categories : []

  const filteredItems = useMemo(() => {
    return itemList.filter(item => {
      // Filter by category
      if (selectedCategory && item.item_group !== selectedCategory) {
        return false
      }

      // Filter by search query (debounced)
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase()
      return (
        item.item_name.toLowerCase().includes(query) ||
        item.item_code.toLowerCase().includes(query)
      )
    }

      return true
    })
  }, [itemList, selectedCategory, debouncedSearch])

  return (
    <div className="menu-catalog">
      <div className="catalog-header">
        <h3>Menu</h3>
        <input
          type="text"
          className="search-input"
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="category-tabs">
        <button
          className={`category-tab ${!selectedCategory ? 'active' : ''}`}
          onClick={() => onCategoryChange(null)}
        >
          All
        </button>
        {categoryList.map(category => (
          <button
            key={category}
            className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
            onClick={() => onCategoryChange(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="catalog-items">
        {loading && (
          <div className="catalog-loading">Loading menu...</div>
        )}

        {!loading && filteredItems.length === 0 && (
          <div className="catalog-empty">
            <p>No items found</p>
            {searchQuery && (
              <small>Try a different search term</small>
            )}
          </div>
        )}

        {!loading && filteredItems.map(item => (
          <MenuItem
            key={item.name}
            item={item}
            onAdd={() => onAddToCart(item)}
          />
        ))}
      </div>
    </div>
  )
}

function MenuItem({ item, onAdd }) {
  const [quantity, setQuantity] = useState(1)
  const hasVariants = item.has_variants === 1 || item.has_variants === true

  const handleAdd = () => {
    if (hasVariants) {
      // TODO: Open variant picker modal
      frappe.show_alert({
        message: `${item.item_name} has variants. Variant picker coming soon!`,
        indicator: 'orange'
      }, 3)
      return
    }
    
    onAdd({ ...item, qty: quantity })
    setQuantity(1)
  }

  const isAvailable = item.is_stock_item ? (item.actual_qty || 0) > 0 : true

  return (
    <div className={`menu-item ${!isAvailable ? 'unavailable' : ''}`}>
      {item.image && (
        <div className="item-image">
          <img src={item.image} alt={item.item_name} />
        </div>
      )}

      <div className="item-info">
        <div className="item-name">
          {item.item_name}
          {hasVariants && (
            <span className="variant-badge" style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.5rem',
              background: '#3b82f6',
              color: 'white',
              fontSize: '0.625rem',
              borderRadius: '4px',
              fontWeight: '600'
            }}>
              HAS VARIANTS
            </span>
          )}
        </div>
        
        {item.description && (
          <div className="item-description">{item.description}</div>
        )}

        <div className="item-meta">
          {item.item_group && (
            <span className="item-category">{item.item_group}</span>
          )}
          {item.is_stock_item && (
            <span className={`item-stock ${isAvailable ? 'in-stock' : 'out-of-stock'}`}>
              {isAvailable ? `Stock: ${item.actual_qty}` : 'Out of Stock'}
            </span>
          )}
        </div>

        <div className="item-footer">
          <div className="item-price">
            {frappe.format(item.standard_rate, { fieldtype: 'Currency' })}
          </div>

          <div className="item-actions">
            <div className="qty-selector">
              <button
                className="qty-btn"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={!isAvailable}
              >
                −
              </button>
              <span className="qty-value">{quantity}</span>
              <button
                className="qty-btn"
                onClick={() => setQuantity(quantity + 1)}
                disabled={!isAvailable}
              >
                +
              </button>
            </div>

            <button
              className="btn-add-cart"
              onClick={handleAdd}
              disabled={!isAvailable}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
