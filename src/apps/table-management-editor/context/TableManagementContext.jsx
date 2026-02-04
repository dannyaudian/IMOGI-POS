import React, { createContext, useContext, useMemo } from 'react'

const TableManagementContext = createContext()

export function TableManagementProvider({
  branch,
  user,
  activeTab,
  setActiveTab,
  selectedFloor,
  setSelectedFloor,
  layoutData,
  layoutError,
  layoutLoading,
  onSaveLayout,
  onAddNode,
  children
}) {
  const contextValue = useMemo(() => ({
    // UI STATE
    activeTab,
    setActiveTab,
    selectedFloor,
    setSelectedFloor,
    // DATA
    branch,
    user,
    layoutData,
    layoutError,
    layoutLoading,
    // HANDLERS
    onSaveLayout,
    onAddNode
  }), [
    activeTab, setActiveTab,
    selectedFloor, setSelectedFloor,
    branch, user, layoutData, layoutError, layoutLoading,
    onSaveLayout, onAddNode
  ])

  return (
    <TableManagementContext.Provider value={contextValue}>
      {children}
    </TableManagementContext.Provider>
  )
}

export function useTableManagementContext() {
  const context = useContext(TableManagementContext)
  if (!context) {
    throw new Error('useTableManagementContext must be used within TableManagementProvider')
  }
  return context
}
