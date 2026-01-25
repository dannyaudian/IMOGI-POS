import { useState, useEffect } from 'react'

/**
 * useCashierSession Hook
 * Manages cashier session state and info
 */
export function useCashierSession() {
  const [cashier, setCashier] = useState(null)
  const [branch, setBranch] = useState(null)
  const [sessionStart, setSessionStart] = useState(null)

  useEffect(() => {
    // Get current user
    const currentUser = frappe.session.user_fullname || frappe.session.user
    setCashier(currentUser)

    // Get default branch from user settings
    const userBranch = frappe.defaults.get_user_default('branch')
    setBranch(userBranch)

    // Set session start time
    setSessionStart(new Date())
  }, [])

  const sessionDuration = () => {
    if (!sessionStart) return '0m'
    const now = new Date()
    const diff = Math.floor((now - sessionStart) / 1000 / 60) // minutes
    if (diff < 60) return `${diff}m`
    const hours = Math.floor(diff / 60)
    const mins = diff % 60
    return `${hours}h ${mins}m`
  }

  return {
    cashier,
    branch,
    sessionStart,
    sessionDuration: sessionDuration()
  }
}
