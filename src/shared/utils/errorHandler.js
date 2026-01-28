/**
 * IMOGI POS - Centralized Error Handler
 * 
 * PURPOSE:
 * Unified error handling for all React components
 * 
 * FEATURES:
 * - Session expiry detection (delegates to SessionExpiredProvider)
 * - Network error handling
 * - API error formatting
 * - User-friendly error messages
 * - Centralized error logging (ready for Sentry)
 * 
 * USAGE:
 *   import { handleAPIError, showUserError, logError } from '@/shared/utils/errorHandler'
 *   
 *   try {
 *     const data = await apiCall('method', args)
 *   } catch (error) {
 *     handleAPIError(error, { context: 'Loading orders', module: 'cashier' })
 *   }
 */

import * as logger from './logger'

/**
 * Custom API Error class
 */
export class APIError extends Error {
  constructor(message, code, details = {}) {
    super(message)
    this.name = 'APIError'
    this.code = code
    this.details = details
  }
}

/**
 * Main error handler - routes errors to appropriate handlers
 * 
 * @param {Error} error - Error object
 * @param {Object} context - Additional context (module, action, etc.)
 */
export function handleAPIError(error, context = {}) {
  logger.error('error', 'API error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context,
    timestamp: new Date().toISOString()
  })
  
  // Session expired - handled by SessionExpiredProvider
  // Don't show additional message, provider will display modal
  if (error.name === 'SessionExpiredError') {
    logger.log('error', 'Session expired - delegating to SessionExpiredProvider')
    return
  }
  
  // Network error - connection/timeout issues
  if (isNetworkError(error)) {
    showNetworkError(error, context)
    return
  }
  
  // API error - backend returned error response
  if (error instanceof APIError) {
    showAPIError(error, context)
    return
  }
  
  // Frappe error - from frappe.call exc response
  if (error.exc_type || error.exc) {
    showFrappeError(error, context)
    return
  }
  
  // Generic error - unknown type
  showGenericError(error, context)
}

/**
 * Check if error is network-related
 */
function isNetworkError(error) {
  const networkKeywords = [
    'fetch',
    'network',
    'timeout',
    'Failed to fetch',
    'NetworkError',
    'ECONNREFUSED',
    'ETIMEDOUT'
  ]
  
  const message = error.message || ''
  return networkKeywords.some(keyword => message.includes(keyword))
}

/**
 * Show network error message
 */
function showNetworkError(error, context) {
  const action = context.action || 'complete this action'
  
  frappe.msgprint({
    title: 'Connection Error',
    message: `Unable to ${action}. Please check your internet connection and try again.`,
    indicator: 'red',
    primary_action: {
      label: 'Retry',
      action: () => {
        if (context.retry && typeof context.retry === 'function') {
          context.retry()
        }
      }
    }
  })
  
  // Log for debugging
  logError(error, { ...context, errorType: 'network' })
}

/**
 * Show API error message (custom APIError)
 */
function showAPIError(error, context) {
  frappe.msgprint({
    title: error.code ? `Error ${error.code}` : 'Error',
    message: error.message || 'An error occurred. Please try again.',
    indicator: 'red'
  })
  
  logError(error, { ...context, errorType: 'api', code: error.code })
}

/**
 * Show Frappe error message (from frappe.call)
 */
function showFrappeError(error, context) {
  // Extract error message from Frappe response
  let message = 'An error occurred. Please try again.'
  
  if (error.exc_type && error._server_messages) {
    try {
      const serverMessages = JSON.parse(error._server_messages)
      if (Array.isArray(serverMessages) && serverMessages.length > 0) {
        const firstMsg = JSON.parse(serverMessages[0])
        message = firstMsg.message || message
      }
    } catch (e) {
      // Fallback to exc or message
      message = error.exc || error.message || message
    }
  } else if (error.exc) {
    message = error.exc
  } else if (error.message) {
    message = error.message
  }
  
  frappe.msgprint({
    title: 'Error',
    message: message,
    indicator: 'red'
  })
  
  logError(error, { ...context, errorType: 'frappe', exc_type: error.exc_type })
}

/**
 * Show generic error message
 */
function showGenericError(error, context) {
  frappe.msgprint({
    title: 'Unexpected Error',
    message: error.message || 'Something went wrong. Please contact support if this persists.',
    indicator: 'red'
  })
  
  logError(error, { ...context, errorType: 'generic' })
}

/**
 * Show user-friendly error message
 * Use this for validation errors or expected error states
 * 
 * @param {string} title - Error title
 * @param {string} message - Error message
 * @param {string} indicator - Color indicator (red, orange, yellow)
 */
export function showUserError(title, message, indicator = 'orange') {
  frappe.msgprint({ title, message, indicator })
}

/**
 * Show user-friendly warning message
 * 
 * @param {string} title - Warning title
 * @param {string} message - Warning message
 */
export function showUserWarning(title, message) {
  frappe.msgprint({ title, message, indicator: 'yellow' })
}

/**
 * Show user-friendly success message
 * 
 * @param {string} title - Success title
 * @param {string} message - Success message
 */
export function showUserSuccess(title, message) {
  frappe.msgprint({ title, message, indicator: 'green' })
}

/**
 * Centralized error logging
 * Ready for integration with Sentry or other logging services
 * 
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
export function logError(error, context = {}) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    user: frappe?.session?.user || 'unknown',
    route: window.location.pathname,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      exc_type: error.exc_type
    },
    context
  }
  
  // Console logging for development
  console.error('[Error Log]', errorLog)
  
  // TODO: Send to Sentry/logging service in production
  // if (window.Sentry) {
  //   Sentry.captureException(error, {
  //     tags: {
  //       module: context.module,
  //       action: context.action
  //     },
  //     extra: context
  //   })
  // }
  
  // TODO: Log to Frappe Error Log for server-side tracking
  // frappe.call({
  //   method: 'imogi_pos.utils.error_logging.log_frontend_error',
  //   args: { error_log: errorLog }
  // })
}

/**
 * Wrap async function with error handling
 * Useful for event handlers and callbacks
 * 
 * @param {Function} fn - Async function to wrap
 * @param {Object} context - Error context
 * @returns {Function} Wrapped function
 * 
 * USAGE:
 *   const handleClick = withErrorHandler(async () => {
 *     const data = await apiCall('method', args)
 *     // ... process data
 *   }, { module: 'cashier', action: 'Load orders' })
 */
export function withErrorHandler(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      handleAPIError(error, context)
      throw error // Re-throw for caller to handle if needed
    }
  }
}

/**
 * Create a retry wrapper for API calls
 * 
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} delay - Delay between retries (ms)
 * @returns {Function} Wrapped function with retry logic
 * 
 * USAGE:
 *   const fetchWithRetry = withRetry(
 *     () => apiCall('method', args),
 *     3,  // 3 retries
 *     1000  // 1 second delay
 *   )
 *   const data = await fetchWithRetry()
 */
export function withRetry(fn, maxRetries = 3, delay = 1000) {
  return async function retryWrapper(...args) {
    let lastError
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args)
      } catch (error) {
        lastError = error
        
        // Don't retry on session expiry or user errors
        if (error.name === 'SessionExpiredError' || error.code >= 400 && error.code < 500) {
          throw error
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          throw error
        }
        
        console.warn(`[Retry] Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw lastError
  }
}

export default {
  handleAPIError,
  showUserError,
  showUserWarning,
  showUserSuccess,
  logError,
  withErrorHandler,
  withRetry,
  APIError
}
