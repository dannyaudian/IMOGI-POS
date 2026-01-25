import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useKOTList, useUpdateKOTStatus } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'

function KitchenContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Kitchen Staff', 'Branch Manager'])
  
  const branch = initialState.branch || 'Default'
  
  const { data: kotList, error: kotError, isLoading: kotLoading, mutate } = useKOTList(branch, 'Pending')
  const { call: updateKOTStatus, loading: updating } = useUpdateKOTStatus()

  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied'} />
  }

  const handleStatusUpdate = async (kotName, newStatus) => {
    try {
      await updateKOTStatus({ kot_name: kotName, status: newStatus })
      mutate() // Refresh KOT list
    } catch (error) {
      console.error('Failed to update KOT:', error)
    }
  }

  return (
    <div className="imogi-app">
      <AppHeader title="Kitchen Display System" user={user} />
      
      <main className="imogi-main">
        <Card title="Kitchen Orders (KOT)">
          {kotLoading && <LoadingSpinner message="Loading kitchen orders..." />}
          {kotError && <ErrorMessage error={kotError} />}
          {kotList && kotList.length === 0 && (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              No pending orders
            </p>
          )}
          {kotList && kotList.length > 0 && (
            <div className="grid grid-3">
              {kotList.map(kot => (
                <Card key={kot.name} title={`KOT: ${kot.name}`}>
                  <p><strong>Table:</strong> {kot.table_name || 'Counter'}</p>
                  <p><strong>Order Time:</strong> {new Date(kot.creation).toLocaleTimeString()}</p>
                  <p><strong>Items:</strong> {kot.items?.length || 0}</p>
                  <div className="flex" style={{ marginTop: '1rem', gap: '0.5rem' }}>
                    <button 
                      className="btn-success"
                      onClick={() => handleStatusUpdate(kot.name, 'In Progress')}
                      disabled={updating}
                    >
                      Start
                    </button>
                    <button 
                      className="btn-primary"
                      onClick={() => handleStatusUpdate(kot.name, 'Completed')}
                      disabled={updating}
                    >
                      Complete
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
        
        <Card title="System Info" className="mt-4">
          <ul>
            <li>✅ Kitchen Display React app loaded</li>
            <li>✅ Auto-refresh every 5 seconds</li>
            <li>✅ Real-time KOT status updates</li>
            <li>Branch: {branch}</li>
          </ul>
        </Card>
      </main>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <KitchenContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
