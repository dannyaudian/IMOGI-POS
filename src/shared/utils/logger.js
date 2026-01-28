/**
 * IMOGI POS - Standard Logger
 * ============================
 * 
 * Provides consistent logging format across all JavaScript utilities.
 * 
 * Format: [imogi][module] message {data}
 * 
 * Example:
 *   [imogi][api] Calling imogi_pos.api.billing.list_orders {order_type: 'Counter'}
 *   [imogi][nav] 🚀 Navigating to /app/imogi-cashier
 *   [imogi][storage] Set: imogi_operational_context (TTL: 3600s)
 *   [imogi][context] ❌ Failed to fetch operational context {error}
 * 
 * Modules:
 *   - api: API calls (api.js)
 *   - nav: Navigation (deskNavigate.js)
 *   - loader: React bundle loading (imogi_loader.js)
 *   - storage: Cache operations (storage.js)
 *   - context: Operational context (useOperationalContext.js)
 *   - auth: Authentication
 *   - error: Error handling (errorHandler.js)
 */

// Global debug flag (can be set via localStorage or URL param)
const DEBUG_ENABLED = 
  localStorage.getItem('imogi_debug') === 'true' || 
  new URLSearchParams(window.location.search).get('debug') === 'true'

/**
 * Standard log - always printed
 * @param {string} module - Module name (api, nav, storage, etc.)
 * @param {string} message - Log message
 * @param {*} data - Optional data to log (will be JSON stringified if object)
 */
export function log(module, message, data = null) {
  const prefix = `[imogi][${module}]`
  if (data !== null && data !== undefined) {
    console.log(prefix, message, data)
  } else {
    console.log(prefix, message)
  }
}

/**
 * Debug log - only printed if DEBUG_ENABLED
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {*} data - Optional data
 */
export function debug(module, message, data = null) {
  if (!DEBUG_ENABLED) return
  
  const prefix = `[imogi][${module}] 🔍`
  if (data !== null && data !== undefined) {
    console.log(prefix, message, data)
  } else {
    console.log(prefix, message)
  }
}

/**
 * Error log - always printed with stack trace
 * @param {string} module - Module name
 * @param {string} message - Error message
 * @param {Error|Object} error - Error object or error details
 */
export function error(module, message, error = null) {
  const prefix = `[imogi][${module}] ❌`
  
  if (error) {
    if (error instanceof Error) {
      console.error(prefix, message, {
        message: error.message,
        stack: error.stack,
        httpStatus: error.httpStatus,
        responseText: error.responseText
      })
    } else {
      console.error(prefix, message, error)
    }
  } else {
    console.error(prefix, message)
  }
}

/**
 * Warning log - always printed
 * @param {string} module - Module name
 * @param {string} message - Warning message
 * @param {*} data - Optional data
 */
export function warn(module, message, data = null) {
  const prefix = `[imogi][${module}] ⚠️`
  if (data !== null && data !== undefined) {
    console.warn(prefix, message, data)
  } else {
    console.warn(prefix, message)
  }
}

/**
 * Success log - printed with green checkmark emoji
 * @param {string} module - Module name
 * @param {string} message - Success message
 * @param {*} data - Optional data
 */
export function success(module, message, data = null) {
  const prefix = `[imogi][${module}] ✅`
  if (data !== null && data !== undefined) {
    console.log(prefix, message, data)
  } else {
    console.log(prefix, message)
  }
}

/**
 * Enable debug logging (persists to localStorage)
 */
export function enableDebug() {
  localStorage.setItem('imogi_debug', 'true')
  console.log('[imogi][logger] 🔍 Debug logging enabled')
}

/**
 * Disable debug logging
 */
export function disableDebug() {
  localStorage.removeItem('imogi_debug')
  console.log('[imogi][logger] Debug logging disabled')
}

/**
 * Check if debug is enabled
 */
export function isDebugEnabled() {
  return DEBUG_ENABLED
}

// Export as default for convenience
export default {
  log,
  debug,
  error,
  warn,
  success,
  enableDebug,
  disableDebug,
  isDebugEnabled
}
