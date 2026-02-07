/**
 * IMOGI POS - usePOSProfileGuard Hook
 * 
 * Guard hook that ensures POS Profile is set before allowing access.
 * Redirects to module-select if no POS Profile is available.
 * Redirects to native POS Opening Entry form if module requires opening but none exists.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { useOperationalContext } from './useOperationalContext'
import { API } from '@/shared/api/constants'

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
    refetch,
    serverContextReady,
    serverContextLoading,
    serverContextError,
    ensureServerContext
  } = useOperationalContext()
  
  const [guardPassed, setGuardPassed] = useState(false)
  const [openingStatus, setOpeningStatus] = useState('loading')
  const [contextRetries, setContextRetries] = useState(0)
  const [openingRetries, setOpeningRetries] = useState(0)
  const [openingRefreshRequested, setOpeningRefreshRequested] = useState(false)
  const MAX_CONTEXT_RETRIES = 3
  const MAX_OPENING_RETRIES = 2
  const RETRY_DELAY_MS = 300
  const OPENING_RETRY_DELAY_MS = 500
  
  const isContextReady = Boolean(pos_profile && branch && serverContextReady)
  const shouldCheckOpening = Boolean(requiresOpening && isContextReady)

  // Fetch POS Opening Entry if required
  const {
    data: posOpening,
    isLoading: openingLoading,
    error: openingError,
    mutate: refetchOpening
  } = useFrappeGetCall(
    API.GET_ACTIVE_POS_OPENING,
    undefined,
    shouldCheckOpening ? undefined : false,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      errorRetryCount: 0
    }
  )

  useEffect(() => {
    if (!requiresOpening) {
      setOpeningStatus('ok')
      return
    }

    if (!shouldCheckOpening || openingLoading || serverContextLoading) {
      if (openingStatus !== 'missing' || openingRefreshRequested) {
        setOpeningStatus('loading')
      }
      return
    }

    if (serverContextError) {
      setOpeningStatus('error')
      return
    }

    if (openingError || posOpening?.error_code) {
      setOpeningStatus('error')
      return
    }

    // Check for opening in response (pos_opening_entry is the name field from module_select API)
    const hasOpeningEntry = Boolean(posOpening?.pos_opening_entry)
    
    if (!posOpening || !hasOpeningEntry) {
      console.warn('[POSProfileGuard] Opening check failed:', {
        hasResponse: !!posOpening,
        hasEntryField: hasOpeningEntry,
        responseKeys: posOpening ? Object.keys(posOpening) : []
      })
      setOpeningStatus('missing')
      return
    }

    setOpeningStatus('ok')
  }, [
    requiresOpening,
    shouldCheckOpening,
    openingLoading,
    openingError,
    posOpening,
    serverContextLoading,
    serverContextError,
    openingStatus,
    openingRefreshRequested
  ])

  useEffect(() => {
    if (!openingLoading && openingRefreshRequested) {
      setOpeningRefreshRequested(false)
    }
  }, [openingLoading, openingRefreshRequested])

  useEffect(() => {
    if (!shouldCheckOpening || openingStatus !== 'error' || !refetchOpening) {
      return
    }

    const errorMessage = openingError?.message || posOpening?.error_message || ''
    const isContextError = errorMessage.includes('Context Required')
      || errorMessage.includes('Operational context')
      || posOpening?.error_code === 'missing_pos_profile'

    if (!isContextError || openingRetries >= MAX_OPENING_RETRIES) {
      return
    }

    const retryTimer = setTimeout(() => {
      setOpeningRetries((prev) => prev + 1)
      setOpeningRefreshRequested(true)
      refetchOpening()
    }, OPENING_RETRY_DELAY_MS)

    return () => clearTimeout(retryTimer)
  }, [
    shouldCheckOpening,
    openingStatus,
    openingError,
    posOpening,
    openingRetries,
    refetchOpening
  ])

  useEffect(() => {
    const openingName = posOpening?.pos_opening_entry || null
    if (openingStatus === 'ok' && openingName) {
      console.info('[POSProfileGuard] openingFound=', openingName)
    }
    if (openingStatus !== 'ok') {
      console.info('[POSProfileGuard] status=', openingStatus, {
        reason: openingError?.message || posOpening?.error_message || null
      })
    }
  }, [openingStatus, openingError, posOpening])

  useEffect(() => {
    if (openingStatus === 'ok' && openingRetries > 0) {
      setOpeningRetries(0)
    }
  }, [openingStatus, openingRetries])
  
  // Check guard conditions
  useEffect(() => {
    // Still loading - don't change guard state
    if (contextLoading || serverContextLoading || (requiresOpening && openingLoading)) {
      return
    }

    if (serverContextError) {
      setGuardPassed(false)
      return
    }

    if (!serverContextReady) {
      setGuardPassed(false)
      return
    }
    
    // No POS Profile available (no access, no profiles)
    if (contextRequired && !pos_profile && available_profiles.length === 0 && !hasAccess) {
      setGuardPassed(false)
      if (autoRedirect) {
        const redirectUrl = targetModule 
          ? `${MODULE_SELECT_URL}?reason=missing_pos_profile&target=${targetModule}`
          : MODULE_SELECT_URL
        window.location.href = redirectUrl
      }
      return
    }
    
    // No current profile selected but profiles are available
    // FIX: Retry context fetch before redirecting (handles race condition)
    if (contextRequired && !pos_profile && available_profiles.length > 0 && needsSelection) {
      setGuardPassed(false)
      // Haven't maxed retries yet → retry context fetch
      if (contextRetries < MAX_CONTEXT_RETRIES) {
        const retryTimer = setTimeout(() => {
          setContextRetries(prev => prev + 1)
          if (refetch) {
            refetch()
          }
        }, RETRY_DELAY_MS)
        return () => clearTimeout(retryTimer)
      }
      
      // Max retries reached → now redirect
      setGuardPassed(false)
      if (autoRedirect) {
        const redirectUrl = targetModule 
          ? `${MODULE_SELECT_URL}?reason=missing_pos_profile&target=${targetModule}`
          : MODULE_SELECT_URL
        window.location.href = redirectUrl
      }
      return
    }
    
    // Profile found → reset retry counter
    if (pos_profile && contextRetries > 0) {
      setContextRetries(0)
    }
    
    // Check opening requirement
    if (requiresOpening && pos_profile) {
      if (!isContextReady) {
        setGuardPassed(false)
        return
      }

      if (openingStatus === 'error') {
        setGuardPassed(false)
        return
      }

      if (openingStatus === 'missing') {
        // Block access - let consuming component show error screen
        // (no auto-redirect, so console errors are visible)
        setGuardPassed(false)
        return
      }
    }
    
    // All guards passed
    setGuardPassed(true)
    
  }, [
    pos_profile,
    branch,
    available_profiles, 
    contextLoading, 
    serverContextLoading,
    serverContextError,
    serverContextReady,
    requiresOpening, 
    posOpening,
    openingError,
    openingLoading,
    openingStatus,
    autoRedirect,
    needsSelection,
    contextRequired,
    hasAccess,
    contextRetries,
    refetch,
    targetModule
  ])

  const retryServerContext = useCallback(() => {
    if (!ensureServerContext) {
      return
    }
    ensureServerContext({ force: true }).catch(() => {})
  }, [ensureServerContext])

  const profileData = useMemo(() => {
    if (!pos_profile) {
      return null
    }
    return available_profiles.find((profile) => profile.name === pos_profile) || null
  }, [available_profiles, pos_profile])

  useEffect(() => {
    const handleSessionOpened = () => {
      if (refetchOpening) {
        refetchOpening()
      }
    }

    window.addEventListener('posSessionOpened', handleSessionOpened)
    return () => window.removeEventListener('posSessionOpened', handleSessionOpened)
  }, [refetchOpening])
  
  return {
    // Guard state
    isLoading: contextLoading || serverContextLoading || (requiresOpening && openingLoading),
    guardPassed,
    error: contextError,
    serverContextReady,
    serverContextError,
    retryServerContext,
    openingStatus,
    openingError,
    retryOpening: refetchOpening,
    
    // POS Profile data
    posProfile: pos_profile,
    profileData,
    branch: branch || null,
    
    // POS Opening data (if required)
    posOpening: posOpening || null,
    hasOpening: !!(posOpening && posOpening.pos_opening_entry),
    
    // Redirect helper
    redirectToModuleSelect: () => {
      window.location.href = MODULE_SELECT_URL
    }
  }
}

export default usePOSProfileGuard
