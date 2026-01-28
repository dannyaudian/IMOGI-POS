import React from 'react'
import ReactDOM from 'react-dom/client'
import { FrappeProvider } from 'frappe-react-sdk'
import App from './App'
import '@/shared/styles/global.css'

// Expose mount/unmount functions for Desk page integration
window.imogiModuleSelectMount = function(element, options = {}) {
  if (!(element instanceof HTMLElement)) {
    console.error('[module-select] Mount target must be an HTMLElement.', element)
    return null
  }

  const state = options.initialState || window.__INITIAL_STATE__ || {}
  const root = ReactDOM.createRoot(element)
  root.render(
    <React.StrictMode>
      <FrappeProvider
        url={window.location.origin}
        tokenParams={{ useToken: false, type: 'Bearer' }}
      >
        <App initialState={state} />
      </FrappeProvider>
    </React.StrictMode>
  )
  element._reactRoot = root
  return root
}

window.imogiModuleSelectUnmount = function(element) {
  if (!(element instanceof HTMLElement)) {
    console.error('[module-select] Unmount target must be an HTMLElement.', element)
    return
  }

  if (element._reactRoot) {
    element._reactRoot.unmount()
    element._reactRoot = null
  }
}
