import React, { createContext, useContext, useState, useEffect } from 'react'
import { FrappeProvider } from 'frappe-react-sdk'
import { usePOSProfile } from '../hooks/usePOSProfile'

// Create context for IMOGI POS state
const ImogiPOSContext = createContext(null)

/**
 * Hook to access IMOGI POS context
 */
export function useImogiPOS() {
  const context = useContext(ImogiPOSContext)
  if (!context) {
    throw new Error('useImogiPOS must be used within ImogiPOSProvider')
  }
  return context
}

/**
 * Root provider untuk semua IMOGI POS apps
 * Wraps aplikasi dengan FrappeProvider dan shared context
 * Manages POS Profile state centrally
 */
export function ImogiPOSProvider({ children, initialState = {} }) {
  // Get Frappe site URL from window location (same domain)
  const frappeUrl = window.location.origin
  
  return (
    <FrappeProvider
      url={frappeUrl}
      tokenParams={{
        useToken: false, // Use cookie-based auth (same domain dengan ERPNext)
        type: 'Bearer'
      }}
    >
      <ImogiPOSContextProvider initialState={initialState}>
        {children}
      </ImogiPOSContextProvider>
    </FrappeProvider>
  )
}

/**
 * Internal context provider that uses hooks (must be inside FrappeProvider)
 */
function ImogiPOSContextProvider({ children, initialState = {} }) {
  const posProfile = usePOSProfile()
  
  // Merge initialState with POS Profile data
  // Priority: POS Profile hook > initialState > localStorage
  const mergedState = {
    ...initialState,
    pos_profile: posProfile.currentProfile || initialState.pos_profile,
    branch: posProfile.branch || initialState.branch,
    domain: posProfile.domain || initialState.domain,
    mode: posProfile.mode || initialState.mode,
    company: posProfile.company || initialState.company,
  }
  
  // Sync initialState POS Profile to hook if provided and different
  useEffect(() => {
    if (initialState.pos_profile && 
        initialState.pos_profile !== posProfile.currentProfile &&
        posProfile.availableProfiles.length > 0) {
      // Check if initialState profile is in available profiles
      const isAvailable = posProfile.availableProfiles.some(
        p => p.name === initialState.pos_profile
      )
      if (isAvailable) {
        posProfile.setProfile(initialState.pos_profile)
      }
    }
  }, [initialState.pos_profile, posProfile.currentProfile, posProfile.availableProfiles])
  
  const contextValue = {
    // Current state
    posProfile: mergedState.pos_profile,
    branch: mergedState.branch,
    domain: mergedState.domain,
    mode: mergedState.mode,
    company: mergedState.company,
    
    // Profile management
    availableProfiles: posProfile.availableProfiles,
    setProfile: posProfile.setProfile,
    isProfileLoading: posProfile.isLoading,
    
    // Full profile data
    profileData: posProfile.profileData,
    
    // Backward compatibility
    initialState: mergedState
  }
  
  return (
    <ImogiPOSContext.Provider value={contextValue}>
      {children}
    </ImogiPOSContext.Provider>
  )
}
