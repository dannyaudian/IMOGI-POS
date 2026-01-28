/**
 * IMOGI POS - Session Management Utility
 * 
 * Centralized session handling for Frappe session expiry detection and recovery.
 * Prevents multiple simultaneous login redirects and provides consistent session error handling.
 */

let redirectInProgress = false

/**
 * Check if an error represents a session expiry
 * 
 * @param {Error|Object} error - Error object from API call
 * @returns {boolean} True if error indicates session expiry
 */
export function isSessionExpired(error) {
  if (!error) return false
  
  const status = error?.httpStatus || error?.status || error?.response?.status
  const message = error?.message || error?.response?.data?.message || error?.exception
  
  // 503 with "Session Stopped" exception
  if (status === 503) {
    if (error?.exc_type === 'SessionStopped') return true
    if (typeof message === 'string' && message.toLowerCase().includes('session stopped')) return true
    return true // Assume 503 is session issue
  }
  
  // 401/403 unauthorized
  if (status === 401 || status === 403) return true
  
  // 417 expectation failed (sometimes used for session issues)
  if (status === 417) return true
  
  // Check message content for session keywords
  if (typeof message === 'string') {
    const lowerMessage = message.toLowerCase()
    if (lowerMessage.includes('session stopped') || 
        lowerMessage.includes('session expired') ||
        lowerMessage.includes('not logged in') ||
        lowerMessage.includes('authentication required')) {
      return true
    }
  }
  
  return false
}

/**
 * Handle session expiry by logging the error
 * No redirect - let Frappe handle authentication for Desk Pages
 * Prevents multiple simultaneous error logging
 * 
 * @param {string} source - Source of the session expiry (for logging)
 */
export function handleSessionExpiry(source = 'unknown') {
  // Prevent multiple simultaneous redirects
  if (redirectInProgress) {
    console.log(`[session-manager] Redirect already in progress, skipping (source: ${source})`)
    return
  }
  
  redirectInProgress = true
  
  console.warn(`[session-manager] Session expired (source: ${source}) - user needs to re-authenticate through Frappe desk`)
  
  // Just log the error, don't redirect
  // User will see error in the UI and can navigate to desk login manually
  
  // Reset redirect flag after delay
  setTimeout(() => {
    redirectInProgress = false
  }, 1000)
}

/**
 * Check current session validity with server
 * 
 * @returns {Promise<boolean>} True if session is valid
 */
export async function checkSessionValidity() {
  try {
    const response = await fetch('/api/method/imogi_pos.api.public.check_session', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      return false
    }
    
    const data = await response.json()
    const isValid = data?.message?.valid || false
    
    if (!isValid) {
      console.warn('[session-manager] Session check returned invalid')
    }
    
    return isValid
  } catch (error) {
    console.error('[session-manager] Error checking session:', error)
    return false
  }
}

/**
 * React hook for monitoring session validity
 * Checks session periodically and redirects if expired
 * 
 * @param {number} intervalMs - Check interval in milliseconds (default: 5 minutes)
 */
export function useSessionMonitor(intervalMs = 5 * 60 * 1000) {
  if (typeof window === 'undefined') return
  
  // Initial check on mount
  checkSessionValidity().then(isValid => {
    if (!isValid && !redirectInProgress) {
      handleSessionExpiry('session-monitor-init')
    }
  })
  
  // Periodic check
  const intervalId = setInterval(async () => {
    const isValid = await checkSessionValidity()
    if (!isValid && !redirectInProgress) {
      handleSessionExpiry('session-monitor-periodic')
    }
  }, intervalMs)
  
  // Cleanup
  return () => clearInterval(intervalId)
}

/**
 * Add global error handler for unhandled session errors
 */
export function setupGlobalSessionErrorHandler() {
  // Listen for unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (isSessionExpired(event.reason)) {
      console.warn('[session-manager] Caught unhandled session error')
      handleSessionExpiry('unhandled-rejection')
      event.preventDefault()
    }
  })
  
  // Listen for custom session expired events
  window.addEventListener('sessionexpired', () => {
    console.warn('[session-manager] Received sessionexpired event')
    handleSessionExpiry('custom-event')
  })
}

// Auto-setup on import
if (typeof window !== 'undefined') {
  setupGlobalSessionErrorHandler()
}

export default {
  isSessionExpired,
  handleSessionExpiry,
  checkSessionValidity,
  useSessionMonitor,
  setupGlobalSessionErrorHandler
}
