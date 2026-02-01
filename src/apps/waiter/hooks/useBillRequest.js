import { useState } from 'react'
import { apiCall } from '@/shared/utils/api'

/**
 * Hook for restaurant bill request flow
 * Waiter requests bill, Cashier claims and processes payment
 */
export function useBillRequest() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Request bill for an order (Waiter action)
   * Sets request_payment=1 and requested_payment_at timestamp
   */
  const requestBill = async (posOrderName) => {
    setLoading(true)
    setError(null)

    try {
      const response = await apiCall('imogi_pos.api.orders.request_bill', {
        pos_order_name: posOrderName
      })

      if (response.success) {
        frappe.show_alert({
          message: 'Bill requested successfully',
          indicator: 'green'
        }, 3)
        
        return response
      } else {
        throw new Error(response.error || 'Failed to request bill')
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to request bill'
      setError(errorMsg)
      
      frappe.show_alert({
        message: errorMsg,
        indicator: 'red'
      }, 5)
      
      throw err
    } finally {
      setLoading(false)
    }
  }

  /**
   * Claim order for payment processing (Cashier action)
   * Implements concurrency guard - only one cashier can claim
   */
  const claimOrder = async (posOrderName, openingEntry = null) => {
    setLoading(true)
    setError(null)

    try {
      const response = await apiCall('imogi_pos.api.orders.claim_order', {
        pos_order_name: posOrderName,
        opening_entry: openingEntry
      })

      if (response.success) {
        frappe.show_alert({
          message: response.is_reentrant 
            ? 'Order already claimed by you' 
            : 'Order claimed successfully',
          indicator: 'green'
        }, 3)
        
        return response
      } else {
        throw new Error(response.error || 'Failed to claim order')
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to claim order'
      setError(errorMsg)
      
      frappe.show_alert({
        message: errorMsg,
        indicator: 'red'
      }, 5)
      
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    requestBill,
    claimOrder,
    loading,
    error
  }
}
