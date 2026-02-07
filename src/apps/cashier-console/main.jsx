import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import '@/shared/styles/global.css'

/**
 * CRITICAL FIX: Safe initializer pattern to prevent TDZ violations
 * 
 * This function ensures all imports and side effects are properly
 * initialized BEFORE any React component lifecycle begins.
 * 
 * Prevents: ReferenceError: Cannot access 'X' before initialization
 */
function initCashierConsole() {
  // Get initial state from server
  const initialState = window.__INITIAL_STATE__ || {}
  
  // Return initialState for use below
  return initialState
}

// Initialize (safe, no side effects at module level)
const initialState = initCashierConsole()

// Mount React app (only if root element exists - for standalone mode)
const rootElement = document.getElementById('root')
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ImogiPOSProvider initialState={initialState}>
        <ErrorBoundary>
          <App initialState={initialState} />
        </ErrorBoundary>
      </ImogiPOSProvider>
    </React.StrictMode>
  )
}

/**
 * Bulletproof React mount - ALWAYS creates fresh instance
 * Production-safe with developer mode logging
 */
window.imogiCashierMount = function(element, options = {}) {
  const state = options.initialState || window.__INITIAL_STATE__ || {}
  
  // STEP 1: Unmount element-scoped root
  if (element._reactRoot) {
    try {
      element._reactRoot.unmount()
    } catch (err) {
      console.error('[Cashier Mount] Unmount error:', err)
    }
    element._reactRoot = null
    element._reactMountKey = null
    element._reactMountTimestamp = null
  }
  
  // STEP 2: Unmount window-scoped root
  if (window.__IMOGI_POS_CASHIER_ROOT) {
    try {
      window.__IMOGI_POS_CASHIER_ROOT.unmount()
    } catch (err) {
      console.error('[Cashier Mount] Unmount error:', err)
    }
    delete window.__IMOGI_POS_CASHIER_ROOT
  }
  
  // STEP 3: Clear mounted flags
  if (window.__IMOGI_POS_CASHIER_MOUNTED) {
    delete window.__IMOGI_POS_CASHIER_MOUNTED
  }
  if (window.__IMOGI_POS_CASHIER_MOUNT_KEY) {
    delete window.__IMOGI_POS_CASHIER_MOUNT_KEY
  }
  
  // STEP 4: Clear container DOM
  if (element.innerHTML) {
    element.innerHTML = ''
  }
  
  // STEP 5: Clear all global state
  const globalStateKeys = [
    '__IMOGI_POS_CASHIER_STATE__',
    '__IMOGI_POS_CASHIER_STORE__',
    '__IMOGI_POS_CASHIER_CONTEXT__'
  ]
  
  globalStateKeys.forEach(key => {
    if (window[key]) {
      delete window[key]
    }
  })
  
  // Generate unique mount key
  const mountKey = `cashier-mount-${Date.now()}`
  
  // Create completely new React root
  const root = ReactDOM.createRoot(element)
  
  // Render app with StrictMode in dev
  const isDev = typeof frappe !== 'undefined' && (frappe?.boot?.developer_mode || window.location.hostname === 'localhost')
  const app = (
    <ImogiPOSProvider initialState={state} key={mountKey}>
        <ErrorBoundary>
          <App initialState={state} />
        </ErrorBoundary>
      </ImogiPOSProvider>
  )
  
  root.render(
    isDev ? <React.StrictMode>{app}</React.StrictMode> : app
  )
  
  // Store references for cleanup
  element._reactRoot = root
  element._reactMountKey = mountKey
  element._reactMountTimestamp = Date.now()
  
  window.__IMOGI_POS_CASHIER_ROOT = root
  window.__IMOGI_POS_CASHIER_MOUNTED = true
  window.__IMOGI_POS_CASHIER_MOUNT_KEY = mountKey
  
  return root
}

/**
 * Bulletproof React unmount - safe to call multiple times
 * Clears all global state and DOM references
 */
window.imogiCashierUnmount = function(element) {
  // CLEANUP 1: Unmount element-scoped root
  if (element?._reactRoot) {
    try {
      element._reactRoot.unmount()
    } catch (err) {
      console.error('[Cashier Unmount] Error:', err)
    }
    element._reactRoot = null
    element._reactMountKey = null
    element._reactMountTimestamp = null
  }
  
  // CLEANUP 2: Unmount window-scoped root
  if (window.__IMOGI_POS_CASHIER_ROOT) {
    try {
      window.__IMOGI_POS_CASHIER_ROOT.unmount()
    } catch (err) {
      console.error('[Cashier Unmount] Error:', err)
    }
    delete window.__IMOGI_POS_CASHIER_ROOT
  }
  
  // CLEANUP 3: Clear mounted flags
  if (window.__IMOGI_POS_CASHIER_MOUNTED) {
    delete window.__IMOGI_POS_CASHIER_MOUNTED
  }
  if (window.__IMOGI_POS_CASHIER_MOUNT_KEY) {
    delete window.__IMOGI_POS_CASHIER_MOUNT_KEY
  }
  
  // CLEANUP 4: Clear container DOM
  if (element?.innerHTML) {
    element.innerHTML = ''
  }
  
  // CLEANUP 5: Clear all global state
  const globalStateKeys = [
    '__IMOGI_POS_CASHIER_STATE__',
    '__IMOGI_POS_CASHIER_STORE__',
    '__IMOGI_POS_CASHIER_CONTEXT__',
    '__INITIAL_STATE__'
  ]
  
  globalStateKeys.forEach(key => {
    if (window[key]) {
      delete window[key]
    }
  })
}
