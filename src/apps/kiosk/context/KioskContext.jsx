import React, { createContext, useContext, useMemo } from 'react'

const KioskContext = createContext()

export function KioskProvider({
  serviceType,
  items,
  itemsLoading,
  itemsError,
  children
}) {
  const contextValue = useMemo(() => ({
    serviceType,
    items,
    itemsLoading,
    itemsError
  }), [serviceType, items, itemsLoading, itemsError])

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
