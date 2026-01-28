import { useEffect } from 'react'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useItems, useCreateOrder } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

function KioskContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Guest', 'Waiter', 'Branch Manager', 'System Manager']) // Allow Guest and staff
  
  // POS Profile guard - kiosk doesn't require opening, just profile
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    profileData,
    branch
  } = usePOSProfileGuard({ requiresOpening: false, autoRedirect: false })
  
  // Fallback to initialState for backward compatibility
  const effectiveBranch = branch || initialState.branch || null
  const effectivePosProfile = posProfile || initialState.pos_profile || null
  const serviceType = initialState.service_type || 'Dine In'
  
  const { data: items, error: itemsError, isLoading: itemsLoading } = useItems(effectivePosProfile, effectiveBranch)

  // Guard check: redirect to module-select if no profile after loading
  useEffect(() => {
    if (!guardLoading && !authLoading && !effectivePosProfile) {
      const timeout = setTimeout(() => {
        console.error('POS Profile required for kiosk - redirecting to module select')
        window.location.href = '/app/imogi-module-select'
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, authLoading, effectivePosProfile])

  if (authLoading || guardLoading) {
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
