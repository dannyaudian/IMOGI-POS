import { useEffect } from 'react'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useItems } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { TIMING } from './constants'
import { KioskProvider } from './context/KioskContext'
import { KioskMenu, KioskActions, VariantPickerModal } from './components'

function KioskContent({ initialState }) {
  // GUARD: Authentication
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Guest', 'Waiter', 'Branch Manager', 'System Manager'])

  // GUARD: POS Profile
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    profileData,
    branch,
    serverContextReady,
    serverContextError,
    retryServerContext
  } = usePOSProfileGuard({ requiresOpening: false, autoRedirect: false })

  // SETUP: Effective values with fallback
  const effectiveBranch = branch || initialState.branch || null
  const effectivePosProfile = posProfile || initialState.pos_profile || null
  const serviceType = initialState.service_type || 'Dine In'

  // API: Fetch items
  const shouldFetchItems = guardPassed && serverContextReady && effectivePosProfile
  const { data: items, error: itemsError, isLoading: itemsLoading } = useItems(
    shouldFetchItems ? effectivePosProfile : null,
    shouldFetchItems ? effectiveBranch : null
  )

  // EFFECT: Guard check with redirect
  useEffect(() => {
    if (!guardLoading && !authLoading && !effectivePosProfile) {
      const timeout = setTimeout(() => {
        console.error('POS Profile required for kiosk - redirecting to module select')
        window.location.href = '/app/imogi-module-select'
      }, TIMING.TOAST_DURATION)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, authLoading, effectivePosProfile])

  // GUARD: Loading
  if (authLoading || guardLoading) {
    return <LoadingSpinner message="Loading..." />
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

  // RENDER: Kiosk display with provider
  return (
    <div className="imogi-app" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppHeader title={`Self-Service Kiosk - ${serviceType}`} user="Guest" />

      <KioskProvider
        serviceType={serviceType}
        items={items}
        itemsLoading={itemsLoading}
        itemsError={itemsError}
      >
        <main className="imogi-main" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 0 }}>
          <KioskMenu />
          <KioskActions />
        </main>
        <VariantPickerModal />
      </KioskProvider>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <KioskContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
