import React, { createContext, useContext, useMemo } from 'react'
import { FrappeProvider } from 'frappe-react-sdk'
import { useOperationalContext } from '../hooks/useOperationalContext'

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

  // CSRF Token Bridge: frappe-react-sdk reads window.csrf_token for X-Frappe-CSRF-Token header.
  // In Desk mode, Frappe sets frappe.csrf_token but NOT window.csrf_token, causing CSRFTokenError.
  if (typeof window !== 'undefined' && !window.csrf_token) {
    const token = window.frappe?.csrf_token
      || window.frappe?.session?.csrf_token
      || window.FRAPPE_CSRF_TOKEN
      || ''
    if (token) {
      window.csrf_token = token
    }
  }

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
  const {
    pos_profile,
    branch,
    available_profiles,
    isLoading,
    setContext
  } = useOperationalContext()

  const profileData = useMemo(() => {
    if (!pos_profile) {
      return null
    }
    return available_profiles.find((profile) => profile.name === pos_profile) || null
  }, [available_profiles, pos_profile])

  // Merge initialState with operational context
  // Priority: operational context > initialState
  const mergedState = {
    ...initialState,
    pos_profile: pos_profile || initialState.pos_profile,
    branch: branch || initialState.branch,
    domain: profileData?.pos_domain || initialState.domain,
    mode: profileData?.mode || initialState.mode,
    company: profileData?.company || initialState.company,
  }
  
  const contextValue = {
    // Current state
    posProfile: mergedState.pos_profile,
    branch: mergedState.branch,
    domain: mergedState.domain,
    mode: mergedState.mode,
    company: mergedState.company,
    
    // Profile management
    availableProfiles: available_profiles,
    setProfile: async (profileName) => setContext({ pos_profile: profileName }),
    isProfileLoading: isLoading,
    
    // Full profile data
    profileData,
    
    // Backward compatibility
    initialState: mergedState
  }
  
  return (
    <ImogiPOSContext.Provider value={contextValue}>
      {children}
    </ImogiPOSContext.Provider>
  )
}
