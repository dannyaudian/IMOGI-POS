import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useItems, useCreateOrder } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

function KioskContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Guest']) // Kiosk allows guest
  
  const branch = initialState.branch || 'Default'
  const posProfile = initialState.pos_profile || 'Kiosk'
  const serviceType = initialState.service_type || 'Dine In'
  
  const { data: items, error: itemsError, isLoading: itemsLoading } = useItems(branch, posProfile)

  if (authLoading) {
    return <LoadingSpinner message="Loading..." />
  }

  return (
    <div className="imogi-app">
      <AppHeader title={`Self-Service Kiosk - ${serviceType}`} user="Guest" />
      
      <main className="imogi-main">
        <Card title="Welcome! Select your items">
          {itemsLoading && <LoadingSpinner message="Loading menu..." />}
          {itemsError && <ErrorMessage error={itemsError} />}
          {items && (
            <div className="grid grid-4">
              {items.slice(0, 12).map(item => (
                <div 
                  key={item.item_code}
                  style={{
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = '#667eea'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍽️</div>
                  <strong>{item.item_name}</strong>
                  <div style={{ marginTop: '0.5rem', color: '#667eea', fontSize: '1.125rem' }}>
                    ${item.rate || '0.00'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        
        <div className="flex" style={{ marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button className="btn-secondary">View Cart</button>
          <button className="btn-primary">Proceed to Checkout</button>
        </div>
      </main>
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
