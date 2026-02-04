/**
 * Cashier Console Context
 * 
 * Eliminates props drilling (20+ props passing through component tree)
 * Provides centralized state management for all cashier operations
 * 
 * Usage:
 * const { selectedOrder, viewMode, setViewMode } = useCashierContext()
 */

import React, { createContext, useContext, useMemo } from 'react'

const CashierContext = createContext(undefined)

/**
 * CashierProvider - Wraps entire cashier app with context
 * 
 * Provided state:
 * - Order management (selectedOrder, viewMode, orders)
 * - UI state (showPayment, showSplit, showSummary, etc.)
 * - Session data (effectiveOpening, posMode, branch, posProfile)
 * - Handlers (setSelectedOrder, setViewMode, openPayment, etc.)
 */
export function CashierProvider({
  // Order state
  selectedOrder,
  setSelectedOrder,
  viewMode,
  setViewMode,
  orders,
  ordersLoading,
  ordersError,
  
  // Multi-channel orders
  selfOrders,
  kioskOrders,
  
  // Modal/view state
  showPayment,
  setShowPayment,
  showSplit,
  setShowSplit,
  showSummary,
  setShowSummary,
  showCloseShift,
  setShowCloseShift,
  showVariantPicker,
  setShowVariantPicker,
  variantPickerContext,
  setVariantPickerContext,
  showTableSelector,
  setShowTableSelector,
  selectedTable,
  setSelectedTable,
  
  // Session & config
  effectiveOpening,
  posMode,
  posProfile,
  branch,
  profileData,
  branding,
  printerStatus,
  
  // Status & validation
  guardPassed,
  hasValidOpening,
  creatingOrder,
  isCustomerDisplayOpen,
  openCustomerDisplay,
  closeCustomerDisplay,
  
  // Children
  children
}) {
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    // Order state
    selectedOrder,
    setSelectedOrder,
    viewMode,
    setViewMode,
    orders,
    ordersLoading,
    ordersError,
    
    // Multi-channel orders
    selfOrders,
    kioskOrders,
    
    // Modal/view state
    showPayment,
    setShowPayment,
    showSplit,
    setShowSplit,
    showSummary,
    setShowSummary,
    showCloseShift,
    setShowCloseShift,
    showVariantPicker,
    setShowVariantPicker,
    variantPickerContext,
    setVariantPickerContext,
    showTableSelector,
    setShowTableSelector,
    selectedTable,
    setSelectedTable,
    
    // Session & config
    effectiveOpening,
    posMode,
    posProfile,
    branch,
    profileData,
    branding,
    printerStatus,
    
    // Status & validation
    guardPassed,
    hasValidOpening,
    creatingOrder,
    isCustomerDisplayOpen,
    openCustomerDisplay,
    closeCustomerDisplay,
  }), [
    selectedOrder,
    viewMode,
    orders,
    ordersLoading,
    ordersError,
    selfOrders,
    kioskOrders,
    showPayment,
    showSplit,
    showSummary,
    showCloseShift,
    showVariantPicker,
    variantPickerContext,
    showTableSelector,
    selectedTable,
    effectiveOpening,
    posMode,
    posProfile,
    branch,
    profileData,
    branding,
    printerStatus,
    guardPassed,
    hasValidOpening,
    creatingOrder,
    isCustomerDisplayOpen
  ])

  return (
    <CashierContext.Provider value={contextValue}>
      {children}
    </CashierContext.Provider>
  )
}

/**
 * useCashierContext - Hook to access cashier context
 * 
 * @throws Error if used outside CashierProvider
 * @returns Object with all cashier state and handlers
 * 
 * Example:
 * const { selectedOrder, setSelectedOrder, viewMode, setViewMode } = useCashierContext()
 */
export function useCashierContext() {
  const context = useContext(CashierContext)
  
  if (!context) {
    throw new Error('useCashierContext must be used within CashierProvider')
  }
  
  return context
}
