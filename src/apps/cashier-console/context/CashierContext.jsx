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
  // DEEP MEMOIZATION: Check specific props instead of entire objects
  // This prevents re-renders when object reference changes but content is same
  
  // Memoize orders array (check length and order names)
  const memoizedOrders = useMemo(() => orders, [
    orders?.length,
    orders?.map(o => o.name).join(',')
  ])
  
  // Memoize selfOrders array
  const memoizedSelfOrders = useMemo(() => selfOrders, [
    selfOrders?.length,
    selfOrders?.map(o => o.name).join(',')
  ])
  
  // Memoize kioskOrders array
  const memoizedKioskOrders = useMemo(() => kioskOrders, [
    kioskOrders?.length,
    kioskOrders?.map(o => o.name).join(',')
  ])
  
  // Memoize selected order (check name and grand_total)
  const memoizedSelectedOrder = useMemo(() => selectedOrder, [
    selectedOrder?.name,
    selectedOrder?.grand_total,
    selectedOrder?.items?.length
  ])
  
  // Memoize profile data (check critical fields only)
  const memoizedProfileData = useMemo(() => profileData, [
    profileData?.name,
    profileData?.mode,
    profileData?.imogi_enable_self_order,
    profileData?.imogi_enable_kiosk
  ])
  
  // Memoize branding (check logo and colors)
  const memoizedBranding = useMemo(() => branding, [
    branding?.logo,
    branding?.primary_color,
    branding?.secondary_color
  ])
  
  // Memoize printer status
  const memoizedPrinterStatus = useMemo(() => printerStatus, [
    printerStatus?.connected,
    printerStatus?.checking
  ])

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    // Order state
    selectedOrder: memoizedSelectedOrder,
    setSelectedOrder,
    viewMode,
    setViewMode,
    orders: memoizedOrders,
    ordersLoading,
    ordersError,
    
    // Multi-channel orders
    selfOrders: memoizedSelfOrders,
    kioskOrders: memoizedKioskOrders,
    
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
    profileData: memoizedProfileData,
    branding: memoizedBranding,
    printerStatus: memoizedPrinterStatus,
    
    // Status & validation
    guardPassed,
    hasValidOpening,
    creatingOrder,
    isCustomerDisplayOpen,
    openCustomerDisplay,
    closeCustomerDisplay,
  }), [
    memoizedSelectedOrder,
    setSelectedOrder,
    viewMode,
    setViewMode,
    memoizedOrders,
    ordersLoading,
    ordersError,
    memoizedSelfOrders,
    memoizedKioskOrders,
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
    effectiveOpening,
    posMode,
    posProfile,
    branch,
    memoizedProfileData,
    memoizedBranding,
    memoizedPrinterStatus,
    guardPassed,
    hasValidOpening,
    creatingOrder,
    isCustomerDisplayOpen,
    openCustomerDisplay,
    closeCustomerDisplay
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
