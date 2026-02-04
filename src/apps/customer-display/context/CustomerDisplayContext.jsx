import React, { createContext, useContext, useMemo } from 'react'

const CustomerDisplayContext = createContext()

export function CustomerDisplayProvider({
  currentOrder,
  loading,
  children
}) {
  const contextValue = useMemo(() => ({
    currentOrder,
    loading
  }), [currentOrder, loading])

  return (
    <CustomerDisplayContext.Provider value={contextValue}>
      {children}
    </CustomerDisplayContext.Provider>
  )
}

export function useCustomerDisplayContext() {
  const context = useContext(CustomerDisplayContext)
  if (!context) {
    throw new Error('useCustomerDisplayContext must be used within CustomerDisplayProvider')
  }
  return context
}
