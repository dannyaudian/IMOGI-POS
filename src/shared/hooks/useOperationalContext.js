/**
 * IMOGI POS - useOperationalContext Hook
 * 
 * React hook for managing Operational Context with centralized backend API.
 * 
 * Architecture:
 * - Backend is SOURCE OF TRUTH
 * - Frontend is CONSUMER ONLY
 * - No URL-based state management
 * - No business logic inference
 * - Session-based context storage
 * 
 * Usage:
 *   const { context, setContext, isLoading, requireContext } = useOperationalContext()
 *   
 *   // Get current context
 *   console.log(context.pos_profile, context.branch)
 *   
 *   // Set new context
 *   await setContext({ pos_profile: 'Main-POS' })
 *   
 *   // Require context (redirects to module select if missing)
 *   requireContext()
 */

import { useState, useEffect, useCallback } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import storage from '../utils/storage'

// CRITICAL: Use same cache key as operationalContext.ts resolver
// storage.getItem/setItem auto-adds 'imogi_' prefix, so this becomes 'imogi_operational_context_cache'
const CACHE_KEY = 'operational_context_cache'
const asArray = (value) => (Array.isArray(value) ? value : [])

/**
 * Hook to manage Operational Context
 * @param {Object} options - Hook options
 * @param {boolean} options.autoResolve - Auto-resolve context on mount (default: true)
 * @returns {Object} Operational context state and methods
 */
