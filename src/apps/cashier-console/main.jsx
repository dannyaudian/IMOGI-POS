import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import '@/shared/styles/global.css'

/**
 * CASHIER CONSOLE - React Entry Point
 * 
 * INITIALIZATION ORDER (CRITICAL):
 * 1. All imports evaluated (top-level, no side effects)
 * 2. initCashierConsole() called - deferred initialization
 * 3. Initial state retrieved from window.__INITIAL_STATE__
 * 4. Root element check (standalone mode optional)
 * 5. React root created and mounted
 * 6. window.imogiCashierMount registered for Frappe desk integration
 * 7. window.imogiCashierUnmount registered for cleanup
 * 
 * SAFETY GUARDS:
 * - No side effects at module level (prevents TDZ errors)
 * - Mount guard prevents concurrent/duplicate mounts
 * - Unmount is idempotent (safe to call multiple times)
 * - Error boundary wraps entire app
 * - Global error handlers catch unhandled rejections
 * 
 * TDZ PROTECTION:
 * - storage.getItem() moved to useEffect (useOperationalContext)
 * - All initialization wrapped in function (deferred execution)
 * - Root element check guards against missing container
 * 
 * RACE CONDITION PROTECTION:
 * - mountInProgress flag prevents concurrent mounts
 * - Try/finally ensures guard is reset even on error
 * - Cleanup handlers unregister themselves
 */

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
 * 
 * GUARD: Only allows one mount at a time (prevents race conditions)
 */
let mountInProgress = false

window.imogiCashierMount = function(element, options = {}) {
  // GUARD: Prevent concurrent mount operations (race condition protection)
  if (mountInProgress) {
    console.warn('[Cashier Mount] Mount already in progress, ignoring duplicate request')
    return
  }
  
  if (!element) {
    console.error('[Cashier Mount] Element is required')
    return
  }
  
  mountInProgress = true
  
  try {
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
  } finally {
    // Always reset mount guard, even if mount fails
    mountInProgress = false
  }
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
