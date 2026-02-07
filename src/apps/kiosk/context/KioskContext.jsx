import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'

const KioskContext = createContext()

export function KioskProvider({
  serviceType,
  items,
  itemsLoading,
  itemsError,
  children
}) {
  const [cart, setCart] = useState([])
  const [showVariantPicker, setShowVariantPicker] = useState(false)
  const [selectedTemplateItem, setSelectedTemplateItem] = useState(null)

  const addToCart = useCallback((item, quantity = 1) => {
    if (!item?.item_code) return
    
    setCart(prev => {
      const existing = prev.find(c => c.item_code === item.item_code)
      if (existing) {
        return prev.map(c => 
          c.item_code === item.item_code 
            ? { ...c, qty: c.qty + quantity }
            : c
        )
      }
      return [...prev, { ...item, qty: quantity }]
    })
  }, [])

  const updateCartItemQty = useCallback((itemCode, newQty) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(c => c.item_code !== itemCode))
    } else {
      setCart(prev => prev.map(c => 
        c.item_code === itemCode ? { ...c, qty: newQty } : c
      ))
    }
  }, [])

  const removeFromCart = useCallback((itemCode) => {
    setCart(prev => prev.filter(c => c.item_code !== itemCode))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
  }, [])

  const openVariantPicker = useCallback((templateItem) => {
    setSelectedTemplateItem(templateItem)
    setShowVariantPicker(true)
  }, [])

  const closeVariantPicker = useCallback(() => {
    setShowVariantPicker(false)
    setSelectedTemplateItem(null)
  }, [])

  const selectVariant = useCallback((variant) => {
    if (variant?.item_code) {
      addToCart(variant, 1)
    }
    closeVariantPicker()
  }, [addToCart, closeVariantPicker])

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.rate || 0) * item.qty, 0)
  }, [cart])

  const contextValue = useMemo(() => ({
    serviceType,
    items,
    itemsLoading,
    itemsError,
    cart,
    cartTotal,
    addToCart,
    updateCartItemQty,
    removeFromCart,
    clearCart,
    showVariantPicker,
    selectedTemplateItem,
    openVariantPicker,
    closeVariantPicker,
    selectVariant
  }), [
    serviceType, 
    items, 
    itemsLoading, 
    itemsError, 
    cart, 
    cartTotal,
    addToCart,
    updateCartItemQty,
    removeFromCart,
    clearCart,
    showVariantPicker,
    selectedTemplateItem,
    openVariantPicker,
    closeVariantPicker,
    selectVariant
  ])

  return (
    <KioskContext.Provider value={contextValue}>
      {children}
    </KioskContext.Provider>
  )
}

export function useKioskContext() {
  const context = useContext(KioskContext)
  if (!context) {
    throw new Error('useKioskContext must be used within KioskProvider')
  }
  return context
}
