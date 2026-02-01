/**
 * IMOGI POS - Robust API Call Utility
 * =====================================
 * 
 * PERMANENT FIX for 417/401/403 errors causing blank screens and login redirects.
 * 
 * KEY FEATURES:
 * - Uses frappe.call if available (includes CSRF automatically)
 * - Falls back to fetch with proper CSRF token handling
 * - Normalizes all responses to r.message format
 * - Explicit handling of r.exc (Frappe error format)
 * - Session expiry detection (401/403 + intelligent 417 handling)
 * - Shows full-screen "Session Expired" UI (no instant redirect)
 * - Retry logic for network errors ONLY (not auth errors)
 * - Standard logging with [imogi][api] format
 * 
 * USAGE:
 *   import { apiCall } from '@/shared/utils/api'
 *   
 *   // Simple call
 *   const orders = await apiCall('imogi_pos.api.billing.list_orders_for_cashier', {
 *     order_type: 'Counter'
 *   })
 *   
 *   // With options
 *   const result = await apiCall('imogi_pos.api.orders.submit_order', 
 *     { order_name: 'POS-001' },
 *     { 
 *       freeze: true,        // Show loading overlay
 *       silent: false,       // Show errors to user
 *       retry: 3,           // Retry on network error
 *       onSessionExpired: () => showExpiredUI()  // Custom handler
 *     }
 *   )
 */

import * as logger from './logger'

// Global session expired state
let sessionExpiredHandlerCalled = false

/**
 * Main API call function - USE THIS for all API requests
 * 
 * @param {string} method - Frappe method path (e.g., 'imogi_pos.api.billing.list_orders_for_cashier')
 * @param {Object} args - Method arguments
 * @param {Object} options - Call options
 * @returns {Promise} Promise resolving with response.message or rejecting with error
 */
export async function apiCall(method, args = {}, options = {}) {
  const {
    freeze = false,           // Show loading overlay
    silent = false,           // Don't show error toasts
    retry = 2,               // Retry count for network errors
    timeout = 30000,         // Request timeout (30s)
    onSessionExpired = null, // Custom session expired handler
  } = options

  // Check if user is already Guest before making the call
  if (isSessionExpired()) {
    logger.error('api', 'Session already expired (Guest user detected)')
    handleSessionExpired(onSessionExpired)
    throw new Error('Session expired. Please log in again.')
  }

  logger.log('api', `Calling ${method}`, args)

  try {
    let response

    // Prefer frappe.call if available (more reliable, includes CSRF automatically)
    if (window.frappe && typeof window.frappe.call === 'function') {
      response = await callViaFrappe(method, args, { freeze, timeout })
    } else {
      // Fallback to fetch (e.g., in WWW context without Desk)
      response = await callViaFetch(method, args, { timeout })
    }

    // Normalize response format
    const normalized = normalizeResponse(response)

    // Check if response contains login HTML (session expired)
    if (isLoginPage(normalized)) {
      logger.error('api', 'Login page detected in response')
      handleSessionExpired(onSessionExpired)
      throw new Error('Session expired. Please log in again.')
    }

    logger.log('api', `Success: ${method}`, normalized)
    return normalized

  } catch (error) {
    // Log full error details
    logger.error('api', `Error calling ${method}`, {
      method,
      args,
      error: error.message,
      stack: error.stack,
      httpStatus: error.httpStatus,
      responseText: error.responseText,
      exc: error.exc
    })

    // Check if this is an auth error (401/403, or 417 with auth-related exc)
    if (isAuthError(error)) {
      logger.error('api', `Authentication error detected: ${error.httpStatus}`, {
        exc: error.exc,
        exception: error.exception
      })
      handleSessionExpired(onSessionExpired)
      throw new Error('Session expired. Please log in again.')
    }

    // Check if this is a network error that should be retried
    if (shouldRetry(error) && retry > 0) {
      logger.warn('api', `Retrying ${method} (${retry} attempts left)`)
      await sleep(1000) // Wait 1s before retry
      return apiCall(method, args, { ...options, retry: retry - 1 })
    }

    // Show error to user unless silent
    if (!silent) {
      showError(error)
    }

    throw error
  }
}

