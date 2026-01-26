/**
 * IMOGI POS - usePOSProfileGuard Hook
 * 
 * Guard hook that ensures POS Profile is set before allowing access.
 * Redirects to module-select if no POS Profile is available.
 * Shows POSOpeningModal if module requires opening but none exists.
 */

import { useState, useEffect, useCallback } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { usePOSProfile } from './usePOSProfile'

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
    currentProfile,
    profileData,
    isLoading: profileLoading,
    error: profileError,
    availableProfiles
  } = usePOSProfile()
  
  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [guardPassed, setGuardPassed] = useState(false)
  
  // Fetch POS Opening Entry if required
  const { data: posOpening, isLoading: openingLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_active_pos_opening',
    { pos_profile: currentProfile },
    currentProfile && requiresOpening ? undefined : false
  )
  
  // Check guard conditions
  useEffect(() => {
    // Still loading
    if (profileLoading || (requiresOpening && openingLoading)) {
      return
    }
    
    // No POS Profile available
    if (!currentProfile && availableProfiles.length === 0) {
      if (autoRedirect) {
        console.log('[POSProfileGuard] No POS Profile available, redirecting to module-select')
        window.location.href = MODULE_SELECT_URL
      }
      return
    }
    
    // No current profile selected but profiles are available
    if (!currentProfile && availableProfiles.length > 0) {
      if (autoRedirect) {
        console.log('[POSProfileGuard] No POS Profile selected, redirecting to module-select')
        window.location.href = MODULE_SELECT_URL
      }
      return
    }
    
    // Check opening requirement
    if (requiresOpening) {
      if (!posOpening || !posOpening.pos_opening_entry) {
        // Show opening modal instead of redirecting
        setShowOpeningModal(true)
        return
      }
    }
    
    // All guards passed
    setGuardPassed(true)
    
  }, [
    currentProfile, 
    availableProfiles, 
    profileLoading, 
    requiresOpening, 
    posOpening, 
    openingLoading, 
    autoRedirect
  ])
  
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
    isLoading: profileLoading || (requiresOpening && openingLoading),
    guardPassed,
    error: profileError,
    
    // POS Profile data
    posProfile: currentProfile,
    profileData,
    branch: profileData?.branch || null,
    
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
