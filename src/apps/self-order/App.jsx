import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useItems } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { TIMING } from './constants'
import { SelfOrderProvider } from './context/SelfOrderContext'
import { SelfOrderHeader, SelfOrderMenu, SelfOrderActions } from './components'

function SelfOrderContent({ initialState }) {
  // GUARD: Authentication
  const { user, loading: authLoading } = useAuth(['Guest', 'Waiter', 'Branch Manager', 'System Manager'])

  // SETUP: Extract initial state
  const branch = initialState.branch || null
  const posProfile = initialState.pos_profile || null
  const tableNumber = initialState.table_number || null

  // API: Fetch items
  const { data: items, error: itemsError, isLoading: itemsLoading } = useItems(posProfile, branch)

  // GUARD: Loading
  if (authLoading) {
    return <LoadingSpinner message="Loading..." />
  }

  // GUARD: Profile required
  if (!posProfile) {
    return <ErrorMessage error="POS Profile selection required for self-order." />
  }

  // RENDER: Self-order view with provider
  return (
    <div className="imogi-app" style={{ background: '#f8f9fa' }}>
      <SelfOrderProvider
        tableNumber={tableNumber}
        items={items}
        itemsLoading={itemsLoading}
        itemsError={itemsError}
      >
        <SelfOrderHeader />

        <main style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
          <SelfOrderMenu />
        </main>

        <SelfOrderActions />
      </SelfOrderProvider>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <SelfOrderContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
