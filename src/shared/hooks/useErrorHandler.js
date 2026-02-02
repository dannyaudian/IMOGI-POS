import { useCallback } from 'react'

/**
 * Centralized error handling hook with Frappe toast integration
 * 
 * Provides consistent error display across the app:
 * - Maps Frappe error types to appropriate colors
 * - Shows user-friendly messages
 * - Logs errors for debugging
 * - Optional retry functionality
 * 
 * Usage:
 *   const { showError, handleError } = useErrorHandler()
 *   
 *   try {
 *     await apiCall(...)
 *   } catch (error) {
 *     showError(error, { title: 'Failed to save' })
 *   }
 * 
 *   // Or with retry:
 *   handleError(error, {
 *     title: 'Network error',
 *     onRetry: () => apiCall(...)
 *   })
 */
export function useErrorHandler() {
  /**
   * Show error message to user via Frappe toast
   */
  const showError = useCallback((error, options = {}) => {
    const { 
      title = 'Error',
      duration = 5000,
      silent = false
    } = options
    
    const message = extractErrorMessage(error)
    const indicator = getErrorIndicator(error, message)
    
    // Log to console for debugging
    console.error(`[${title}]`, message, error)
    
    // Show toast to user
    if (!silent && window.frappe && frappe.show_alert) {
      frappe.show_alert({
        message: `${title}: ${message}`,
        indicator
      }, duration / 1000)
    }
    
    return message
  }, [])
  
  /**
   * Handle error with optional retry action
   */
  const handleError = useCallback((error, options = {}) => {
    const { 
      onRetry = null,
      ...showOptions
    } = options
    
    const message = showError(error, showOptions)
    
    // If retry action provided, store it globally for retry button
    if (onRetry && window.frappe) {
      window.__lastErrorRetryAction = onRetry
      
      // Show retry option after initial toast
      setTimeout(() => {
        if (frappe.show_alert) {
          frappe.show_alert({
            message: 'Click here to retry',
            indicator: 'blue'
          }, 10)
        }
      }, 3000)
    }
    
    return message
  }, [showError])
  
  /**
   * Map error to user-friendly message
   */
  const mapErrorMessage = useCallback((error) => {
    const message = extractErrorMessage(error)
    
    // Common error mappings
    const errorMap = {
      'permission': 'You don\'t have permission for this action',
      'not found': 'Item not found',
      'network': 'Network connection issue',
      'timeout': 'Request timed out',
      'session': 'Session expired. Please refresh.',
      'validation': 'Invalid data provided',
    }
    
    for (const [key, friendlyMsg] of Object.entries(errorMap)) {
      if (message.toLowerCase().includes(key)) {
        return friendlyMsg
      }
    }
    
    return message
  }, [])
  
  return {
    showError,
    handleError,
    mapErrorMessage
  }
}

/**
 * Extract error message from various error formats
 */
function extractErrorMessage(error) {
  if (typeof error === 'string') return error
  
  // Frappe error format
  if (error?.message) return error.message
  if (error?.exc) return error.exc
  
  // HTTP error
  if (error?.response?.data?.message) return error.response.data.message
  if (error?.response?.message) return error.response.message
  
  // Network error
  if (error?.name === 'NetworkError') return 'Network connection failed'
  if (error?.name === 'TimeoutError') return 'Request timed out'
  
  return error?.toString() || 'Unknown error occurred'
}

/**
 * Determine toast indicator color based on error type
 */
function getErrorIndicator(error, message) {
  const msg = message.toLowerCase()
  
  // Permission/authorization errors
  if (msg.includes('permission') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return 'orange'
  }
  
  // Validation errors
  if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required')) {
    return 'yellow'
  }
  
  // Not found errors
  if (msg.includes('not found') || msg.includes('does not exist')) {
    return 'blue'
  }
  
  // Network errors
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
    return 'orange'
  }
  
  // Default to red for other errors
  return 'red'
}
