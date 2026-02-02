import { useState, useEffect } from 'react'
import './NetworkStatus.css'

/**
 * Network Status Indicator Component
 * 
 * Shows a fixed badge when offline or just reconnected.
 * Automatically hides after 5 seconds when back online.
 * 
 * Uses browser's navigator.onLine API + online/offline events
 * 
 * Usage:
 *   <NetworkStatus />
 */
export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showReconnected, setShowReconnected] = useState(false)
  
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setShowReconnected(true)
      
      // Show success toast
      if (window.frappe && frappe.show_alert) {
        frappe.show_alert({
          message: '✅ Back online',
          indicator: 'green'
        }, 3)
      }
      
      // Hide reconnected badge after 5 seconds
      const timer = setTimeout(() => setShowReconnected(false), 5000)
      return () => clearTimeout(timer)
    }
    
    const handleOffline = () => {
      setIsOnline(false)
      setShowReconnected(false)
      
      // Show warning toast
      if (window.frappe && frappe.show_alert) {
        frappe.show_alert({
          message: '⚠️ No internet connection',
          indicator: 'orange'
        }, 10)
      }
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  
  // Don't show anything if online (unless just reconnected)
  if (isOnline && !showReconnected) return null
  
  return (
    <div 
      className={`network-status ${isOnline ? 'online' : 'offline'}`}
      role="status"
      aria-live="polite"
    >
      <i className={`fa fa-${isOnline ? 'wifi' : 'wifi-slash'}`}></i>
      <span>{isOnline ? 'Reconnected' : 'Offline'}</span>
    </div>
  )
}
