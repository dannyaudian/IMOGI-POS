import React from 'react'
import ReactDOM from 'react-dom/client'
import { FrappeProvider } from 'frappe-react-sdk'
import App from './App'
import '@/shared/styles/global.css'

// Get initial state from server
const initialState = window.__INITIAL_STATE__ || {}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FrappeProvider
      url={window.location.origin}
      tokenParams={{ useToken: false, type: 'Bearer' }}
    >
      <App initialState={initialState} />
    </FrappeProvider>
  </React.StrictMode>
)

// Expose mount/unmount functions for Desk page integration
window.imogiModuleSelectMount = function(element, options = {}) {
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
  if (element._reactRoot) {
    element._reactRoot.unmount()
    element._reactRoot = null
  }
}
