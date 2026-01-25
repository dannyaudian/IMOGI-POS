import { useState, useCallback } from 'react'
import { useCreateTableOrder, useSendToKitchen } from '@/shared/api/imogi-api'

/**
 * Hook for managing table orders and sending to kitchen
 * @param {string} branch - Current branch
 */
export function useTableOrder(branch) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { call: createOrder } = useCreateTableOrder()
  const { call: sendToKitchen } = useSendToKitchen()

  /**
   * Create table order and send items to kitchen
   * @param {Object} orderData - Order details
   * @param {string} orderData.table - Table name
   * @param {Array} orderData.items - Order items
   * @param {string} orderData.waiter - Waiter user
   * @param {string} orderData.customer - Customer name (optional)
   */
  const createTableOrder = useCallback(async (orderData) => {
    setLoading(true)
    setError(null)

    try {
      // Validate order data
      if (!orderData.table) {
        throw new Error('Table is required')
      }

      if (!orderData.items || orderData.items.length === 0) {
        throw new Error('Order must have at least one item')
      }

      // Create order in backend
      const result = await createOrder({
        branch,
        table: orderData.table,
        customer: orderData.customer || 'Walk-in Customer',
        waiter: orderData.waiter,
        items: orderData.items,
        notes: orderData.notes || ''
      })

      if (result && result.message) {
        return result.message
      }

      throw new Error('Failed to create order')
    } catch (err) {
      console.error('Failed to create table order:', err)
      setError(err.message || 'Failed to create order')
      throw err
    } finally {
      setLoading(false)
    }
  }, [branch, createOrder])

  /**
   * Send order items to kitchen (create KOTs)
   * @param {string} orderName - POS Order document name
   * @param {Array} items - Items to send to kitchen
   */
  const sendItemsToKitchen = useCallback(async (orderName, items) => {
    setLoading(true)
    setError(null)

    try {
      if (!items || items.length === 0) {
        throw new Error('No items to send')
      }

      // Group items by station
      const itemsByStation = {}
      items.forEach(item => {
        const station = item.station || 'Main Kitchen'
        if (!itemsByStation[station]) {
          itemsByStation[station] = []
        }
        itemsByStation[station].push(item)
      })

      // Send to kitchen
      const result = await sendToKitchen({
        order_name: orderName,
        items_by_station: itemsByStation
      })

      if (result && result.message) {
        return result.message // Returns created KOT names
      }

      throw new Error('Failed to send to kitchen')
    } catch (err) {
      console.error('Failed to send to kitchen:', err)
      setError(err.message || 'Failed to send to kitchen')
      throw err
    } finally {
      setLoading(false)
    }
  }, [sendToKitchen])

  /**
   * Create order and immediately send to kitchen
   * @param {Object} orderData - Complete order data
   */
  const createAndSendToKitchen = useCallback(async (orderData) => {
    try {
      // Step 1: Create order
      const order = await createTableOrder(orderData)

      // Step 2: Send items to kitchen
      const kots = await sendItemsToKitchen(order.name, orderData.items)

      return {
        order,
        kots
      }
    } catch (err) {
      throw err
    }
  }, [createTableOrder, sendItemsToKitchen])

  return {
    loading,
    error,
    createTableOrder,
    sendItemsToKitchen,
    createAndSendToKitchen
  }
}
