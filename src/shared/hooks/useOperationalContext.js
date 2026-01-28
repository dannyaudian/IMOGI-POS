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

// No localStorage keys - server session is source of truth
const CACHE_KEY = 'imogi_operational_context_cache'

/**
 * Hook to manage Operational Context
 * @param {Object} options - Hook options
 * @param {boolean} options.autoResolve - Auto-resolve context on mount (default: true)
 * @returns {Object} Operational context state and methods
 */
export function useOperationalContext(options = {}) {
  const { autoResolve = true } = options
  
  // Local state (mirrors server session)
  const [context, setContextState] = useState(() => {
    // Try to load from cache for faster initial render
    return storage.getItem('operational_context_cache') || null
  })
  
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
    const activeContext = serverContext.active_context || {
      pos_profile: serverContext.current_pos_profile,
      branch: serverContext.current_branch
    }
    
    const newContext = {
      pos_profile: activeContext.pos_profile || null,
      branch: activeContext.branch || null,
      
      // Additional metadata from resolution
      available_pos_profiles: serverContext.available_pos_profiles || [],
      branches: serverContext.branches || [],
      require_selection: serverContext.require_selection || false,
      has_access: serverContext.has_access !== false,
      role_class: serverContext.role_class || null,
      is_privileged: serverContext.is_privileged || false,
      context_required: serverContext.context_required !== false
    }
    
    setContextState(newContext)
    
    // Cache for faster subsequent renders
    storage.setItem('operational_context_cache', activeContext)
  }, [serverContext])
  
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
        
        // Update cache
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
    
    // Loading state
    isLoading,
    error,
    
    // Actions (all server-side)
    setContext,
    requireContext,
    refetch,
    
    // Convenience getters
    getPOSProfile,
    getBranch
  }
}

export default useOperationalContext
