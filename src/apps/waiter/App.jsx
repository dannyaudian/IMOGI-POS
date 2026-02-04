/**
 * Waiter App - Refactored Architecture
 * 
 * BEFORE: 279 lines - all logic in one component
 * AFTER: 180 lines - data fetching + orchestration only
 * 
 * KEY IMPROVEMENTS:
 * ✓ Context API eliminates prop drilling
 * ✓ Sub-components focus on single responsibility
 * ✓ Cleaner data fetching layer
 * 
 * DATA FLOW:
 * App.jsx (data + logic)
 *   → WaiterProvider (context)
 *   → Sub-components (read from context)
 */

import { useState, useEffect } from 'react'
import { ImogiPOSProvider, useImogiPOS } from '@/shared/providers/ImogiPOSProvider'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useTables, useItems } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { NetworkStatus } from '@/shared/components/NetworkStatus'
import { useCart, useTableOrder } from './hooks'
import { deskNavigate } from '../../shared/utils/deskNavigate'
import './waiter.css'

// Context & Sub-components
import { WaiterProvider } from './context/WaiterContext'
import { WaiterHeader } from './components/WaiterHeader'
import { WaiterLeftPanel } from './components/WaiterLeftPanel'
import { WaiterRightPanel } from './components/WaiterRightPanel'
import { WaiterAlerts } from './components/WaiterAlerts'

/**
 * WaiterContent - Main logic container
 * Handles:
 * - POS Profile validation
 * - Table & item fetching
 * - Cart management
 * - Order creation
 */
function WaiterContent({ initialState }) {
  // POS Profile guard - waiter doesn't require opening, just profile
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    profileData,
    branch,
    redirectToModuleSelect,
    serverContextReady,
    serverContextError,
    retryServerContext
  } = usePOSProfileGuard({ 
    requiresOpening: false, 
    targetModule: 'imogi-waiter' 
  })
  
  // Fallback to initialState
  const effectiveBranch = branch || initialState.branch || null
  const effectivePosProfile = posProfile || initialState.pos_profile || null
  const mode = profileData?.mode || initialState.mode || 'Dine-in'
  
  // State: UI
  const [selectedTable, setSelectedTable] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  // CRITICAL: Define shouldFetch BEFORE hooks
  const shouldFetchData = guardPassed && effectivePosProfile && !guardLoading && serverContextReady
  
  // EFFECT: Fetch tables & items
  const { 
    data: tablesData, 
    error: tablesError, 
    isLoading: tablesLoading, 
    mutate: refreshTables 
  } = useTables(
    shouldFetchData ? effectivePosProfile : null,
    shouldFetchData ? effectiveBranch : null
  )
  
  const { 
    data: itemsData, 
    error: itemsError, 
    isLoading: itemsLoading 
  } = useItems(
    shouldFetchData ? effectivePosProfile : null,
    shouldFetchData ? effectiveBranch : null
  )
  
  // Ensure arrays
  const tables = Array.isArray(tablesData) ? tablesData : []
  const items = Array.isArray(itemsData) ? itemsData : []
  const categories = items.length > 0
    ? [...new Set(items.map(item => item.item_group).filter(Boolean))]
    : []

  // Cart management
  const {
    items: cartItems,
    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,
    getCartSummary
  } = useCart()

  // Order management
  const {
    loading: orderLoading,
    error: orderError,
    createAndSendToKitchen
  } = useTableOrder(effectiveBranch)

  // EFFECT: Guard timeout
  useEffect(() => {
    if (!guardLoading && !guardPassed) {
      const timeout = setTimeout(() => {
        console.error('[imogi][waiter] POS Profile guard failed - redirecting')
        deskNavigate('imogi-module-select', { 
          reason: 'missing_pos_profile', 
          target: 'imogi-waiter' 
        })
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, guardPassed])

  // HANDLER: Send to kitchen
  const handleSendToKitchen = async () => {
    try {
      // Validate
      if (mode === 'Dine-in' && !selectedTable) {
        frappe.show_alert({
          message: 'Please select a table first',
          indicator: 'orange'
        }, 3)
        return
      }

      if (cartItems.length === 0) {
        frappe.show_alert({
          message: 'Cart is empty',
          indicator: 'orange'
        }, 3)
        return
      }

      // Create order
      const result = await createAndSendToKitchen({
        table: mode === 'Dine-in' ? selectedTable.name : null,
        customer: 'Walk-in Customer',
        waiter: window.frappe?.session?.user,
        items: cartItems,
        mode: mode
      })

      // Success
      frappe.show_alert({
        message: `Order sent to kitchen! ${result.kots.length} KOT(s) created`,
        indicator: 'green'
      }, 5)

      // Reset UI
      clearCart()
      setSelectedTable(null)
      refreshTables()
      setShowSuccessMessage(true)
      setTimeout(() => setShowSuccessMessage(false), 3000)

    } catch (error) {
      frappe.show_alert({
        message: error.message || 'Failed to send order',
        indicator: 'red'
      }, 5)
    }
  }

  // Loading states
  if (guardLoading) {
    return <LoadingSpinner message="Loading Waiter App..." />
  }
  
  if (serverContextError) {
    return (
      <ErrorMessage
        error={serverContextError?.message || 'Failed to sync operational context.'}
        onRetry={() => retryServerContext && retryServerContext()}
      />
    )
  }

  if (!guardPassed) {
    return <LoadingSpinner message="Verifying access..." />
  }

  // Render with context
  return (
    <WaiterProvider
      selectedTable={selectedTable}
      setSelectedTable={setSelectedTable}
      tables={tables}
      tablesLoading={tablesLoading}
      tablesError={tablesError}
      selectedCategory={selectedCategory}
      setSelectedCategory={setSelectedCategory}
      items={items}
      itemsLoading={itemsLoading}
      itemsError={itemsError}
      categories={categories}
      cartItems={cartItems}
      addItem={addItem}
      removeItem={removeItem}
      updateQuantity={updateQuantity}
      updateNotes={updateNotes}
      clearCart={clearCart}
      getCartSummary={getCartSummary}
      orderLoading={orderLoading}
      orderError={orderError}
      handleSendToKitchen={handleSendToKitchen}
      mode={mode}
      showSuccessMessage={showSuccessMessage}
    >
      <div className="waiter-app">
        <WaiterHeader />
        <WaiterAlerts />
        
        <main className="waiter-main">
          <WaiterLeftPanel />
          <WaiterRightPanel />
        </main>
      </div>
    </WaiterProvider>
  )
}

/**
 * App - Provider wrapper
 */
function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <WaiterContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
