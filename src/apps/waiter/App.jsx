import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useTables, useItems } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

function WaiterContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Waiter', 'Branch Manager'])
  
  const branch = initialState.branch || 'Default'
  const posProfile = initialState.pos_profile || 'Default'
  
  const { data: tables, error: tablesError, isLoading: tablesLoading } = useTables(branch)
  const { data: items, error: itemsError, isLoading: itemsLoading } = useItems(branch, posProfile)

  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied'} />
  }

  return (
    <div className="imogi-app">
      <AppHeader title="Waiter Order System" user={user} />
      
      <main className="imogi-main">
        <div className="grid grid-2">
          <Card title="Table Layout">
            {tablesLoading && <LoadingSpinner message="Loading tables..." />}
            {tablesError && <ErrorMessage error={tablesError} />}
            {tables && (
              <div>
                <p>Total tables: {tables.length}</p>
                <div className="grid grid-3" style={{ marginTop: '1rem' }}>
                  {tables.slice(0, 6).map(table => (
                    <div 
                      key={table.name} 
                      style={{
                        padding: '1rem',
                        border: '2px solid #e5e7eb',
                        borderRadius: '6px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: table.status === 'Occupied' ? '#fef3c7' : '#f0fdf4'
                      }}
                    >
                      <strong>{table.name}</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {table.status || 'Available'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
          
          <Card title="Menu Items">
            {itemsLoading && <LoadingSpinner message="Loading menu..." />}
            {itemsError && <ErrorMessage error={itemsError} />}
            {items && (
              <div>
                <p>Available items: {items.length}</p>
                <button className="btn-primary" style={{ marginTop: '1rem', width: '100%' }}>
                  View Full Menu
                </button>
              </div>
            )}
          </Card>
        </div>
        
        <Card title="Quick Actions" className="mt-4">
          <div className="flex">
            <button className="btn-primary">New Order</button>
            <button className="btn-secondary">View Orders</button>
            <button className="btn-secondary">Transfer Table</button>
            <button className="btn-secondary">Split Bill</button>
          </div>
        </Card>
      </main>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <WaiterContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
