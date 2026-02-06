/**
 * Realtime Order Updates Hook
 * Connects to Frappe's socket.io for live order updates
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Order status updates (Draft → Submitted → Paid)
 * - New order notifications
 * - Item additions/modifications
 * - Grace period before showing reconnection attempts
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { TIMING } from '../constants'

export function useRealtimeOrders({ 
  posProfile, 
  branch, 
  enabled = true,
  onOrderUpdate,
  onNewOrder,
  onItemUpdate
}) {
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectionAttempts, setReconnectionAttempts] = useState(0)
  const [showReconnecting, setShowReconnecting] = useState(false)
  
  const socketRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const disconnectTimerRef = useRef(null)
  const reconnectionAttemptsRef = useRef(0)

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setIsConnected(false)
    setShowReconnecting(false)
  }, [])

  // Connect to socket
  const connect = useCallback(() => {
    if (!enabled || !posProfile || !branch) {
      return
    }

    // Get socket from Frappe
    if (!window.frappe?.socketio) {
      console.warn('[Realtime] Frappe socket.io not available')
      return
    }

    try {
      const socket = window.frappe.socketio.socket
      socketRef.current = socket

      // Connection handlers
      socket.on('connect', () => {
        console.log('[Realtime] Connected to socket.io')
        setIsConnected(true)
        setReconnectionAttempts(0)
        setShowReconnecting(false)
        reconnectionAttemptsRef.current = 0
        
        // Clear disconnect timer
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current)
          disconnectTimerRef.current = null
        }

        // Subscribe to order events for this POS Profile
        socket.emit('doctype_subscribe', 'POS Invoice')
        socket.emit('doctype_subscribe', 'POS Order')
      })

      socket.on('disconnect', (reason) => {
        console.log('[Realtime] Disconnected:', reason)
        setIsConnected(false)
        
        // Start grace period timer before showing reconnecting message
        disconnectTimerRef.current = setTimeout(() => {
          setShowReconnecting(true)
        }, TIMING.REALTIME_GRACE_PERIOD || 3000)
      })

      socket.on('connect_error', (error) => {
        console.warn('[Realtime] Connection error:', error)
      })

      // Listen for order updates
      socket.on('doc_update', (data) => {
        if (!data || !data.doctype) return

        // Handle POS Invoice updates (payment status)
        if (data.doctype === 'POS Invoice' && data.name) {
          console.log('[Realtime] POS Invoice updated:', data.name)
          if (onOrderUpdate) {
            onOrderUpdate({
              type: 'invoice_update',
              name: data.name,
              data: data
            })
          }
        }

        // Handle POS Order updates
        if (data.doctype === 'POS Order') {
          // Check if it's for our POS Profile
          if (data.pos_profile === posProfile && data.branch === branch) {
            console.log('[Realtime] POS Order updated:', data.name)
            
            // New order notification
            if (data.status === 'Draft' && onNewOrder) {
              onNewOrder({
                name: data.name,
                data: data
              })
            }
            
            // Order update notification
            if (onOrderUpdate) {
              onOrderUpdate({
                type: 'order_update',
                name: data.name,
                data: data
              })
            }
          }
        }
      })

      // Listen for item updates within orders
      socket.on('item_update', (data) => {
        if (data && data.parent && onItemUpdate) {
          console.log('[Realtime] Item updated in order:', data.parent)
          onItemUpdate({
            orderName: data.parent,
            itemData: data
          })
        }
      })

      // Manual reconnection with exponential backoff
      socket.on('reconnect_attempt', (attemptNumber) => {
        reconnectionAttemptsRef.current = attemptNumber
        setReconnectionAttempts(attemptNumber)
        console.log(`[Realtime] Reconnection attempt ${attemptNumber}`)
      })

    } catch (error) {
      console.error('[Realtime] Failed to setup socket connection:', error)
    }
  }, [enabled, posProfile, branch, onOrderUpdate, onNewOrder, onItemUpdate])

  // Reconnect with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (!enabled) return

    const attempt = reconnectionAttemptsRef.current
    const maxAttempts = 10
    
    if (attempt >= maxAttempts) {
      console.warn('[Realtime] Max reconnection attempts reached')
      return
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
    const baseDelay = 1000
    const maxDelay = 32000
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
    
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1)
    const finalDelay = delay + jitter

    console.log(`[Realtime] Scheduling reconnect in ${Math.round(finalDelay)}ms (attempt ${attempt + 1})`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectionAttemptsRef.current++
      setReconnectionAttempts(reconnectionAttemptsRef.current)
      connect()
    }, finalDelay)
  }, [enabled, connect])

  // Manual reconnect function
  const reconnect = useCallback(() => {
    cleanup()
    reconnectionAttemptsRef.current = 0
    setReconnectionAttempts(0)
    connect()
  }, [cleanup, connect])

  // Initial connection
  useEffect(() => {
    if (enabled && posProfile && branch) {
      connect()
    }

    return cleanup
  }, [enabled, posProfile, branch, connect, cleanup])

  // Auto-reconnect on disconnect
  useEffect(() => {
    if (enabled && !isConnected && reconnectionAttempts === 0) {
      scheduleReconnect()
    }
  }, [enabled, isConnected, reconnectionAttempts, scheduleReconnect])

  return {
    isConnected,
    reconnectionAttempts,
    showReconnecting,
    reconnect,
    disconnect: cleanup
  }
}
