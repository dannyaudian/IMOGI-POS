import { useFrappeAuth, useFrappeGetCall } from 'frappe-react-sdk'
import { useEffect, useState } from 'react'

/**
 * Hook untuk check authentication dan role-based access
 * @param {string[]} requiredRoles - Array of required roles (e.g., ['Cashier', 'Branch Manager'])
 * @returns {object} { user, loading, hasAccess, error }
 */
export function useAuth(requiredRoles = []) {
  const { currentUser, isLoading: authLoading } = useFrappeAuth()
  const [hasAccess, setHasAccess] = useState(false)
  const [error, setError] = useState(null)

  // Get user roles
  const { data: userData, error: userError, isLoading: userLoading } = useFrappeGetCall(
    'frappe.auth.get_logged_user',
    undefined,
    undefined,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false
    }
  )

  useEffect(() => {
    // Only redirect to login for auth errors (401/403), not server errors (500)
    if (currentUser === 'Guest' || !currentUser) {
      // Check if this is an actual auth issue vs server error
      if (!userError || userError.httpStatus === 401 || userError.httpStatus === 403) {
        // Redirect ke login page only for auth issues
        const currentPath = window.location.pathname
        window.location.href = `/shared/login?redirect=${encodeURIComponent(currentPath)}`
        return
      }
    }

    // If we have a server error (500), don't treat it as permission issue
    if (userError && userError.httpStatus >= 500) {
      setError(`Server error (${userError.httpStatus}): ${userError.message || 'Internal server error'}. Please contact administrator.`)
      setHasAccess(false)
      return
    }

    // Check role access jika diperlukan
    if (requiredRoles.length > 0 && userData) {
      const userRoles = userData.roles || []
      const hasRole = requiredRoles.some(role => userRoles.includes(role))
      
      if (!hasRole) {
        setError('Insufficient permissions. Required roles: ' + requiredRoles.join(', '))
        setHasAccess(false)
      } else {
        setHasAccess(true)
        setError(null)
      }
    } else if (userData) {
      setHasAccess(true)
      setError(null)
    }
  }, [currentUser, userData, userError, requiredRoles])

  return {
    user: currentUser,
    userData,
    loading: authLoading || userLoading,
    hasAccess,
    error: error || (userError && userError.httpStatus < 500 ? userError : null)
  }
}

/**
 * Get initial state dari server (passed via window.__INITIAL_STATE__)
 */
export function useInitialState() {
  return window.__INITIAL_STATE__ || {}
}

/**
 * Get CSRF token dari server
 */
export function getCSRFToken() {
  return window.FRAPPE_CSRF_TOKEN || ''
}
