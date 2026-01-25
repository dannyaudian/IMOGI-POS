import { FrappeProvider } from 'frappe-react-sdk'
import { useState } from 'react'

function App({ initialState }) {
  const [orders, setOrders] = useState([])

  // Get Frappe site URL from window location
  const frappeUrl = window.location.origin

  return (
    <FrappeProvider
      url={frappeUrl}
      tokenParams={{
        useToken: false, // Use cookie-based auth (same domain)
        type: 'Bearer'
      }}
    >
      <div className="counter-pos-app">
        <header className="pos-header">
          <h1>Cashier Console (React)</h1>
          <p>User: {initialState.user}</p>
        </header>
        
        <main className="pos-main">
          <div className="pos-container">
            <h2>Welcome to React-powered IMOGI POS</h2>
            <p>This is a prototype Counter POS built with React and frappe-react-sdk.</p>
            
            <div className="getting-started">
              <h3>Next Steps:</h3>
              <ul>
                <li>✅ React app successfully loaded</li>
                <li>✅ Session sharing with ERPNext</li>
                <li>⏳ Build order management UI</li>
                <li>⏳ Integrate with IMOGI POS API</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </FrappeProvider>
  )
}

export default App
