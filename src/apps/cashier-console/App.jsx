import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrderHistory } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

function CounterPOSContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Cashier', 'Branch Manager'])
  
  const branch = initialState.branch || 'Default'
  const posProfile = initialState.pos_profile || 'Default'
  
  const { data: orders, error: ordersError, isLoading: ordersLoading } = useOrderHistory(branch, posProfile)

  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied'} />
  }

  return (
    <div className="imogi-app">
      <AppHeader title="Cashier Console" user={user} />
      
      <main className="imogi-main">
        <div className="grid grid-2">
          <Card title="Recent Orders">
            {ordersLoading && <LoadingSpinner message="Loading orders..." />}
            {ordersError && <ErrorMessage error={ordersError} />}
            {orders && (
              <div>
                <p>Total orders: {orders.length}</p>
                <p>Branch: {branch}</p>
                <p>POS Profile: {posProfile}</p>
              </div>
            )}
          </Card>
          
          <Card title="Quick Actions">
            <div className="flex" style={{ flexDirection: 'column', gap: '0.5rem' }}>
              <button className="btn-primary">New Order</button>
              <button className="btn-secondary">View Menu</button>
              <button className="btn-secondary">Customer List</button>
            </div>
          </Card>
        </div>
        
        <Card title="System Status" className="mt-4">
          <ul>
            <li>✅ React app successfully loaded</li>
            <li>✅ Session sharing with ERPNext</li>
            <li>✅ Shared API hooks functional</li>
            <li>✅ Authentication & role checking active</li>
            <li>⏳ Build complete order management UI</li>
          </ul>
        </Card>
      </main>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <CounterPOSContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
