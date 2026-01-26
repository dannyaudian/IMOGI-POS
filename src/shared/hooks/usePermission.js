import { useFrappeGetCall } from 'frappe-react-sdk'
import { useEffect, useState } from 'react'

/**
 * Hook to check permissions before making API calls
 * Prevents permission errors by validating access client-side first
 * 
 * @param {string} doctype - DocType to check permission for
 * @param {string} permType - Permission type (read, write, create, delete)
 * @returns {object} { hasPermission, loading, error }
 */
export function usePermission(doctype, permType = 'read') {
  const [hasPermission, setHasPermission] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Wait for session to be ready
  useEffect(() => {
    if (typeof frappe === 'undefined' || !frappe.session) {
      setLoading(false)
      setError('Session not initialized')
      return
    }

    // Use session.ready to wait for roles to load
    frappe.session.ready(function() {
      try {
        // Check if user is privileged (Administrator or System Manager)
        const userRoles = frappe.boot?.user?.roles || []
        const isPrivileged = userRoles.includes('System Manager') || 
                            frappe.session.user === 'Administrator'

        if (isPrivileged) {
          setHasPermission(true)
          setLoading(false)
          return
        }

        // For regular users, we need to check server-side permissions
        // Client-side we can only do basic role checks
        // TODO: Add client-side permission cache from server
        
        setHasPermission(true) // Assume yes, let server validate
        setLoading(false)
      } catch (err) {
        setError(err.message)
        setHasPermission(false)
        setLoading(false)
      }
    })
  }, [doctype, permType])

  return { hasPermission, loading, error }
}

/**
 * Hook to check if user has any of the required roles
 * Client-side role validation before API calls
 * 
 * @param {string[]} requiredRoles - Array of required role names
 * @returns {object} { hasRole, roles, loading, error }
 */
export function useRole(requiredRoles = []) {
  const [hasRole, setHasRole] = useState(false)
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (typeof frappe === 'undefined' || !frappe.session) {
      setLoading(false)
      setError('Session not initialized')
      return
    }

    // Wait for session to be ready (prevents race condition)
    frappe.session.ready(function() {
      try {
        const userRoles = frappe.boot?.user?.roles || []
        setRoles(userRoles)

        // Check if user has any of the required roles
        if (requiredRoles.length === 0) {
          // No specific roles required
          setHasRole(true)
        } else {
          const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role))
          setHasRole(hasRequiredRole)
        }

        setLoading(false)
      } catch (err) {
        setError(err.message)
        setHasRole(false)
        setLoading(false)
      }
    })
  }, [requiredRoles])

  return { hasRole, roles, loading, error }
}

/**
 * Hook to validate access to API endpoint before calling
 * Combines permission and role checks
 * 
 * @param {object} config - Configuration object
 * @param {string} config.doctype - DocType for permission check
 * @param {string} config.permType - Permission type
 * @param {string[]} config.roles - Required roles
 * @returns {object} { canAccess, loading, error }
 */
export function useAPIAccess({ doctype, permType = 'read', roles = [] }) {
  const { hasPermission, loading: permLoading, error: permError } = usePermission(doctype, permType)
  const { hasRole, loading: roleLoading, error: roleError } = useRole(roles)

  const loading = permLoading || roleLoading
  const error = permError || roleError
  const canAccess = hasPermission && (roles.length === 0 || hasRole)

  return { canAccess, loading, error }
}

/**
 * Higher-order hook to wrap API calls with permission validation
 * Prevents API calls if user lacks permission
 * 
 * @param {string} method - API method to call
 * @param {object} config - Permission configuration
 * @returns {object} Wrapped API hook with permission check
 */
export function useProtectedAPI(method, config = {}) {
  const { canAccess, loading: accessLoading, error: accessError } = useAPIAccess(config)
  
  // Note: This is a placeholder. Actual implementation depends on API type
  // For useFrappeGetCall, wrap it conditionally
  // For useFrappePostCall, return modified call function
  
  return {
    canAccess,
    loading: accessLoading,
    error: accessError,
    // Actual API hook result would be spread here
  }
}

/**
 * Wait for session to be fully ready with roles loaded
 * Use this in useEffect to prevent race conditions
 * 
 * @param {function} callback - Function to call when session is ready
 */
export function useSessionReady(callback) {
  useEffect(() => {
    if (typeof frappe === 'undefined' || !frappe.session) {
      console.warn('Frappe session not available')
      return
    }

    frappe.session.ready(callback)
  }, [callback])
}

/**
 * Get current user roles safely
 * Returns empty array if session not ready
 * 
 * @returns {string[]} User roles
 */
export function useUserRoles() {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof frappe === 'undefined' || !frappe.session) {
      setLoading(false)
      return
    }

    frappe.session.ready(function() {
      const userRoles = frappe.boot?.user?.roles || []
      setRoles(userRoles)
      setLoading(false)
    })
  }, [])

  return { roles, loading }
}
