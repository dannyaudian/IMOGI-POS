import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import '@/shared/styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ImogiPOSProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ImogiPOSProvider>
  </React.StrictMode>
)
