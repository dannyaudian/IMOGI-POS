import { useState, useEffect, useCallback, useRef } from 'react'
import { apiCall } from '@/shared/utils/api'

/**
 * useEffectiveOpening Hook - Single source of truth for POS opening validation
 *
 * Validates and manages the effective opening_entry for the current session.
 * Supports multi-session mode with URL opening_entry parameter.
 *
 * Features:
 * - Validates opening_entry from URL against backend
 * - Falls back to user's active opening if no URL param
 * - Locks opening for session (no switch without reload)
 * - Re-validates before critical operations
 * - Auto-refresh validation at configurable interval
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.requiresOpening - Throw error if no opening (default: true)
 * @param {boolean} options.allowUrlParam - Support opening_entry URL parameter (default: true)
 * @param {number} options.autoRefreshMs - Re-validate interval in ms (default: 30000)
 *
 * @returns {Object} Opening validation state and functions
 * @returns {Object} .opening - The validated opening object
 * @returns {string} .effectiveOpeningName - Opening name for use in APIs
 * @returns {string} .status - Current status: 'loading'|'valid'|'missing'|'mismatch'|'error'
 * @returns {string} .error - Error message if status is not 'valid'
 * @returns {boolean} .isValid - True if status === 'valid'
 * @returns {boolean} .isMissing - True if status === 'missing' (no opening found)
 * @returns {boolean} .isMismatch - True if status === 'mismatch' (URL opening differs from active)
 * @returns {boolean} .isLoading - True if status === 'loading'
 * @returns {boolean} .isError - True if status === 'error'
 * @returns {boolean} .isUrlOpening - True if opening came from URL parameter
 * @returns {Date} .lastValidatedAt - Last validation timestamp
 * @returns {Function} .revalidate - Manual re-validation function
 */
