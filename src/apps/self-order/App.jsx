import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useItems } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

function SelfOrderContent({ initialState }) {
  const { user, loading: authLoading } = useAuth([]) // Guest allowed
  
  const branch = initialState.branch || 'Default'
  const posProfile = initialState.pos_profile || 'Self Order'
  const tableNumber = initialState.table_number || null
  
  const { data: items, error: itemsError, isLoading: itemsLoading } = useItems(branch, posProfile)

  if (authLoading) {
    return <LoadingSpinner message="Loading..." />
  }

  return (
    <div className="imogi-app" style={{ background: '#f8f9fa' }}>
      {/* Minimal header for self-order */}
      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '1rem',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Order from Your Table</h1>
        {tableNumber && <p style={{ margin: '0.5rem 0 0', opacity: 0.9 }}>Table: {tableNumber}</p>}
      </header>
      
      <main style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
        <Card title="Menu">
          {itemsLoading && <LoadingSpinner message="Loading menu..." />}
          {itemsError && <ErrorMessage error={itemsError} />}
          {items && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {items.slice(0, 10).map(item => (
                <div 
                  key={item.item_code}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <div>
                    <strong>{item.item_name}</strong>
                    {item.description && (
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: '#667eea', fontWeight: '600', fontSize: '1.125rem' }}>
                      ${item.rate || '0.00'}
                    </span>
                    <button className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'white',
          padding: '1rem',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'center',
          gap: '1rem'
        }}>
          <button className="btn-secondary">View Cart (0)</button>
          <button className="btn-success">Place Order</button>
        </div>
      </main>
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
