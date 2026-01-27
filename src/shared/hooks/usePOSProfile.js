/**
 * IMOGI POS - usePOSProfile Hook
 * 
 * React hook for managing POS Profile state with localStorage sync
 * and optional server sync. Integrates with pos-profile-manager.js.
 */

import { useState, useEffect, useCallback } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'

const STORAGE_KEY = 'imogi_active_pos_profile'
const LAST_USED_KEY = 'imogi:last_pos_profile'
const PROFILE_DATA_KEY = 'imogi_pos_profile_data'

/**
 * Hook to manage POS Profile selection
 * @returns {Object} POS Profile state and methods
 */
export function usePOSProfile() {
  const [currentProfile, setCurrentProfile] = useState(() => {
    return localStorage.getItem(LAST_USED_KEY) || localStorage.getItem(STORAGE_KEY) || null
  })
  
  const [profileData, setProfileData] = useState(() => {
    try {
      const stored = localStorage.getItem(PROFILE_DATA_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  
  const [availableProfiles, setAvailableProfiles] = useState([])
  const [branches, setBranches] = useState([])
  const [isPrivileged, setIsPrivileged] = useState(false)
  const [needsSelection, setNeedsSelection] = useState(false)
  
  // Fetch available POS Profiles from server
  const { data: profileInfo, isLoading, error, mutate: refetch } = useFrappeGetCall(
    'imogi_pos.api.public.get_user_pos_profile_info',
    { last_used: currentProfile || localStorage.getItem(LAST_USED_KEY) || localStorage.getItem(STORAGE_KEY) || null },
    undefined,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    }
  )
  
  // API for setting default profile on server
  const { call: setDefaultOnServer } = useFrappePostCall(
    'imogi_pos.api.public.set_user_default_pos_profile'
  )
  
  // Process profile info when loaded
  useEffect(() => {
    if (profileInfo) {
      setAvailableProfiles(profileInfo.available_pos_profiles || [])
      setBranches(profileInfo.branches || [])
      setIsPrivileged(profileInfo.is_privileged || false)
      setNeedsSelection(!!profileInfo.require_selection)
      
      // If no current profile set, use server's recommendation
      if (!currentProfile && profileInfo.current_pos_profile) {
        const serverProfile = profileInfo.current_pos_profile
        const serverProfileData = profileInfo.available_pos_profiles?.find(
          p => p.name === serverProfile
        )
        
        setCurrentProfile(serverProfile)
        localStorage.setItem(STORAGE_KEY, serverProfile)
        localStorage.setItem(LAST_USED_KEY, serverProfile)
        
        if (serverProfileData) {
          const data = normalizeProfileData(serverProfileData)
          setProfileData(data)
          localStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(data))
        }
      }
    }
  }, [profileInfo, currentProfile])
  
  // Listen for cross-tab updates
  useEffect(() => {
    const handleStorageChange = (e) => {
      if ((e.key === STORAGE_KEY || e.key === LAST_USED_KEY) && e.newValue !== currentProfile) {
        setCurrentProfile(e.newValue)
      }
      if (e.key === PROFILE_DATA_KEY) {
        try {
          setProfileData(e.newValue ? JSON.parse(e.newValue) : null)
        } catch {
          // Ignore parse errors
        }
      }
    }
    
    const handleProfileChanged = (e) => {
      if (e.detail?.posProfile !== currentProfile) {
        setCurrentProfile(e.detail?.posProfile || null)
        setProfileData(e.detail?.profileData || null)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('posProfileChanged', handleProfileChanged)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('posProfileChanged', handleProfileChanged)
    }
  }, [currentProfile])
  
  /**
   * Normalize profile data to consistent format
   */
  const normalizeProfileData = (profile) => ({
    name: profile.name,
    branch: profile.imogi_branch || profile.branch,
    domain: profile.imogi_pos_domain || profile.domain,
    mode: profile.imogi_mode || profile.mode,
    company: profile.company,
    enableCashier: profile.imogi_enable_cashier,
    enableKOT: profile.imogi_enable_kot,
    enableWaiter: profile.imogi_enable_waiter,
    enableKitchen: profile.imogi_enable_kitchen
  })
  
  /**
   * Set the current POS Profile
   * @param {string} profileName - Profile name to set
   * @param {Object} options - Options
   * @param {boolean} options.syncToServer - Also save to user's default field
   */
  const setProfile = useCallback(async (profileName, options = {}) => {
    const { syncToServer = false } = options
    
    if (!profileName) {
      setCurrentProfile(null)
      setProfileData(null)
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LAST_USED_KEY)
      localStorage.removeItem(PROFILE_DATA_KEY)
      return
    }
    
    // Find profile data from available profiles
    const profile = availableProfiles.find(p => p.name === profileName)
    const data = profile ? normalizeProfileData(profile) : null
    
    // Update local state
    setCurrentProfile(profileName)
    setProfileData(data)
    localStorage.setItem(STORAGE_KEY, profileName)
    localStorage.setItem(LAST_USED_KEY, profileName)
    
    if (data) {
      localStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(data))
      // Also update old branch storage for backward compatibility
      if (data.branch) {
        localStorage.setItem('imogi_active_branch', data.branch)
        localStorage.setItem('imogi_selected_branch', data.branch)
      }
    }
    
    // Update global variables
    if (typeof window !== 'undefined') {
      window.CURRENT_POS_PROFILE = profileName
      if (data?.branch) {
        window.CURRENT_BRANCH = data.branch
      }
    }
    
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('posProfileChanged', {
      detail: { posProfile: profileName, profileData: data }
    }))
    
    // Sync to server if requested
    if (syncToServer) {
      try {
        await setDefaultOnServer({
          pos_profile: profileName,
          sync_to_server: true
        })
      } catch (e) {
        console.error('Error syncing POS Profile to server:', e)
      }
    }
    
    return { success: true, profile: profileName, data }
  }, [availableProfiles, setDefaultOnServer])
  
  /**
   * Get derived branch from current profile
   */
  const getBranch = useCallback(() => {
    return profileData?.branch || null
  }, [profileData])
  
  /**
   * Get derived domain from current profile
   */
  const getDomain = useCallback(() => {
    return profileData?.domain || null
  }, [profileData])
  
  /**
   * Get derived mode from current profile
   */
  const getMode = useCallback(() => {
    return profileData?.mode || null
  }, [profileData])
  
  return {
    // Current state
    currentProfile,
    profileData,
    availableProfiles,
    branches,
    isPrivileged,
    needsSelection,
    
    // Loading state
    isLoading,
    error,
    
    // Actions
    setProfile,
    refetch,
    
    // Derived getters
    getBranch,
    getDomain,
    getMode,
    
    // Convenience aliases
    branch: profileData?.branch || null,
    domain: profileData?.domain || null,
    mode: profileData?.mode || null,
    company: profileData?.company || null
  }
}

export default usePOSProfile
