import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrderHistory } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

function CounterPOSContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Cashier', 'Branch Manager'])
  
  const branch = initialState.branch || 'Default'
  const posProfile = initialState.pos_profile || 'Default'
  const posMode = initialState.pos_mode || 'Counter'
  
  // Determine order type based on mode
  const orderType = posMode === 'Table' ? 'Dine In' : 'Counter'
  
  const { data: orders, error: ordersError, isLoading: ordersLoading } = useOrderHistory(branch, posProfile, orderType)

  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied'} />
  }

  // Mode indicator
  const modeLabel = posMode === 'Table' ? 'Table/Waiter Mode' : 'Counter Mode'
  const modeIcon = posMode === 'Table' ? '🍴' : '💵'
  
  return (
    <div className="imogi-app" data-pos-mode={posMode}>
      <AppHeader title={`Cashier Console - ${modeLabel}`} user={user} />
      
      <main className="imogi-main">
        <div className="mode-indicator" style={{ 
          padding: '0.5rem 1rem', 
          background: posMode === 'Table' ? '#e3f2fd' : '#fff3e0',
          borderRadius: '4px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>{modeIcon}</span>
          <strong>{modeLabel}</strong>
          <span style={{ marginLeft: 'auto', color: '#666' }}>Showing {orderType} orders only</span>
        </div>
        
        <div className="grid grid-2">
          <Card title="Recent Orders">
            {ordersLoading && <LoadingSpinner message="Loading orders..." />}
            {ordersError && <ErrorMessage error={ordersError} />}
            {orders && (
              <div>
                <p><strong>Total orders:</strong> {orders.length}</p>
                <p><strong>Branch:</strong> {branch}</p>
                <p><strong>Mode:</strong> {posMode}</p>
                <p><strong>Order Type Filter:</strong> {orderType}</p>
                {orders.length > 0 && orders[0].table_name && (
                  <p><strong>Table:</strong> {orders[0].table_name}</p>
                )}
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
            <li>✅ POS Mode detection ({posMode})</li>
            <li>✅ Order type filtering ({orderType})</li>
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
