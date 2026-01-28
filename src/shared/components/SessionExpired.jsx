/**
 * Session Expired Component
 * ==========================
 * 
 * Full-screen overlay shown when session expires (401/403/417 errors).
 * Prevents blank screens and instant redirects by showing clear UI.
 * 
 * TRIGGERS:
 * - Listen for 'imogi-session-expired' custom event
 * - Automatically shown when apiCall() detects auth failure
 * - Can be manually triggered by dispatching the event
 * 
 * USAGE:
 *   import { SessionExpiredProvider } from '@/shared/components/SessionExpired'
 *   
 *   function App() {
 *     return (
 *       <SessionExpiredProvider>
 *         <YourApp />
 *       </SessionExpiredProvider>
 *     )
 *   }
 */

import { useState, useEffect } from 'react'
import './SessionExpired.css'

/**
 * Session Expired Modal Component
 */
export function SessionExpiredModal({ onReload, onBackToLogin }) {
  const [countdown, setCountdown] = useState(30)

  // Auto-reload countdown
  useEffect(() => {
    if (countdown <= 0) {
      onReload()
      return
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, onReload])

  return (
    <div className="session-expired-overlay" role="dialog" aria-modal="true" aria-labelledby="session-expired-title">
      <div className="session-expired-modal">
        <div className="session-expired-icon">
          <i className="fa fa-exclamation-triangle"></i>
        </div>
        
        <h2 id="session-expired-title" className="session-expired-title">
          Session Expired
        </h2>
        
        <p className="session-expired-message">
          Your login session has expired. Please log in again to continue.
        </p>

        <div className="session-expired-details">
          <div className="session-expired-detail-item">
            <i className="fa fa-info-circle"></i>
            <span>This can happen after being inactive for a while</span>
          </div>
          <div className="session-expired-detail-item">
            <i className="fa fa-shield-alt"></i>
            <span>Your data is safe and will be restored after login</span>
          </div>
        </div>

        <div className="session-expired-actions">
          <button 
            className="btn btn-primary btn-session-reload" 
            onClick={onReload}
          >
            <i className="fa fa-sync-alt"></i>
            Reload & Login
          </button>
          
          <button 
            className="btn btn-secondary btn-session-login" 
            onClick={onBackToLogin}
          >
            <i className="fa fa-sign-in-alt"></i>
            Back to Login
          </button>
        </div>

        <div className="session-expired-countdown">
          Auto-reloading in {countdown} seconds...
        </div>

        <div className="session-expired-help">
          <p>
            <strong>Need help?</strong> Contact your system administrator if this keeps happening.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Session Expired Provider
 * Wrap your app with this to enable session expiry detection
 */
export function SessionExpiredProvider({ children }) {
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    // Listen for session expired events
    const handleSessionExpired = (event) => {
      console.error('[SessionExpired] Session expired event received:', event.detail)
      setIsExpired(true)
    }

    window.addEventListener('imogi-session-expired', handleSessionExpired)

    // Also check on mount if already expired
    if (window.frappe && window.frappe.session && window.frappe.session.user === 'Guest') {
      console.error('[SessionExpired] Already logged out (Guest user)')
      setIsExpired(true)
    }

    return () => {
      window.removeEventListener('imogi-session-expired', handleSessionExpired)
    }
  }, [])

  const handleReload = () => {
    console.log('[SessionExpired] Reloading page...')
    window.location.reload()
  }

  const handleBackToLogin = () => {
    console.log('[SessionExpired] Redirecting to login...')
    // For Desk apps, go to Frappe login
    if (window.location.pathname.startsWith('/app/')) {
      window.location.href = '/login'
    } else {
      // For WWW apps, go to home or login
      window.location.href = '/login'
    }
  }

  if (!isExpired) {
    return <>{children}</>
  }

  return (
    <>
      {children}
      <SessionExpiredModal 
        onReload={handleReload} 
        onBackToLogin={handleBackToLogin}
      />
    </>
  )
}

/**
 * Hook to manually trigger session expired state
 */
export function useSessionExpired() {
  const triggerSessionExpired = (message = 'Session expired') => {
    window.dispatchEvent(new CustomEvent('imogi-session-expired', {
      detail: { message }
    }))
  }

  return { triggerSessionExpired }
}
