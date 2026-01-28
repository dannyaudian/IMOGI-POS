import React from 'react'
import ReactDOM from 'react-dom/client'
import { FrappeProvider } from 'frappe-react-sdk'
import App from './App'
import '@/shared/styles/global.css'

// Expose mount/unmount functions for Desk page integration
const MODULE_SELECT_ROOT_KEY = '__imogiModuleSelectRoot'

// Version stamp for debugging (updated: 2026-01-28)
window.__imogiModuleSelectMountVersion = 'phase2-scan-fix-20260128';
console.log('[module-select] Bundle loaded, mount version:', window.__imogiModuleSelectMountVersion);

window.imogiModuleSelectMount = function(element, options = {}) {
  console.count('[module-select] Mount function called');
  
  if (!(element instanceof HTMLElement)) {
    console.error('[module-select] Mount target must be an HTMLElement.', element)
    return null
  }

  const state = options.initialState || window.__INITIAL_STATE__ || {}

  if (!element[MODULE_SELECT_ROOT_KEY]) {
    console.log('[module-select] Creating new React root for element:', element);
    element[MODULE_SELECT_ROOT_KEY] = ReactDOM.createRoot(element)
  } else {
    console.log('[module-select] Reusing existing React root');
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

const mountDescriptor = Object.getOwnPropertyDescriptor(window, 'imogiModuleSelectMount')
if (!mountDescriptor || mountDescriptor.configurable) {
  Object.defineProperty(window, 'imogiModuleSelectMount', {
    configurable: false,
    writable: false,
    value: window.imogiModuleSelectMount
  })
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
