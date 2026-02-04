/**
 * ModuleSelectContext - Shared state for Module Select app
 * 
 * Eliminates props drilling by centralizing:
 * - Module data & loading state
 * - POS Profile & branch info
 * - Opening & sessions data
 * - User roles & permissions
 * - Navigation state
 */

import React, { createContext, useContext, useMemo } from 'react'

export const ModuleSelectContext = createContext()

export function ModuleSelectProvider({ 
  modules = [],
  loading = true,
  activeOpening = null,
  sessionsToday = { sessions: [], total: 0 },
  realtimeBanner = null,
  debugInfo = null,
  contextData = {},
  userRoles = [],
  visibleModules = [],
  navigationLock = false,
  navigatingToModule = null,
  posOpeningStatus = {},
  children 
}) {
  
  const value = useMemo(() => ({
    // Module data
    modules,
    loading,
    
    // POS Opening & Sessions
    activeOpening,
    sessionsToday,
    
    // Realtime status
    realtimeBanner,
    debugInfo,
    
    // Context data (profile, branch, roles)
    contextData,
    userRoles,
    
    // Filtered & visible modules
    visibleModules,
    
    // Navigation state
    navigationLock,
    navigatingToModule,
    
    // POS opening status
    posOpeningStatus
  }), [
    modules, loading, activeOpening, sessionsToday, realtimeBanner,
    debugInfo, contextData, userRoles, visibleModules, navigationLock,
    navigatingToModule, posOpeningStatus
  ])

  return (
    <ModuleSelectContext.Provider value={value}>
      {children}
    </ModuleSelectContext.Provider>
  )
}

/**
 * Hook to use ModuleSelectContext
 */
export function useModuleSelectContext() {
  const context = useContext(ModuleSelectContext)
  if (!context) {
    throw new Error('useModuleSelectContext must be used within ModuleSelectProvider')
  }
  return context
}
