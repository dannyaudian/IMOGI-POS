import { useState, useEffect } from 'react'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { CustomerDisplayProvider } from './context/CustomerDisplayContext'
import { CustomerDisplayView } from './components/CustomerDisplayView'

function CustomerDisplayContent({ initialState }) {
  // STATE: Order and loading
  const [currentOrder, setCurrentOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  // EFFECT: Setup realtime listener
  useEffect(() => {
    if (window.frappe && window.frappe.realtime) {
      window.frappe.realtime.on('customer_display_update', (data) => {
        setCurrentOrder(data)
      })
    }
    setLoading(false)
  }, [])

  // RENDER: Display with provider
  return (
    <CustomerDisplayProvider
      currentOrder={currentOrder}
      loading={loading}
    >
      <CustomerDisplayView />
    </CustomerDisplayProvider>
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
