import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import '@/shared/styles/global.css'

const initialState = window.__INITIAL_STATE__ || {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ImogiPOSProvider initialState={initialState}>
        <ErrorBoundary>
          <App initialState={initialState} />
        </ErrorBoundary>
      </ImogiPOSProvider>
  </React.StrictMode>
)
