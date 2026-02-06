/**
 * ModuleSelectContext - Shared state for Module Select app
 * 
 * Eliminates props drilling by centralizing:
 * - Module data & loading state
 * - POS Profile & branch info
 * - Opening & sessions data
 * - User roles & permissions
 * - Navigation state
 * 
 * OPTIMIZATION: Deep memoization to prevent unnecessary re-renders
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react'

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
  
  // Memoize complex objects separately to avoid reference changes
  const memoizedContextData = useMemo(() => contextData, [
    contextData.pos_profile,
    contextData.branch,
    contextData.require_selection,
    contextData.is_privileged,
    // Don't include available_pos_profiles in deps unless it changes frequently
  ])

  const memoizedSessionsToday = useMemo(() => sessionsToday, [
    sessionsToday.total,
    sessionsToday.sessions?.length
  ])

  const memoizedPosOpeningStatus = useMemo(() => posOpeningStatus, [
    posOpeningStatus.hasOpening,
    posOpeningStatus.posOpeningEntry
  ])

  // Memoize arrays to prevent re-renders on same content
  const memoizedModules = useMemo(() => modules, [modules.length, modules.map(m => m.type).join(',')])
  const memoizedVisibleModules = useMemo(() => visibleModules, [visibleModules.length, visibleModules.map(m => m.type).join(',')])
  const memoizedUserRoles = useMemo(() => userRoles, [userRoles.join(',')])

  const value = useMemo(() => ({
    // Module data
    modules: memoizedModules,
    loading,
    
    // POS Opening & Sessions
    activeOpening,
    sessionsToday: memoizedSessionsToday,
    
    // Realtime status
    realtimeBanner,
    debugInfo,
    
    // Context data (profile, branch, roles)
    contextData: memoizedContextData,
    userRoles: memoizedUserRoles,
    
    // Filtered & visible modules
    visibleModules: memoizedVisibleModules,
    
    // Navigation state
    navigationLock,
    navigatingToModule,
    
    // POS opening status
    posOpeningStatus: memoizedPosOpeningStatus
  }), [
    memoizedModules,
    loading,
    activeOpening,
    memoizedSessionsToday,
    realtimeBanner,
    debugInfo,
    memoizedContextData,
    memoizedUserRoles,
    memoizedVisibleModules,
    navigationLock,
    navigatingToModule,
    memoizedPosOpeningStatus
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
