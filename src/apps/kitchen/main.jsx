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

// Expose mount/unmount functions for Desk page integration
window.imogiKitchenMount = function(element, options = {}) {
  const state = options.initialState || window.__INITIAL_STATE__ || {}
  const root = ReactDOM.createRoot(element)
  root.render(
    <React.StrictMode>
      <ImogiPOSProvider initialState={state}>
        <ErrorBoundary>
          <App initialState={state} />
        </ErrorBoundary>
      </ImogiPOSProvider>
    </React.StrictMode>
  )
  element._reactRoot = root
  return root
}

window.imogiKitchenUnmount = function(element) {
  if (element._reactRoot) {
    element._reactRoot.unmount()
    element._reactRoot = null
  }
}
