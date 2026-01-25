import React from 'react'
import ReactDOM from 'react-dom/client'
import { FrappeProvider } from 'frappe-react-sdk'
import App from './App'

// Get site name from window
const getSiteName = () => {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname.startsWith('127.0.0.1')) {
    return window.location.hostname
  }
  return hostname
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FrappeProvider siteName={getSiteName()}>
      <App />
    </FrappeProvider>
  </React.StrictMode>
)
