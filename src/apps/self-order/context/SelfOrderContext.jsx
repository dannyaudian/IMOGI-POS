import React, { createContext, useContext, useMemo } from 'react'

const SelfOrderContext = createContext()

export function SelfOrderProvider({
  tableNumber,
  items,
  itemsLoading,
  itemsError,
  children
}) {
  const contextValue = useMemo(() => ({
    tableNumber,
    items,
    itemsLoading,
    itemsError
  }), [tableNumber, items, itemsLoading, itemsError])

  return (
    <SelfOrderContext.Provider value={contextValue}>
      {children}
    </SelfOrderContext.Provider>
  )
}

export function useSelfOrderContext() {
  const context = useContext(SelfOrderContext)
  if (!context) {
    throw new Error('useSelfOrderContext must be used within SelfOrderProvider')
  }
  return context
}
