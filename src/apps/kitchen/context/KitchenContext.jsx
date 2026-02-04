import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const KitchenContext = createContext(null)

export function KitchenProvider({
  children,
  kotList = [],
  selectedStation,
  setSelectedStation,
  showCompleted,
  setShowCompleted,
  lastUpdate,
  setLastUpdate,
  groupedKOTs = { queued: [], preparing: [], ready: [] },
  availableStations = [],
  startPreparing,
  markReady,
  markServed,
  returnToQueue,
  returnToKitchen,
  cancelKOT,
  stateLoading = false,
  stateError = null,
  playSound,
  handleRealtimeEvent
}) {
  // Action handler - central point for all KOT actions
  const handleAction = useCallback(async (action, kotName, reason = null) => {
    try {
      switch (action) {
        case 'start':
          await startPreparing(kotName)
          break
        case 'ready':
          await markReady(kotName)
          break
        case 'served':
          await markServed(kotName)
          break
        case 'return_queue':
          await returnToQueue(kotName)
          break
        case 'return_kitchen':
          await returnToKitchen(kotName)
          break
        case 'cancel':
          await cancelKOT(kotName, reason)
          break
        default:
          console.warn('Unknown action:', action)
      }
    } catch (error) {
      console.error('Action failed:', error)
      throw error
    }
  }, [startPreparing, markReady, markServed, returnToQueue, returnToKitchen, cancelKOT])

  // Memoize context value
  const value = useMemo(() => ({
    // State
    kotList,
    selectedStation,
    setSelectedStation,
    showCompleted,
    setShowCompleted,
    lastUpdate,
    setLastUpdate,

    // Computed
    groupedKOTs,
    availableStations,
    activeCount: kotList?.length || 0,

    // Actions
    handleAction,
    stateLoading,
    stateError,
    playSound,
    handleRealtimeEvent
  }), [
    kotList,
    selectedStation,
    setSelectedStation,
    showCompleted,
    setShowCompleted,
    lastUpdate,
    setLastUpdate,
    groupedKOTs,
    availableStations,
    handleAction,
    stateLoading,
    stateError,
    playSound,
    handleRealtimeEvent
  ])

  return (
    <KitchenContext.Provider value={value}>
      {children}
    </KitchenContext.Provider>
  )
}

export function useKitchenContext() {
  const context = useContext(KitchenContext)
  if (!context) {
    throw new Error('useKitchenContext must be used within KitchenProvider')
  }
  return context
}
