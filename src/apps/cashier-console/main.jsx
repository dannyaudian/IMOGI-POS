import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import '@/shared/styles/global.css'

// Get initial state from server
const initialState = window.__INITIAL_STATE__ || {}

// Mount React app (only if root element exists - for standalone mode)
const rootElement = document.getElementById('root')
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ImogiPOSProvider initialState={initialState}>
        <App initialState={initialState} />
      </ImogiPOSProvider>
    </React.StrictMode>
  )
}

// Expose mount/unmount functions for Desk page integration
window.imogiCashierMount = function(element, options = {}) {
  const state = options.initialState || window.__INITIAL_STATE__ || {}
  const root = ReactDOM.createRoot(element)
  root.render(
    <React.StrictMode>
      <ImogiPOSProvider initialState={state}>
        <App initialState={state} />
      </ImogiPOSProvider>
    </React.StrictMode>
  )
  element._reactRoot = root
  return root
}

window.imogiCashierUnmount = function(element) {
  if (element._reactRoot) {
    element._reactRoot.unmount()
    element._reactRoot = null
  }
}
