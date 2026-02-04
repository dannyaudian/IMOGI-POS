import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useTables } from '@/shared/api/imogi-api'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { TableDisplayProvider } from './context/TableDisplayContext'
import { TableDisplayHeader, TableGrid } from './components'

function TableDisplayContent({ initialState }) {
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
  } = usePOSProfileGuard({ requiresOpening: false, targetModule: 'imogi-tables' })

  // Fallback to initialState for backward compatibility
  const effectiveBranch = branch || initialState.branch || 'Default'

  // API: Fetch tables
  const shouldFetchTables = guardPassed && serverContextReady && posProfile
  const { data: tables, error, isLoading } = useTables(
    shouldFetchTables ? posProfile : null,
    shouldFetchTables ? effectiveBranch : null
  )

  // GUARD: Loading
  if (guardLoading) {
    return <LoadingSpinner message="Loading..." />
  }

  // GUARD: Guard check
  if (!guardPassed) {
    return <LoadingSpinner message="Checking operational context..." />
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

  // GUARD: Loading tables
  if (isLoading) {
    return <LoadingSpinner message="Loading table layout..." />
  }

  // GUARD: API error
  if (error) {
    return <ErrorMessage error={error} />
  }

  // RENDER: Table display with provider
  return (
    <div style={{
      minHeight: '100vh',
      background: '#1f2937',
      color: 'white',
      padding: '2rem'
    }}>
      <TableDisplayProvider
        branch={effectiveBranch}
        tables={tables}
        isLoading={isLoading}
        error={error}
      >
        <TableDisplayHeader />
        <TableGrid />
      </TableDisplayProvider>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <TableDisplayContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