export function useOperationalContext(options = {}) {
  const { autoResolve = true } = options
  
  // CRITICAL FIX: Initialize state safely (avoid TDZ)
  // - Don't call storage.getItem() in initializer (deferred side effect)
  // - Will be populated by useEffect after component mount
  const [context, setContextState] = useState(null)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  
  const [serverContextState, setServerContextState] = useState(() => {
    const initial = window.__IMOGI_SERVER_CONTEXT_STATE__ || {}
    return {
      ready: Boolean(initial.ready),
      loading: Boolean(initial.loading),
      error: initial.error || null
    }
  })
  
  // CRITICAL FIX: Load cache in effect, not during module init
  // This defers side effects until React component lifecycle is safe
  useEffect(() => {
    if (cacheLoaded) return
    
    try {
      const cached = storage.getItem(CACHE_KEY)
      if (cached) {
        setContextState(cached)
      }
    } catch (e) {
      // Storage access failed - this is safe to ignore
      // Server will provide context in next fetch
      console.warn('[useOperationalContext] Cache load failed:', e)
    }
    
    setCacheLoaded(true)
  }, [])
  
  // Fetch context from server (authoritative source)
  const { 
    data: serverContext, 
    isLoading, 
    error, 
    mutate: refetch 
  } = useFrappeGetCall(
    'imogi_pos.utils.operational_context.get_operational_context',
    undefined,
    undefined,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      shouldRetryOnError: false
    }
  )
  
  // API for setting context on server
  const { call: setContextOnServer } = useFrappePostCall(
    'imogi_pos.utils.operational_context.set_operational_context'
  )
  
  // Update local state when server context changes
  useEffect(() => {
    if (!serverContext) {
      return
    }
    
    // Check if this is a full resolution or active context
    // BUGFIX: Use active_context only if it has pos_profile, otherwise use current_pos_profile
    const hasActiveContext = serverContext.active_context?.pos_profile
    const activeContext = hasActiveContext 
      ? serverContext.active_context
      : {
          pos_profile: serverContext.current_pos_profile,
          branch: serverContext.current_branch
        }
    
    const newContext = {
      pos_profile: activeContext.pos_profile || null,
      branch: activeContext.branch || null,
      
      // Additional metadata from resolution
      available_pos_profiles: asArray(serverContext.available_pos_profiles),
      branches: asArray(serverContext.branches),
      require_selection: serverContext.require_selection || false,
      has_access: serverContext.has_access !== false,
      role_class: serverContext.role_class || null,
      is_privileged: serverContext.is_privileged || false,
      context_required: serverContext.context_required !== false
    }
    
    setContextState(newContext)
    
    // Cache for faster subsequent renders - only cache if we have a profile
    if (activeContext.pos_profile) {
      storage.setItem(CACHE_KEY, activeContext)
    }
    
    // CRITICAL FIX: Auto-set context on server if resolved but not in session
    // This ensures server session is synchronized with client state
    // Only auto-set if:
    // 1. A profile was resolved (current_pos_profile exists)
    // 2. No active_context in response (meaning it wasn't in session)
    // 3. Auto-resolve is enabled (default behavior)
    // 
    // ENHANCEMENT: Also check if session context differs from resolved context
    const hasServerContext = serverContext.active_context?.pos_profile
    const resolvedProfile = serverContext.current_pos_profile
    const needsSyncToServer = resolvedProfile && (!hasServerContext || hasServerContext !== resolvedProfile)
    
    if (autoResolve && needsSyncToServer) {
      console.log('[OperationalContext] Auto-setting context on server:', {
        resolved: resolvedProfile,
        serverHas: hasServerContext || 'none'
      })
      // Silently set context on server to sync session
      setContextOnServer({
        pos_profile: serverContext.current_pos_profile,
        branch: serverContext.current_branch || null
      }).catch(err => {
        console.warn('[OperationalContext] Failed to auto-set context on server:', err)
      })
    }
  }, [serverContext, autoResolve, setContextOnServer])

  useEffect(() => {
    const handleServerContextUpdate = (event) => {
      if (!event?.detail) {
        return
      }
      setServerContextState({
        ready: Boolean(event.detail.ready),
        loading: Boolean(event.detail.loading),
        error: event.detail.error || null
      })
    }

    window.addEventListener('imogiServerContextUpdated', handleServerContextUpdate)
    return () => window.removeEventListener('imogiServerContextUpdated', handleServerContextUpdate)
  }, [])
  
  /**
   * Set operational context (server-side storage)
   * @param {Object} newContext - Context to set
   * @param {string} newContext.pos_profile - POS Profile name
   * @param {string} newContext.branch - Branch name (optional, derived from profile)
   * @returns {Promise<Object>} Updated context
   */
  const setContext = useCallback(async (newContext) => {
    if (!newContext || !newContext.pos_profile) {
      throw new Error('pos_profile is required when setting context')
    }
    
    try {
      // Set context on server (authoritative)
      const result = await setContextOnServer({
        pos_profile: newContext.pos_profile,
        branch: newContext.branch || null
      })
      
      if (result?.success) {
        // Update local state
        const updatedContext = result.context || newContext
        setContextState({
          pos_profile: updatedContext.pos_profile,
          branch: updatedContext.branch,
          ...context // Preserve metadata
        })
        
        // Update cacheCACHE_KEY
        storage.setItem('operational_context_cache', updatedContext)
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('operationalContextChanged', {
          detail: updatedContext
        }))
        
        // Refresh from server to get full context
        refetch()
        
        return { success: true, context: updatedContext }
      }
      
      throw new Error(result?.message || 'Failed to set operational context')
    } catch (error) {
      console.error('Error setting operational context:', error)
      throw error
    }
  }, [setContextOnServer, context, refetch])

  const ensureServerContext = useCallback(async (options = {}) => {
    if (typeof window.ensureOperationalContext !== 'function') {
      throw new Error('ensureOperationalContext is not available')
    }
    return window.ensureOperationalContext({
      pos_profile: options.pos_profile || context?.pos_profile || null,
      branch: options.branch || context?.branch || null,
      route: options.route,
      module: options.module,
      force: options.force === true
    })
  }, [context])
  
  /**
   * Require operational context (throws/redirects if missing)
   * @param {Object} options - Require options
   * @param {boolean} options.redirect - Redirect to module select if missing (default: true)
   * @param {boolean} options.allowOptional - Allow optional context for privileged users
   * @returns {Object} Current context
   * @throws {Error} If context required but missing
   */
  const requireContext = useCallback((options = {}) => {
    const { redirect = true, allowOptional = false } = options
    
    // Check if context is required for user's role
    if (!context) {
      if (redirect) {
        window.location.href = '/app/imogi-module-select'
        return null
      }
      throw new Error('Operational context required but not set')
    }
    
    // If user's role requires context and it's missing
    if (context.context_required && !context.pos_profile) {
      if (context.require_selection) {
        // User has profiles but needs to select one
        if (redirect) {
          window.location.href = '/app/imogi-module-select'
          return null
        }
        throw new Error('POS Profile selection required')
      }
      
      if (!context.has_access) {
        // User has no access to any profiles
        throw new Error('No POS Profiles configured for your account')
      }
      
      // Should not reach here
      if (redirect) {
        window.location.href = '/app/imogi-module-select'
        return null
      }
      throw new Error('Operational context required')
    }
    
    // If context is optional for privileged users
    if (allowOptional && context.is_privileged && !context.pos_profile) {
      // Allow through without context
      return context
    }
    
    return context
  }, [context])
  
  /**
   * Check if user has operational context set
   * @returns {boolean} True if context is set
   */
  const hasContext = useCallback(() => {
    return !!(context && context.pos_profile)
  }, [context])
  
  /**
   * Get current POS Profile name
   * @returns {string|null} POS Profile name
   */
  const getPOSProfile = useCallback(() => {
    return context?.pos_profile || null
  }, [context])
  
  /**
   * Get current branch name
   * @returns {string|null} Branch name
   */
  const getBranch = useCallback(() => {
    return context?.branch || null
  }, [context])
  
  /**
   * Check if selection is required
   * @returns {boolean} True if user needs to select profile
   */
  const needsSelection = useCallback(() => {
    return context?.require_selection || false
  }, [context])
  
  /**
   * Check if user is privileged (System Manager)
   * @returns {boolean} True if user is privileged
   */
  const isPrivileged = useCallback(() => {
    return context?.is_privileged || false
  }, [context])
  
  return {
    // Current state (read-only, backend is source of truth)
    context: context || {},
    pos_profile: context?.pos_profile || null,
    branch: context?.branch || null,
    available_profiles: context?.available_pos_profiles || [],
    branches: context?.branches || [],
    role_class: context?.role_class || null,
    
    // Status flags
    hasContext: hasContext(),
    needsSelection: needsSelection(),
    isPrivileged: isPrivileged(),
    contextRequired: context?.context_required !== false,
    hasAccess: context?.has_access !== false,
    serverContextReady: serverContextState.ready,
    serverContextLoading: serverContextState.loading,
    serverContextError: serverContextState.error,
    
    // Loading state
    isLoading,
    error,
    
    // Actions (all server-side)
    setContext,
    ensureServerContext,
    requireContext,
    refetch,
    
    // Convenience getters
    getPOSProfile,
    getBranch
  }
}

export default useOperationalContext
