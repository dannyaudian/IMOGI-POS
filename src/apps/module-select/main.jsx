import React from 'react'
import ReactDOM from 'react-dom/client'
import { FrappeProvider } from 'frappe-react-sdk'
import App from './App'
import '@/shared/styles/global.css'

// Expose mount/unmount functions for Desk page integration
const MODULE_SELECT_ROOT_KEY = '__imogiModuleSelectRoot'

window.imogiModuleSelectMount = function(element, options = {}) {
  if (!(element instanceof HTMLElement)) {
    console.error('[module-select] Mount target must be an HTMLElement.', element)
    return null
  }

  const state = options.initialState || window.__INITIAL_STATE__ || {}

  if (!element[MODULE_SELECT_ROOT_KEY]) {
    element[MODULE_SELECT_ROOT_KEY] = ReactDOM.createRoot(element)
  }

  element[MODULE_SELECT_ROOT_KEY].render(
    <React.StrictMode>
      <FrappeProvider
        url={window.location.origin}
        tokenParams={{ useToken: false, type: 'Bearer' }}
      >
        <App initialState={state} />
      </FrappeProvider>
    </React.StrictMode>
  )
  return element[MODULE_SELECT_ROOT_KEY]
}

window.imogiModuleSelectUnmount = function(element) {
  if (!(element instanceof HTMLElement)) {
    console.error('[module-select] Unmount target must be an HTMLElement.', element)
    return
  }

  if (element[MODULE_SELECT_ROOT_KEY]) {
    element[MODULE_SELECT_ROOT_KEY].unmount()
    element[MODULE_SELECT_ROOT_KEY] = null
  }
}
