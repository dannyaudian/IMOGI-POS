import React, { createContext, useContext, useMemo } from 'react'

const TableDisplayContext = createContext()

export function TableDisplayProvider({
  branch,
  tables,
  isLoading,
  error,
  children
}) {
  const contextValue = useMemo(() => ({
    branch,
    tables,
    isLoading,
    error
  }), [branch, tables, isLoading, error])

  return (
    <TableDisplayContext.Provider value={contextValue}>
      {children}
    </TableDisplayContext.Provider>
  )
}

export function useTableDisplayContext() {
  const context = useContext(TableDisplayContext)
  if (!context) {
    throw new Error('useTableDisplayContext must be used within TableDisplayProvider')
  }
  return context
}
