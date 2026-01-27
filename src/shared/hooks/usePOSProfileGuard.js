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

const MODULE_SELECT_URL = '/shared/module-select'

/**
 * Guard hook for app entries that require POS Profile
 * 
 * @param {Object} options
 * @param {boolean} options.requiresOpening - Whether this module requires POS Opening Entry
 * @param {boolean} options.autoRedirect - Auto-redirect to module-select if no profile (default: true)
 * @returns {Object} Guard state and helpers
 */
export function usePOSProfileGuard(options = {}) {
  const { 
    requiresOpening = false,
    autoRedirect = true 
  } = options
  
  const {
    pos_profile,
    branch,
    available_profiles,
    needsSelection,
    contextRequired,
    hasAccess,
    isLoading: contextLoading,
    error: contextError
  } = useOperationalContext()
  
  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [guardPassed, setGuardPassed] = useState(false)
  
  // Fetch POS Opening Entry if required
  const { data: posOpening, isLoading: openingLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_active_pos_opening',
    undefined,
    pos_profile && requiresOpening ? undefined : false
  )
  
  // Check guard conditions
  useEffect(() => {
    // Still loading
    if (contextLoading || (requiresOpening && openingLoading)) {
      return
    }
    
    // No POS Profile available
    if (contextRequired && !pos_profile && available_profiles.length === 0 && !hasAccess) {
      if (autoRedirect) {
        console.log('[POSProfileGuard] No POS Profile available, redirecting to module-select')
        window.location.href = MODULE_SELECT_URL
      }
      return
    }
    
    // No current profile selected but profiles are available
    if (contextRequired && !pos_profile && available_profiles.length > 0 && needsSelection) {
      if (autoRedirect) {
        console.log('[POSProfileGuard] No POS Profile selected, redirecting to module-select')
        window.location.href = MODULE_SELECT_URL
      }
      return
    }
    
    // Check opening requirement
    if (requiresOpening && pos_profile) {
      if (!posOpening || !posOpening.pos_opening_entry) {
        // Show opening modal instead of redirecting
        setShowOpeningModal(true)
        return
      }
    }
    
    // All guards passed
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
