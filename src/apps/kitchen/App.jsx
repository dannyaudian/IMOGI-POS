import { useState, useCallback, useEffect } from 'react'
import { ImogiPOSProvider, useImogiPOS } from '@/shared/providers/ImogiPOSProvider'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useKOTList } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { KitchenProvider } from './context/KitchenContext'
import { KitchenHeader, KitchenFilterBar, KOTBoard } from './components'
import { useKOTRealtime, useNotificationSound, useKOTState } from './hooks'
import { groupKOTsByState, getStationsFromKOTs } from './utils'
import './kitchen.css'

function KitchenContent({ initialState }) {
  // GUARD: POS Profile validation
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    branch,
    redirectToModuleSelect,
    serverContextReady,
    serverContextError,
    retryServerContext
  } = usePOSProfileGuard({ requiresOpening: false, targetModule: 'imogi-kitchen' })

  // Get user from ImogiPOS context
  const { user } = useImogiPOS()

  // EFFECT: Guard timeout redirect
  useEffect(() => {
    if (!guardLoading && !guardPassed) {
      const timeout = setTimeout(() => {
        console.error('POS Profile guard failed - redirecting to module select')
        window.location.href = '/app/imogi-module-select'
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, guardPassed])

  // Fallback to initialState for backward compatibility
  const kitchen = initialState.kitchen || 'Main Kitchen'
  const defaultStation = initialState.station || null

  // STATE: Filter & display controls
  const [selectedStation, setSelectedStation] = useState(defaultStation)
  const [showCompleted, setShowCompleted] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  // API: Fetch KOT list with auto-refresh
  const { data: kotList, error: kotError, isLoading: kotLoading, mutate } = useKOTList(kitchen, selectedStation)

  // BUSINESS LOGIC: KOT state management
  const {
    loading: stateLoading,
    error: stateError,
    startPreparing,
    markReady,
    markServed,
    returnToQueue,
    returnToKitchen,
    cancelKOT
  } = useKOTState(() => {
    mutate()
  })

  const playSound = useNotificationSound()

  // EFFECT: Realtime event handler
  const handleRealtimeEvent = useCallback((event) => {
    console.log('Realtime KOT event:', event.type)

    // Play sound for new KOTs
    if (event.type === 'kot_created') {
      playSound('new_kot')
    }

    // Refresh data
    mutate()
    setLastUpdate(new Date())
  }, [mutate, playSound])

  // EFFECT: Subscribe to realtime updates
  useKOTRealtime(kitchen, selectedStation, handleRealtimeEvent)

  // Compute grouped KOTs and available stations
  const groupedKOTs = groupKOTsByState(kotList || [])
  const availableStations = getStationsFromKOTs(kotList || [])

  // GUARD: Show loading while checking authentication
  if (guardLoading) {
    return <LoadingSpinner message="Loading Kitchen Display..." />
  }

  // GUARD: Server context error
  if (serverContextError) {
    return (
      <ErrorMessage
        error={serverContextError?.message || 'Failed to sync operational context.'}
        onRetry={() => retryServerContext && retryServerContext()}
      />
    )
  }

  // GUARD: Wait for guard to pass
  if (!guardPassed) {
    return <LoadingSpinner message="Verifying access..." />
  }

  // RENDER: Kitchen display with context provider
  return (
    <div className="kitchen-app">
      <AppHeader title="Kitchen Display System" user={user} />

      <KitchenProvider
        kotList={kotList}
        selectedStation={selectedStation}
        setSelectedStation={setSelectedStation}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        lastUpdate={lastUpdate}
        setLastUpdate={setLastUpdate}
        groupedKOTs={groupedKOTs}
        availableStations={availableStations}
        startPreparing={startPreparing}
        markReady={markReady}
        markServed={markServed}
        returnToQueue={returnToQueue}
        returnToKitchen={returnToKitchen}
        cancelKOT={cancelKOT}
        stateLoading={stateLoading}
        stateError={stateError}
        playSound={playSound}
        handleRealtimeEvent={handleRealtimeEvent}
      >
        <KitchenHeader kitchen={kitchen} user={user} />
        <KitchenFilterBar />

        <main className="kitchen-main">
          {kotLoading && <LoadingSpinner message="Loading kitchen orders..." />}
          {kotError && <ErrorMessage error={kotError} />}

          {stateError && (
            <div className="error-banner">
              <ErrorMessage error={stateError} />
            </div>
          )}

          {!kotLoading && !kotError && (
            <KOTBoard />
          )}
        </main>
      </KitchenProvider>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <KitchenContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
