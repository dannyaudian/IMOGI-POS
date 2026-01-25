import { useEffect, useCallback, useRef } from 'react'

/**
 * Hook for KOT realtime updates via socket.io
 * @param {string} kitchen - Kitchen name
 * @param {string} station - Station name (optional)
 * @param {Function} onEvent - Event handler callback
 */
export function useKOTRealtime(kitchen, station, onEvent) {
  const eventHandlerRef = useRef(onEvent)

  // Update ref when handler changes
  useEffect(() => {
    eventHandlerRef.current = onEvent
  }, [onEvent])

  // Memoized event handler
  const handleEvent = useCallback((data) => {
    if (eventHandlerRef.current) {
      eventHandlerRef.current({
        type: data.event_type,
        kot: data.kot,
        items: data.items,
        timestamp: data.timestamp
      })
    }
  }, [])

  useEffect(() => {
    // Check if frappe realtime is available
    if (!window.frappe?.realtime) {
      console.warn('Frappe realtime not available')
      return
    }

    // Subscribe to kitchen channel
    const kitchenChannel = `kitchen:${kitchen}`
    const stationChannel = station ? `station:${station}` : null

    console.log(`Subscribing to kitchen updates: ${kitchenChannel}`)
    window.frappe.realtime.on(kitchenChannel, handleEvent)

    if (stationChannel) {
      console.log(`Subscribing to station updates: ${stationChannel}`)
      window.frappe.realtime.on(stationChannel, handleEvent)
    }

    // Cleanup on unmount
    return () => {
      console.log(`Unsubscribing from kitchen updates: ${kitchenChannel}`)
      window.frappe.realtime.off(kitchenChannel, handleEvent)

      if (stationChannel) {
        console.log(`Unsubscribing from station updates: ${stationChannel}`)
        window.frappe.realtime.off(stationChannel, handleEvent)
      }
    }
  }, [kitchen, station, handleEvent])

  return null
}

/**
 * Hook for playing notification sounds
 * @returns {Function} playSound function
 */
export function useNotificationSound() {
  const audioRef = useRef(null)

  useEffect(() => {
    // Create audio element for notifications
    audioRef.current = new Audio('/assets/imogi_pos/sounds/notification.mp3')
    audioRef.current.volume = 0.5
  }, [])

  const playSound = useCallback((soundType = 'new_kot') => {
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(err => {
          console.warn('Failed to play notification sound:', err)
        })
      }
    } catch (error) {
      console.warn('Error playing sound:', error)
    }
  }, [])

  return playSound
}
