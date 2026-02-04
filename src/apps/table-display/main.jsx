import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@/shared/styles/global.css'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'

// Expose mount/unmount functions for Desk page integration
window.imogiTablesMount = function(element, options = {}) {
  const state = options.initialState || window.__INITIAL_STATE__ || {}
  const root = ReactDOM.createRoot(element)
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
   <App initialState={state} />
 </ErrorBoundary>
    </React.StrictMode>
  )
  element._reactRoot = root
  return root
}

window.imogiTablesUnmount = function(element) {
  if (element._reactRoot) {
    element._reactRoot.unmount()
    element._reactRoot = null
  }
}
