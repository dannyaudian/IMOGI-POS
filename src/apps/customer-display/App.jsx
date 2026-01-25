import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { LoadingSpinner } from '@/shared/components/UI'
import { useState, useEffect } from 'react'

function CustomerDisplayContent({ initialState }) {
  const [currentOrder, setCurrentOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Listen for realtime updates from cashier
    if (window.frappe && window.frappe.realtime) {
      window.frappe.realtime.on('customer_display_update', (data) => {
        setCurrentOrder(data)
      })
    }
    setLoading(false)
  }, [])

  if (loading) {
    return <LoadingSpinner message="Connecting to cashier..." />
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '800px', width: '100%' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>Welcome!</h1>
        
        {!currentOrder ? (
          <div style={{ fontSize: '1.5rem', opacity: 0.9 }}>
            <p>Your order will be displayed here</p>
          </div>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'left'
          }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>Current Order</h2>
            
            {currentOrder.items && currentOrder.items.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '1rem 0',
                borderBottom: '1px solid rgba(255,255,255,0.2)',
                fontSize: '1.25rem'
              }}>
                <div>
                  <strong>{item.item_name}</strong>
                  <span style={{ marginLeft: '1rem', opacity: 0.8 }}>x{item.qty}</span>
                </div>
                <div>${(item.rate * item.qty).toFixed(2)}</div>
              </div>
            ))}
            
            <div style={{
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '2px solid rgba(255,255,255,0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '2rem',
              fontWeight: 'bold'
            }}>
              <span>Total:</span>
              <span>${currentOrder.total?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <CustomerDisplayContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
