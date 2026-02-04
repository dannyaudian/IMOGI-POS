/**
 * Waiter Alerts Container
 */

import React from 'react'
import { useWaiterContext } from '../context/WaiterContext'
import { ErrorMessage } from '@/shared/components/UI'

export function WaiterAlerts() {
  const { orderError, showSuccessMessage } = useWaiterContext()

  return (
    <>
      {orderError && (
        <div className="error-banner" style={{ margin: '1rem' }}>
          <ErrorMessage error={orderError} />
        </div>
      )}

      {showSuccessMessage && (
        <div className="success-banner">
          <div className="success-icon">✓</div>
          <p>Order sent to kitchen successfully!</p>
        </div>
      )}
    </>
  )
}
