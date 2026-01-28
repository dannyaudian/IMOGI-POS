import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useTables } from '@/shared/api/imogi-api'
import { useAuth } from '@/shared/hooks/useAuth'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'

function TableDisplayContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Waiter', 'Branch Manager', 'System Manager'])
  
  // POS Profile guard - table display doesn't require opening, just profile
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    branch,
    redirectToModuleSelect
  } = usePOSProfileGuard({ requiresOpening: false, targetModule: 'imogi-tables' })
  
  // Fallback to initialState for backward compatibility
  const effectiveBranch = branch || initialState.branch || 'Default'
  
  const { data: tables, error, isLoading } = useTables(effectiveBranch)

  if (authLoading || guardLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied - Waiter or Manager role required'} />
  }
  
  if (!guardPassed) {
    return <LoadingSpinner message="Checking operational context..." />
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading table layout..." />
  }

  if (error) {
    return <ErrorMessage error={error} />
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1f2937',
      color: 'white',
      padding: '2rem'
    }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', margin: 0 }}>Table Layout</h1>
        <p style={{ opacity: 0.8, marginTop: '0.5rem' }}>{branch}</p>
      </header>
      
      <main style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1.5rem',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {tables && tables.map(table => {
          const statusColors = {
            'Available': '#10b981',
            'Occupied': '#f59e0b',
            'Reserved': '#3b82f6',
            'Cleaning': '#6b7280'
          }
          
          const bgColor = statusColors[table.status] || '#6b7280'
          
          return (
            <div 
              key={table.name}
              style={{
                background: bgColor,
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s',
                cursor: 'pointer'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                {table.status === 'Available' ? '✓' : table.status === 'Occupied' ? '👥' : '⏰'}
              </div>
              <h2 style={{ fontSize: '1.75rem', margin: '0.5rem 0' }}>{table.name}</h2>
              <p style={{ opacity: 0.9, fontSize: '1.125rem' }}>{table.status}</p>
              {table.seating_capacity && (
                <p style={{ marginTop: '0.5rem', opacity: 0.8 }}>
                  Seats: {table.seating_capacity}
                </p>
              )}
            </div>
          )
        })}
      </main>
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
