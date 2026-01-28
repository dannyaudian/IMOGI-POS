/**
 * IMOGI POS - usePOSProfileGuard Hook
 * 
 * Guard hook that ensures POS Profile is set before allowing access.
 * Redirects to module-select if no POS Profile is available.
 * Shows POSOpeningModal if module requires opening but none exists.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { useOperationalContext } from './useOperationalContext'

const MODULE_SELECT_URL = '/app/imogi-module-select'

/**
 * Guard hook for app entries that require POS Profile
 * 
 * @param {Object} options
 * @param {boolean} options.requiresOpening - Whether this module requires POS Opening Entry
 * @param {boolean} options.autoRedirect - Auto-redirect to module-select if no profile (default: true)
 * @param {string} options.targetModule - Module identifier for reason-based redirect (e.g. 'imogi-cashier')
 * @returns {Object} Guard state and helpers
 */
export function usePOSProfileGuard(options = {}) {
  const { 
    requiresOpening = false,
    autoRedirect = true,
    targetModule = null
  } = options
  
  const {
    pos_profile,
    branch,
    available_profiles,
    needsSelection,
    contextRequired,
    hasAccess,
    isLoading: contextLoading,
    error: contextError,
    refetch
  } = useOperationalContext()
  
  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [guardPassed, setGuardPassed] = useState(false)
  const [contextRetries, setContextRetries] = useState(0)
  const MAX_CONTEXT_RETRIES = 3
  const RETRY_DELAY_MS = 300
  
  // Fetch POS Opening Entry if required
  const { data: posOpening, isLoading: openingLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_active_pos_opening',
    undefined,
    pos_profile && requiresOpening ? undefined : false
  )
  
  // Check guard conditions
  useEffect(() => {
    console.log('[usePOSProfileGuard] Checking guard conditions:', {
      contextLoading,
      openingLoading,
      requiresOpening,
      pos_profile,
      hasAccess,
      available_profiles_count: available_profiles.length,
      contextRequired,
      needsSelection,
      hasOpening: !!posOpening,
      posOpeningEntry: posOpening?.pos_opening_entry,
      contextRetries,
      maxRetries: MAX_CONTEXT_RETRIES
    })
    
    // Still loading
    if (contextLoading || (requiresOpening && openingLoading)) {
      console.log('[usePOSProfileGuard] Still loading...')
      return
    }
    
    // No POS Profile available (no access, no profiles)
    if (contextRequired && !pos_profile && available_profiles.length === 0 && !hasAccess) {
      console.log('[usePOSProfileGuard] No POS Profile available, redirecting...')
      console.trace('🔍 [REDIRECT SOURCE] usePOSProfileGuard → No POS Profile available')
      if (autoRedirect) {
        const redirectUrl = targetModule 
          ? `${MODULE_SELECT_URL}?reason=missing_pos_profile&target=${targetModule}`
          : MODULE_SELECT_URL
        console.log('[POSProfileGuard] No POS Profile available, redirecting to:', redirectUrl)
        window.location.href = redirectUrl
      }
      return
    }
    
    // No current profile selected but profiles are available
    // FIX: Retry context fetch before redirecting (handles race condition)
    if (contextRequired && !pos_profile && available_profiles.length > 0 && needsSelection) {
      // Haven't maxed retries yet → retry context fetch
      if (contextRetries < MAX_CONTEXT_RETRIES) {
        console.log(`[usePOSProfileGuard] Context not ready, retrying (${contextRetries + 1}/${MAX_CONTEXT_RETRIES})`)
        const retryTimer = setTimeout(() => {
          setContextRetries(prev => prev + 1)
          if (refetch) {
            console.log('[usePOSProfileGuard] Re-fetching operational context...')
            refetch()
          }
        }, RETRY_DELAY_MS)
        return () => clearTimeout(retryTimer)
      }
      
      // Max retries reached → now redirect
      console.warn(`[usePOSProfileGuard] Max retries (${MAX_CONTEXT_RETRIES}) reached, redirecting to module-select`)
      console.trace('🔍 [REDIRECT SOURCE] usePOSProfileGuard → Max retries reached')
      if (autoRedirect) {
        const redirectUrl = targetModule 
          ? `${MODULE_SELECT_URL}?reason=missing_pos_profile&target=${targetModule}`
          : MODULE_SELECT_URL
        console.log('[POSProfileGuard] Redirecting to:', redirectUrl)
        window.location.href = redirectUrl
      }
      return
    }
    
    // Profile found → reset retry counter
    if (pos_profile && contextRetries > 0) {
      console.log('[usePOSProfileGuard] ✅ Context resolved after retries:', {
        pos_profile,
        retriesTaken: contextRetries
      })
      setContextRetries(0)
    }
    
    // Check opening requirement
    if (requiresOpening && pos_profile) {
      console.log('[usePOSProfileGuard] Checking opening requirement:', {
        pos_profile,
        hasOp,
    contextRetries,
    refetchening: !!posOpening,
        posOpeningEntry: posOpening?.pos_opening_entry
      })
      
      if (!posOpening || !posOpening.pos_opening_entry) {
        // Show opening modal instead of redirecting
        console.log('[usePOSProfileGuard] No opening found, showing modal')
        setShowOpeningModal(true)
        return
      }
    }
    
    // All guards passed
    console.log('[usePOSProfileGuard] All guards passed! ✅')
    setGuardPassed(true)
    
  }, [
    pos_profile, 
    available_profiles, 
    contextLoading, 
    requiresOpening, 
    posOpening, 
    openingLoading, 
    autoRedirect,
    needsSelection,
    contextRequired,
    hasAccess
  ])

  const profileData = useMemo(() => {
    if (!pos_profile) {
      return null
    }
    return available_profiles.find((profile) => profile.name === pos_profile) || null
  }, [available_profiles, pos_profile])
  
  // Handle opening modal success
  const handleOpeningSuccess = useCallback((result) => {
    setShowOpeningModal(false)
    setGuardPassed(true)
  }, [])
  
  // Handle opening modal cancel - redirect to module-select
  const handleOpeningCancel = useCallback(() => {
    console.trace('🔍 [REDIRECT SOURCE] POSOpeningModal → User cancelled')
    window.location.href = MODULE_SELECT_URL
  }, [])
  
  return {
    // Guard state
    isLoading: contextLoading || (requiresOpening && openingLoading),
    guardPassed,
    error: contextError,
    
    // POS Profile data
    posProfile: pos_profile,
    profileData,
    branch: branch || null,
    
    // POS Opening data (if required)
    posOpening: posOpening || null,
    hasOpening: !!(posOpening && posOpening.pos_opening_entry),
    
    // Opening modal controls
    showOpeningModal,
    setShowOpeningModal,
    handleOpeningSuccess,
    handleOpeningCancel,
    
    // Redirect helper
    redirectToModuleSelect: () => {
      window.location.href = MODULE_SELECT_URL
    }
  }
}

export default usePOSProfileGuard
