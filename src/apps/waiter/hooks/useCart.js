import { useState, useCallback } from 'react'

/**
 * Hook for managing order cart state and operations
 * @param {Function} onCartChange - Callback when cart changes
 */
export function useCart(onCartChange) {
  const [items, setItems] = useState([])

  /**
   * Add item to cart or increase quantity if exists
   * @param {Object} item - Item to add with qty, item_code, item_name, rate
   */
  const addItem = useCallback((item) => {
    setItems(currentItems => {
      // Check if item already exists in cart
      const existingIndex = currentItems.findIndex(
        i => i.item_code === item.item_code && i.variant_of === item.variant_of
      )

      let newItems
      if (existingIndex >= 0) {
        // Increase quantity
        newItems = [...currentItems]
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          qty: newItems[existingIndex].qty + (item.qty || 1)
        }
      } else {
        // Add new item
        newItems = [
          ...currentItems,
          {
            item_code: item.item_code,
            item_name: item.item_name,
            qty: item.qty || 1,
            rate: item.standard_rate || item.rate,
            uom: item.stock_uom,
            variant_of: item.variant_of || null,
            notes: item.notes || '',
            station: item.production_station || null
          }
        ]
      }

      if (onCartChange) onCartChange(newItems)
      return newItems
    })
  }, [onCartChange])

  /**
   * Remove item from cart by index
   * @param {number} index - Item index to remove
   */
  const removeItem = useCallback((index) => {
    setItems(currentItems => {
      const newItems = currentItems.filter((_, i) => i !== index)
      if (onCartChange) onCartChange(newItems)
      return newItems
    })
  }, [onCartChange])

  /**
   * Update item quantity
   * @param {number} index - Item index
   * @param {number} qty - New quantity
   */
  const updateQuantity = useCallback((index, qty) => {
    if (qty < 1) return // Don't allow zero quantity

    setItems(currentItems => {
      const newItems = [...currentItems]
      newItems[index] = { ...newItems[index], qty }
      if (onCartChange) onCartChange(newItems)
      return newItems
    })
  }, [onCartChange])

  /**
   * Add or update item notes
   * @param {number} index - Item index
   * @param {string} notes - Special instructions
   */
  const updateNotes = useCallback((index, notes) => {
    setItems(currentItems => {
      const newItems = [...currentItems]
      newItems[index] = { ...newItems[index], notes }
      if (onCartChange) onCartChange(newItems)
      return newItems
    })
  }, [onCartChange])

  /**
   * Clear all items from cart
   */
  const clearCart = useCallback(() => {
    setItems([])
    if (onCartChange) onCartChange([])
  }, [onCartChange])

  /**
   * Get cart summary
   */
  const getCartSummary = useCallback(() => {
    const totalItems = items.reduce((sum, item) => sum + item.qty, 0)
    const subtotal = items.reduce((sum, item) => sum + (item.rate * item.qty), 0)
    
    return {
      itemCount: items.length,
      totalQuantity: totalItems,
      subtotal,
      items
    }
  }, [items])

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,
    getCartSummary
  }
}
