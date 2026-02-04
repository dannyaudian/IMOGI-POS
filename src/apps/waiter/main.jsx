import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import '@/shared/styles/global.css'

// Expose mount/unmount functions for Desk page integration
window.imogiWaiterMount = function(element, options = {}) {
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

window.imogiWaiterUnmount = function(element) {
  if (element._reactRoot) {
    element._reactRoot.unmount()
    element._reactRoot = null
  }
}
