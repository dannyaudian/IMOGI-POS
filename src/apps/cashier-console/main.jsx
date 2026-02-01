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

// Track mount count for debugging
let mountCounter = 0

/**
 * Bulletproof React mount - ALWAYS creates fresh instance
 * Production-safe with developer mode logging
 * Uses consistent __IMOGI_POS_ prefix for all global state
 */
window.imogiCashierMount = function(element, options = {}) {
  const state = options.initialState || window.__INITIAL_STATE__ || {}
  const isDev = typeof frappe !== 'undefined' && (frappe?.boot?.developer_mode || window.location.hostname === 'localhost')
  
  // STEP 1: Unmount element-scoped root
  if (element._reactRoot) {
    if (isDev) console.log('[Cashier Mount] Unmounting element root')
    try {
      element._reactRoot.unmount()
    } catch (err) {
      console.warn('[Cashier Mount] Element unmount error:', err)
    }
    element._reactRoot = null
    element._reactMountKey = null
    element._reactMountTimestamp = null
  }
  
  // STEP 2: Unmount window-scoped root (consistent naming)
  if (window.__IMOGI_POS_CASHIER_ROOT) {
    if (isDev) console.log('[Cashier Mount] Unmounting window root')
    try {
      window.__IMOGI_POS_CASHIER_ROOT.unmount()
    } catch (err) {
      console.warn('[Cashier Mount] Window unmount error:', err)
    }
    delete window.__IMOGI_POS_CASHIER_ROOT
  }
  
  // STEP 3: Clear mounted flags (consistent prefix)
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
  
  // STEP 5: Clear all global state (consistent __IMOGI_POS_ prefix)
  const globalStateKeys = [
    '__IMOGI_POS_CASHIER_STATE__',
    '__IMOGI_POS_CASHIER_STORE__',
    '__IMOGI_POS_CASHIER_CONTEXT__'
  ]
  
  globalStateKeys.forEach(key => {
    if (window[key]) {
      if (isDev) console.log(`[Cashier Mount] Clearing ${key}`)
      delete window[key]
    }
  })
  
  // Generate unique mount key
  mountCounter++
  const mountKey = `cashier-mount-${mountCounter}-${Date.now()}`
  
  if (isDev) {
    console.log('[Cashier Mount] Creating FRESH instance', {
      mountKey,
      count: mountCounter,
      hasState: !!state,
      route: typeof frappe !== 'undefined' ? frappe.get_route_str() : window.location.pathname
    })
  }
  
  // Create completely new React root
  const root = ReactDOM.createRoot(element)
  
  // Render with conditional StrictMode (dev only to avoid double-invoke confusion)
  const app = (
    <ImogiPOSProvider initialState={state} key={mountKey}>
      <App initialState={state} />
    </ImogiPOSProvider>
  )
  
  root.render(
    isDev ? <React.StrictMode>{app}</React.StrictMode> : app
  )
  
  // Store references in BOTH locations for defensive cleanup (consistent naming)
  element._reactRoot = root
  element._reactMountKey = mountKey
  element._reactMountTimestamp = Date.now()
  
  window.__IMOGI_POS_CASHIER_ROOT = root
  window.__IMOGI_POS_CASHIER_MOUNTED = true
  window.__IMOGI_POS_CASHIER_MOUNT_KEY = mountKey
  
  if (isDev) {
    console.log('[Cashier Mount] ✓ Mounted successfully', { mountKey })
  }
  
  return root
}

/**
 * Bulletproof React unmount - safe to call multiple times
 * Production-safe with developer mode logging
 * Uses consistent __IMOGI_POS_ prefix for all global state
 */
window.imogiCashierUnmount = function(element) {
  const isDev = typeof frappe !== 'undefined' && (frappe?.boot?.developer_mode || window.location.hostname === 'localhost')
  const mountDuration = element?._reactMountTimestamp ? Date.now() - element._reactMountTimestamp : 0
  
  if (isDev) {
    console.log('[Cashier Unmount] Starting cleanup', {
      hasElement: !!element,
      elementRoot: !!element?._reactRoot,
      windowRoot: !!window.__IMOGI_POS_CASHIER_ROOT,
      mountDuration: `${mountDuration}ms`
    })
  }
  
  // CLEANUP 1: Unmount element-scoped root
  if (element?._reactRoot) {
    if (isDev) console.log('[Cashier Unmount] Destroying element root')
    try {
      element._reactRoot.unmount()
    } catch (err) {
      console.error('[Cashier Unmount] Element unmount error:', err)
    }
    element._reactRoot = null
    element._reactMountKey = null
    element._reactMountTimestamp = null
  }
  
  // CLEANUP 2: Unmount window-scoped root (consistent naming)
  if (window.__IMOGI_POS_CASHIER_ROOT) {
    if (isDev) console.log('[Cashier Unmount] Destroying window root')
    try {
      window.__IMOGI_POS_CASHIER_ROOT.unmount()
    } catch (err) {
      console.error('[Cashier Unmount] Window unmount error:', err)
    }
    delete window.__IMOGI_POS_CASHIER_ROOT
  }
  
  // CLEANUP 3: Clear mounted flags (consistent prefix)
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
  
  // CLEANUP 5: Clear all global state (consistent __IMOGI_POS_ prefix)
  const globalStateKeys = [
    '__IMOGI_POS_CASHIER_STATE__',
    '__IMOGI_POS_CASHIER_STORE__',
    '__IMOGI_POS_CASHIER_CONTEXT__',
    '__INITIAL_STATE__'
  ]
  
  globalStateKeys.forEach(key => {
    if (window[key]) {
      if (isDev) console.log(`[Cashier Unmount] Clearing ${key}`)
      delete window[key]
    }
  })
  
  if (isDev) {
    console.log('[Cashier Unmount] ✓ Cleanup complete')
  }
}
