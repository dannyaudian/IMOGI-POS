import { useState, useCallback } from 'react'
import { ImogiPOSProvider, useImogiPOS } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useKOTList } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { KitchenHeader, FilterControls, KOTColumn } from './components'
import { useKOTRealtime, useNotificationSound, useKOTState } from './hooks'
import { groupKOTsByState, getStationsFromKOTs } from './utils'
import './kitchen.css'

function KitchenContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Kitchen Staff', 'Branch Manager', 'System Manager'])
  
  // POS Profile guard - kitchen doesn't require opening, just profile
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    branch,
    redirectToModuleSelect
  } = usePOSProfileGuard({ requiresOpening: false })
  
  // Fallback to initialState for backward compatibility
  const kitchen = initialState.kitchen || 'Main Kitchen'
  const defaultStation = initialState.station || null
  
  const [selectedStation, setSelectedStation] = useState(defaultStation)
  const [showCompleted, setShowCompleted] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  
  // Fetch KOT list with auto-refresh
  const { data: kotList, error: kotError, isLoading: kotLoading, mutate } = useKOTList(kitchen, selectedStation)
  
  // KOT state management
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
    // Refresh data after state change
    mutate()
  })

  const playSound = useNotificationSound()

  // Handle realtime events
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

  // Subscribe to realtime updates
  useKOTRealtime(kitchen, selectedStation, handleRealtimeEvent)

  // Guard timeout: redirect to module-select if guard doesn't pass within 10 seconds
  useEffect(() => {
    if (!guardLoading && !authLoading && !guardPassed) {
      const timeout = setTimeout(() => {
        console.error('POS Profile guard failed - redirecting to module select')
        window.location.href = '/shared/module-select'
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, authLoading, guardPassed])

  // Show loading while checking auth and guard
  if (authLoading || guardLoading) {
    return <LoadingSpinner message="Loading Kitchen Display..." />
  }
  
  // Wait for guard to pass
  if (!guardPassed) {
    return <LoadingSpinner message="Verifying access..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied'} />
  }

  // Group KOTs by workflow state
  const groupedKOTs = groupKOTsByState(kotList || [])
  const availableStations = getStationsFromKOTs(kotList || [])

  // Action handlers
  const handleAction = async (action, kotName, reason = null) => {
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
      // Error is already set in useKOTState hook
    }
  }

  return (
    <div className="kitchen-app">
      <AppHeader title="Kitchen Display System" user={user} />
      
      <KitchenHeader 
        kitchen={kitchen}
        station={selectedStation}
        activeCount={kotList?.length || 0}
        user={user}
      />

      <FilterControls
        stations={availableStations}
        selectedStation={selectedStation}
        onStationChange={setSelectedStation}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
        lastUpdate={lastUpdate}
      />

      {stateError && (
        <div className="error-banner">
          <ErrorMessage error={stateError} />
        </div>
      )}
      
      <main className="kitchen-main">
        {kotLoading && <LoadingSpinner message="Loading kitchen orders..." />}
        {kotError && <ErrorMessage error={kotError} />}
        
        {!kotLoading && !kotError && (
          <div className="kitchen-columns">
            <KOTColumn
              title="Queued"
              state="queued"
              kots={groupedKOTs.queued}
              onAction={handleAction}
              loading={stateLoading}
            />
            <KOTColumn
              title="In Progress"
              state="preparing"
              kots={groupedKOTs.preparing}
              onAction={handleAction}
              loading={stateLoading}
            />
            <KOTColumn
              title="Ready"
              state="ready"
              kots={groupedKOTs.ready}
              onAction={handleAction}
              loading={stateLoading}
            />
          </div>
        )}
      </main>
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
