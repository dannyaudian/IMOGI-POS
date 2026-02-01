import React from 'react'
import { useBillRequest } from '../hooks'

/**
 * RequestBillButton Component
 * Allows waiter to request bill/payment for a dine-in order
 * Only shows for orders that:
 * - Are dine-in with table assigned
 * - Not yet requested payment
 * - Not closed/cancelled
 */
export function RequestBillButton({ order, onSuccess }) {
  const { requestBill, loading } = useBillRequest()

  if (!order) return null

  // Only show for dine-in orders with table
  if (order.order_type !== 'Dine-in' || !order.table) {
    return null
  }

  // Hide if already requested
  if (order.request_payment) {
    return (
      <button className="btn-bill-requested" disabled>
        <i className="fa fa-check-circle"></i> Bill Requested
      </button>
    )
  }

  // Hide if order closed/cancelled
  const closedStates = ['Closed', 'Cancelled', 'Returned']
  if (closedStates.includes(order.workflow_state)) {
    return null
  }

  // Hide if already paid
  if (order.paid_at) {
    return (
      <button className="btn-bill-paid" disabled>
        <i className="fa fa-check-double"></i> Paid
      </button>
    )
  }

  const handleRequestBill = async () => {
    try {
      const result = await requestBill(order.name)
      
      if (onSuccess) {
        onSuccess(result)
      }
    } catch (err) {
      console.error('Request bill failed:', err)
    }
  }

  return (
    <button
      className="btn-request-bill"
      onClick={handleRequestBill}
      disabled={loading}
    >
      <i className="fa fa-receipt"></i>
      {loading ? 'Requesting...' : 'Request Bill'}
    </button>
  )
}