export function useEffectiveOpening({
  requiresOpening = true,
  allowUrlParam = true,
  autoRefreshMs = 30000
} = {}) {
  const [effectiveOpening, setEffectiveOpening] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [isUrlOpening, setIsUrlOpening] = useState(false)
  const [lastValidatedAt, setLastValidatedAt] = useState(null)

  // Ref to track latest effectiveOpening without causing callback recreation
  const effectiveOpeningRef = useRef(effectiveOpening)
  
  // Keep ref in sync with state
  useEffect(() => {
    effectiveOpeningRef.current = effectiveOpening
  }, [effectiveOpening])

  // Load and validate opening on component mount
  useEffect(() => {
    const initializeOpening = async () => {
      try {
        if (!allowUrlParam) {
          // URL params not allowed, load active opening directly
          await loadActiveOpening()
          return
        }

        // Check for opening_entry in URL
        const params = new URLSearchParams(window.location.search)
        const urlOpening = params.get('opening_entry')

        if (urlOpening) {
          // Validate URL opening against backend
          await validateUrlOpening(urlOpening)
        } else {
          // No URL opening, load user's active opening
          await loadActiveOpening()
        }
      } catch (err) {
        console.error('[useEffectiveOpening] Initialization failed:', err)
        setStatus('error')
        setError(err.message || 'Failed to initialize opening')
      }
    }

    initializeOpening()
  }, [allowUrlParam])

  /**
   * Validate opening_entry from URL parameter
   */
  const validateUrlOpening = useCallback(async (urlOpening) => {
    try {
      setStatus('loading')

      // Get POS profile from operational context (set by guard)
      const posProfile = window.__IMOGI_CASHIER_CONTEXT?.pos_profile
      if (!posProfile) {
        throw new Error('POS Profile not available in context')
      }

      // Call backend validation
      console.log('[useEffectiveOpening] Validating URL opening:', urlOpening)
      const response = await apiCall(
        'imogi_pos.api.module_select.validate_opening_session',
        {
          opening_entry: urlOpening,
          pos_profile: posProfile
        }
      )

      if (!response?.valid) {
        setStatus('error')
        setError(response?.error || 'Invalid opening entry')
        return
      }

      // Set effective opening from URL
      setEffectiveOpening(response.opening || { name: urlOpening })
      setIsUrlOpening(true)
      setStatus('valid')
      setError(null)
      setLastValidatedAt(new Date())
      console.log('[useEffectiveOpening] URL opening validated:', urlOpening)
    } catch (err) {
      console.error('[useEffectiveOpening] URL opening validation failed:', err)
      setStatus('error')
      setError(err.message || 'Failed to validate opening')
    }
  }, [])

  /**
   * Load user's active opening
   */
  const loadActiveOpening = useCallback(async () => {
    try {
      setStatus('loading')

      if (import.meta.env.DEV) {
        console.log('[useEffectiveOpening] Loading active opening...')
      }
      const response = await apiCall('imogi_pos.api.cashier.get_active_opening')

      // Dev logging: log full response for debugging
      if (import.meta.env.DEV) {
        console.log('[useEffectiveOpening] Response:', {
          success: response?.success,
          has_opening: response?.has_opening,
          opening_exists: !!response?.opening,
          opening_name: response?.opening?.name,
          opening_entry: response?.opening?.pos_opening_entry,
          pos_profile: response?.pos_profile
        })
      }

      if (!response?.has_opening) {
        if (requiresOpening) {
          setStatus('missing')
          setError('No active POS Opening. Please create one to proceed.')
          return
        }
        // If opening not required, continue with null
        setStatus('valid')
        setError(null)
        return
      }

      // FIXED: Backend returns "opening" object with "name" field
      // Fallback to pos_opening_entry for backward compatibility
      const openingData = response.opening
      const openingName = openingData?.name || openingData?.pos_opening_entry
      
      if (!openingData || !openingName) {
        setStatus('missing')
        setError('Invalid opening data returned from server')
        console.error('[useEffectiveOpening] has_opening=true but opening is null:', response)
        return
      }

      // Ensure opening object has 'name' field for consistency
      const normalizedOpening = {
        ...openingData,
        name: openingName
      }

      setEffectiveOpening(normalizedOpening)
      setIsUrlOpening(false)
      setStatus('valid')
      setError(null)
      setLastValidatedAt(new Date())
      
      if (import.meta.env.DEV) {
        console.log('[useEffectiveOpening] Active opening loaded:', openingName)
      }
    } catch (err) {
      console.error('[useEffectiveOpening] Failed to load active opening:', err)
      setStatus('error')
      setError(err.message || 'Failed to load active opening')
    }
  }, [requiresOpening])

  /**
   * Re-validate that current opening is still active/valid
   * Called before critical operations (payment, close shift)
   */
  const revalidate = useCallback(async () => {
    const currentOpening = effectiveOpeningRef.current
    
    if (!currentOpening?.name) {
      console.warn('[useEffectiveOpening] No opening to revalidate')
      return
    }

    try {
      setStatus('loading')
      
      if (import.meta.env.DEV) {
        console.log('[useEffectiveOpening] Re-validating opening:', currentOpening.name)
      }

      // Get current user's active opening
      const response = await apiCall('imogi_pos.api.cashier.get_active_opening')

      if (!response?.has_opening) {
        setStatus('mismatch')
        setError(
          `Opening ${currentOpening.name} is no longer active. ` +
          `Please reload to proceed.`
        )
        console.warn('[useEffectiveOpening] Opening no longer active:', currentOpening.name)
        return
      }

      // FIXED: Backend returns "opening" object with "name" field
      // Fallback to pos_opening_entry for backward compatibility
      const currentActiveOpeningName = response.opening?.name || response.opening?.pos_opening_entry
      
      if (!currentActiveOpeningName) {
        setStatus('error')
        setError('Invalid opening data from server')
        console.error('[useEffectiveOpening] has_opening=true but opening.name is null:', response)
        return
      }

      // Check if URL opening differs from current active
      if (isUrlOpening && currentActiveOpeningName !== currentOpening.name) {
        setStatus('mismatch')
        setError(
          `Your opening (${currentOpening.name}) differs from current active opening (${currentActiveOpeningName}). ` +
          `Please reload page to switch openings.`
        )
        console.warn('[useEffectiveOpening] Opening mismatch:', {
          urlOpening: currentOpening.name,
          activeOpening: currentActiveOpeningName
        })
        return
      }

      // If not URL opening and active changed, auto-update (backward compatible)
      if (!isUrlOpening && currentActiveOpeningName !== currentOpening.name) {
        if (import.meta.env.DEV) {
          console.log('[useEffectiveOpening] Active opening changed, updating:', currentActiveOpeningName)
        }
        
        // Ensure opening object has 'name' field
        const normalizedOpening = {
          ...response.opening,
          name: currentActiveOpeningName
        }
        setEffectiveOpening(normalizedOpening)
      }

      setStatus('valid')
      setError(null)
      setLastValidatedAt(new Date())
      if (import.meta.env.DEV) {
        console.log('[useEffectiveOpening] Re-validation passed')
      }
    } catch (err) {
      console.error('[useEffectiveOpening] Re-validation failed:', err)
      setStatus('error')
      setError(err.message || 'Re-validation failed')
    }
  }, [isUrlOpening])

  // Track mount count for debugging double-mount issues
  useEffect(() => {
    if (!window.__effectiveOpeningMountCount) {
      window.__effectiveOpeningMountCount = 0
    }
    window.__effectiveOpeningMountCount++
    const mountId = window.__effectiveOpeningMountCount
    
    if (import.meta.env.DEV) {
      console.log(`[useEffectiveOpening] Hook mounted (instance #${mountId})`)
    }
    
    return () => {
      if (import.meta.env.DEV) {
        console.log(`[useEffectiveOpening] Hook unmounted (instance #${mountId})`)
      }
    }
  }, [])

  // Auto-revalidate at configured interval
  useEffect(() => {
    if (status !== 'valid' || !autoRefreshMs) return

    const interval = setInterval(() => {
      if (import.meta.env.DEV) {
        console.log('[useEffectiveOpening] Auto-revalidating...')
      }
      revalidate()
    }, autoRefreshMs)

    return () => clearInterval(interval)
  }, [status, autoRefreshMs]) // revalidate is stable now, no need in deps

  return {
    // Data
    opening: effectiveOpening,
    effectiveOpeningName: effectiveOpening?.name || null,

    // Status
    status,
    error,
    isValid: status === 'valid',
    isMissing: status === 'missing',
    isLoading: status === 'loading',
    isMismatch: status === 'mismatch',
    isError: status === 'error',

    // Context
    isUrlOpening,
    lastValidatedAt,

    // Actions
    revalidate
  }
}
