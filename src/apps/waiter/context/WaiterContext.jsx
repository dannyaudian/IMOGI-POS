/**
 * Waiter Context
 * 
 * Centralized state management for waiter app
 * Eliminates props drilling through component tree
 * 
 * Usage:
 * const { selectedTable, cartItems, handleSendToKitchen } = useWaiterContext()
 */

import React, { createContext, useContext, useMemo } from 'react'

const WaiterContext = createContext(undefined)

/**
 * WaiterProvider - Wraps waiter app with context
 * 
 * Provides:
 * - Table selection state
 * - Category selection
 * - Cart management
 * - Data (tables, items, categories)
 * - Loading & error states
 * - Handlers (select table, add to cart, send to kitchen)
 */
export function WaiterProvider({
  // Table state
  selectedTable,
  setSelectedTable,
  tables,
  tablesLoading,
  tablesError,
  
  // Menu state
  selectedCategory,
  setSelectedCategory,
  items,
  itemsLoading,
  itemsError,
  categories,
  
  // Cart state
  cartItems,
  addItem,
  removeItem,
  updateQuantity,
  updateNotes,
  clearCart,
  getCartSummary,
  
  // Order state
  orderLoading,
  orderError,
  handleSendToKitchen,
  
  // Mode
  mode,
  
  // UI state
  showSuccessMessage,
  
  children
}) {
  const contextValue = useMemo(() => ({
    // Table state
    selectedTable,
    setSelectedTable,
    tables,
    tablesLoading,
    tablesError,
    
    // Menu state
    selectedCategory,
    setSelectedCategory,
    items,
    itemsLoading,
    itemsError,
    categories,
    
    // Cart state
    cartItems,
    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,
    getCartSummary,
    
    // Order state
    orderLoading,
    orderError,
    handleSendToKitchen,
    
    // Mode
    mode,
    
    // UI state
    showSuccessMessage
  }), [
    selectedTable,
    tables,
    tablesLoading,
    tablesError,
    selectedCategory,
    items,
    itemsLoading,
    itemsError,
    categories,
    cartItems,
    orderLoading,
    orderError,
    mode,
    showSuccessMessage
  ])

  return (
    <WaiterContext.Provider value={contextValue}>
      {children}
    </WaiterContext.Provider>
  )
}

/**
 * useWaiterContext - Access waiter context
 * @throws Error if used outside WaiterProvider
 */
export function useWaiterContext() {
  const context = useContext(WaiterContext)
  
  if (!context) {
    throw new Error('useWaiterContext must be used within WaiterProvider')
  }
  
  return context
}