/**
 * Call API using frappe.call (preferred method)
 */
function callViaFrappe(method, args, options) {
  const { freeze, timeout } = options

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`))
    }, timeout)

    window.frappe.call({
      method: method,
      args: args,
      freeze: freeze,
      callback: (r) => {
        clearTimeout(timeoutId)
        resolve(r)
      },
      error: (r) => {
        clearTimeout(timeoutId)
        const error = new Error(r.exception || r.message || 'API call failed')
        error.httpStatus = r.httpStatus || (r.responseJSON && r.responseJSON.httpStatus)
        error.responseText = r.responseText
        error._frappe_error = r
        reject(error)
      }
    })
  })
}

/**
 * Call API using fetch (fallback method)
 */
async function callViaFetch(method, args, options) {
  const { timeout } = options

  // Get CSRF token
  const csrfToken = getCSRFToken()
  if (!csrfToken) {
    logger.error('api', 'CSRF token not found', {
      hasFrappe: !!window.frappe,
      hasCsrfToken: !!(window.frappe && window.frappe.csrf_token),
      hasWindowToken: !!window.FRAPPE_CSRF_TOKEN,
      cookies: document.cookie
    })
    throw new Error('CSRF token not found. Session may have expired.')
  }
  
  logger.debug('api', `Using CSRF token for ${method}`, {
    tokenLength: csrfToken.length,
    tokenPreview: csrfToken.substring(0, 10) + '...'
  })

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`/api/method/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Frappe-CSRF-Token': csrfToken
      },
      credentials: 'include', // Critical for session cookies
      body: JSON.stringify(args),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    // Check HTTP status
    if (!response.ok) {
      // Try to parse error response for better debugging
      let errorBody = ''
      let errorData = null
      
      try {
        errorBody = await response.text()
        errorData = JSON.parse(errorBody)
      } catch (e) {
        // Not JSON, use text
      }
      
      // Build detailed error message
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      
      if (errorData) {
        // Frappe error format
        if (errorData.exception) {
          errorMessage = errorData.exception
        } else if (errorData._server_messages) {
          try {
            const messages = JSON.parse(errorData._server_messages)
            errorMessage = messages.map(m => JSON.parse(m).message).join(', ')
          } catch (e) {
            errorMessage = errorData._server_messages
          }
        }
      }
      
      logger.error('api', `HTTP Error ${response.status} calling ${method}`, {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorBody.substring(0, 500), // First 500 chars
        errorData,
        method,
        args
      })
      
      const error = new Error(errorMessage)
      error.httpStatus = response.status
      error.responseText = errorBody
      error.responseData = errorData
      throw error
    }

    // Parse JSON response
    const data = await response.json()

    // Return in frappe.call format
    return {
      message: data.message,
      exc: data.exc,
      exception: data.exception,
      _exc_source: data._exc_source
    }

  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`)
    }
    throw error
  }
}

/**
 * Normalize response to consistent format
 */
function normalizeResponse(response) {
  // Frappe response format: { message: ..., exc: ..., exception: ... }
  if (response && typeof response === 'object') {
    // Check for Frappe exception first
    if (response.exc || response.exception) {
      const error = new Error(response.exception || 'API returned an exception')
      error.exc = response.exc
      error.exception = response.exception
      error._exc_source = response._exc_source
      throw error
    }

    // Return message content
    return response.message
  }

  // Direct value
  return response
}

/**
 * Check if session has expired
 */
function isSessionExpired() {
  // Check if frappe.session.user is Guest
  if (window.frappe && window.frappe.session) {
    return window.frappe.session.user === 'Guest'
  }
  return false
}

/**
 * Check if response contains login page HTML
 */
function isLoginPage(response) {
  if (typeof response === 'string') {
    return response.includes('<!DOCTYPE html>') && 
           (response.includes('login') || response.includes('Login'))
  }
  return false
}

/**
 * Check if error is an authentication error
 * 
 * 401/403 are always auth errors.
 * 417 (Expectation Failed) needs further inspection:
 *   - If r.exc contains "SessionExpired", "AuthenticationError", "PermissionError" → auth error
 *   - Otherwise (validation errors, business logic) → NOT auth error
 */
function isAuthError(error) {
  const status = error.httpStatus
  
  // 401/403 are always auth errors
  if (status === 401 || status === 403) {
    logger.debug('api', `Auth error detected: ${status}`)
    return true
  }
  
  // 417 requires checking r.exc content
  if (status === 417) {
    const exc = error.exc || error.exception || ''
    const authKeywords = ['SessionExpired', 'AuthenticationError', 'PermissionError', 'Unauthorized', 'Forbidden']
    
    const isAuth = authKeywords.some(keyword => exc.includes(keyword))
    
    if (isAuth) {
      logger.debug('api', `417 is auth error: ${exc}`)
    } else {
      logger.debug('api', `417 is NOT auth error (validation/business logic): ${exc}`)
    }
    
    return isAuth
  }
  
  return false
}

/**
 * Check if error should be retried
 */
function shouldRetry(error) {
  // Don't retry auth errors
  if (isAuthError(error)) {
    return false
  }

  // Retry network errors
  if (error.message && (
    error.message.includes('timeout') ||
    error.message.includes('network') ||
    error.message.includes('Failed to fetch')
  )) {
    return true
  }

  return false
}

/**
 * Get CSRF token from various sources
 */
function getCSRFToken() {
  // Try frappe object first
  if (window.frappe && window.frappe.csrf_token) {
    return window.frappe.csrf_token
  }

  // Try window.FRAPPE_CSRF_TOKEN (set by polyfill)
  if (window.FRAPPE_CSRF_TOKEN) {
    return window.FRAPPE_CSRF_TOKEN
  }

  // Try reading from cookie
  const cookies = document.cookie.split(';')
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'csrf_token') {
      return value
    }
  }

  return null
}

/**
 * Handle session expiration
 */
function handleSessionExpired(customHandler) {
  // Prevent multiple handlers
  if (sessionExpiredHandlerCalled) {
    return
  }
  sessionExpiredHandlerCalled = true

  console.error('[imogi-api] Session expired - showing UI')

  // Use custom handler if provided
  if (typeof customHandler === 'function') {
    customHandler()
    return
  }

  // Dispatch event for SessionExpired component to catch
  window.dispatchEvent(new CustomEvent('imogi-session-expired', {
    detail: { message: 'Your session has expired. Please log in again.' }
  }))
}

/**
 * Show error to user
 */
function showError(error) {
  const message = getErrorMessage(error)

  // Try frappe.msgprint first
  if (window.frappe && window.frappe.msgprint) {
    window.frappe.msgprint({
      title: 'Error',
      indicator: 'red',
      message: message
    })
    return
  }

  // Fallback to alert
  alert(`Error: ${message}`)
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(error) {
  if (error.exception) {
    return error.exception
  }
  if (error.message) {
    return error.message
  }
  return 'An unexpected error occurred'
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if an error object represents a session expiry
 * This is useful for checking errors caught from API calls
 * 
 * @param {Error|Object} error - Error object from API call
 * @returns {boolean} True if error indicates session expiry
 */
export function isSessionExpiredFromError(error) {
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
  if (status === 417) {
    // Check if it's really a session issue vs validation error
    if (typeof message === 'string') {
      const lowerMessage = message.toLowerCase()
      if (lowerMessage.includes('session') || 
          lowerMessage.includes('authentication') ||
          lowerMessage.includes('permission')) {
        return true
      }
    }
    return false // Don't assume all 417 are session issues
  }
  
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
 * Reset session expired flag (for testing)
 */
export function resetSessionExpiredFlag() {
  sessionExpiredHandlerCalled = false
}
