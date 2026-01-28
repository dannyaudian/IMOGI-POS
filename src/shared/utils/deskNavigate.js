/**
 * IMOGI POS - Desk Navigation Utility
 * 
 * Standardized navigation helper for Frappe Desk pages.
 * Prefers frappe.set_route when available, falls back to window.location.href
 * 
 * Usage:
 *   import { deskNavigate } from '@/shared/utils/deskNavigate'
 *   
 *   // Navigate to Desk page
 *   deskNavigate('/app/imogi-module-select')
 *   
 *   // Navigate with query params
 *   deskNavigate('/app/imogi-cashier?mode=counter')
 *   
 *   // Navigate with reason tracking
 *   deskNavigate('/app/imogi-module-select', { 
 *     reason: 'missing_pos_profile',
 *     target: 'imogi-cashier'
 *   })
 */

/**
 * Navigate to a Desk page route
 * 
 * @param {string} path - Absolute path (e.g., '/app/imogi-module-select')
 * @param {Object} options - Navigation options
 * @param {Object} options.params - Query parameters to append
 * @param {boolean} options.replace - Replace history instead of push (default: false)
 * @param {string} options.logPrefix - Prefix for console logs (default: '[deskNavigate]')
 * @returns {void}
 */
export function deskNavigate(path, options = {}) {
  const {
    params = {},
    replace = false,
    logPrefix = '[deskNavigate]'
  } = options

  // Build full URL with query params
  let fullUrl = path
  const queryParams = new URLSearchParams(params)
  const queryString = queryParams.toString()
  
  if (queryString) {
    const separator = path.includes('?') ? '&' : '?'
    fullUrl = `${path}${separator}${queryString}`
  }

  console.log(`${logPrefix} Navigating to:`, {
    path,
    params,
    fullUrl,
    method: typeof frappe !== 'undefined' && frappe.set_route ? 'frappe.set_route' : 'window.location'
  })

  // Prefer frappe.set_route for SPA navigation (no page reload)
  if (typeof frappe !== 'undefined' && frappe.set_route) {
    try {
      // Parse path to extract route segments
      // frappe.set_route expects: set_route('app', 'imogi-module-select')
      const pathWithoutQuery = fullUrl.split('?')[0]
      
      // Normalize: strip leading /app/ if present (frappe.set_route adds it)
      // e.g., '/app/imogi-cashier' → ['app', 'imogi-cashier']
      const normalizedPath = pathWithoutQuery.startsWith('/app/') 
        ? pathWithoutQuery.slice(1) // Remove leading '/'
        : pathWithoutQuery
      
      const routeParts = normalizedPath.split('/').filter(Boolean)
      
      // If query params exist, frappe.set_route can't handle them
      // Fall back to window.location for complex URLs
      if (queryString) {
        console.log(`${logPrefix} Query params detected, using window.location fallback`)
        if (replace) {
          window.location.replace(fullUrl)
        } else {
          window.location.href = fullUrl
        }
        return
      }
      
      // Use frappe.set_route for clean Desk navigation
      frappe.set_route(...routeParts)
      console.log(`${logPrefix} Navigation via frappe.set_route`)
      return
    } catch (error) {
      console.warn(`${logPrefix} frappe.set_route failed, falling back to window.location:`, error)
    }
  }

  // Fallback: Standard browser navigation (causes page reload)
  if (replace) {
    window.location.replace(fullUrl)
  } else {
    window.location.href = fullUrl
  }
  console.log(`${logPrefix} Navigation via window.location`)
}

/**
 * Navigate back to module-select with optional reason
 * 
 * @param {string} reason - Reason for redirect (e.g., 'missing_pos_profile')
 * @param {string} target - Target module identifier (e.g., 'imogi-cashier')
 * @param {string} logPrefix - Prefix for console logs
 * @returns {void}
 */
export function navigateToModuleSelect(reason = null, target = null, logPrefix = '[navigateToModuleSelect]') {
  const params = {}
  
  if (reason) params.reason = reason
  if (target) params.target = target
  
  deskNavigate('/app/imogi-module-select', { params, logPrefix })
}

/**
 * Check if current page matches a specific Desk route
 * 
 * @param {string} route - Route to check (e.g., 'imogi-module-select')
 * @returns {boolean} True if current page matches route
 */
export function isCurrentRoute(route) {
  if (typeof frappe !== 'undefined' && frappe.get_route) {
    const currentRoute = frappe.get_route()
    return currentRoute.includes(route)
  }
  
  // Fallback: Check window.location.pathname
  return window.location.pathname.includes(route)
}

export default deskNavigate
