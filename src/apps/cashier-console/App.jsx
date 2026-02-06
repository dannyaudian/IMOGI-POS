/**
 * Cashier Console App - Refactored Architecture
 * 
 * BEFORE: 923 lines - monolithic component with all logic embedded
 * AFTER: ~550 lines - data fetching + orchestration only
 * 
 * KEY IMPROVEMENTS:
 * ✓ Context API eliminates prop drilling (20+ props → none)
 * ✓ Sub-components focus on single responsibility
 * ✓ Event listeners centralized for keyboard shortcuts
 * ✓ Handlers cleanly organized
 * 
 * DATA FLOW:
 * App.jsx (data + logic)
 *   → CashierProvider (context)
 *   → Sub-components (read from context via useCashierContext hook)
 */

import { useState, useEffect, useCallback, useContext } from 'react'
import { ImogiPOSProvider, useImogiPOS } from '@/shared/providers/ImogiPOSProvider'
import { SessionExpiredProvider } from '@/shared/components/SessionExpired'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useEffectiveOpening } from '@/shared/hooks/useEffectiveOpening'
import { useOrderHistory } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { NetworkStatus } from '@/shared/components/NetworkStatus'
import { apiCall } from '@/shared/utils/api'
import { resolveOperationalContext } from '@/shared/utils/operationalContext'
import { BlockedScreen } from './components/BlockedScreen'
import { CashierActionBar } from './components/CashierActionBar'
import './App.css'
import './CashierLayout.css'

// Context & Sub-components
import { CashierProvider } from './context/CashierContext'
import { CashierHeaderBar } from './components/CashierHeaderBar'
import { CashierOrderSidebar } from './components/CashierOrderSidebar'
import { CashierMainContent } from './components/CashierMainContent'
import { CashierModalsContainer } from './components/CashierModalsContainer'

const asArray = (value) => (Array.isArray(value) ? value : [])

/**
 * CounterPOSContent - Main app logic container
 * Handles:
 * - POS Profile validation via usePOSProfileGuard
 * - Opening validation via useEffectiveOpening
 * - Order fetching via useOrderHistory (multiple channels)
 * - State management (all delegated to context)
 * - Event listeners (keyboard, variant selection, etc.)
 * - API handlers (create order, add item, etc.)
 * 
 * Renders modular sub-components via CashierProvider
 */
function CounterPOSContent({ initialState }) {
  // POS Profile validation - ensures user has valid profile & opening
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    profileData,
    branch,
    posOpening,
    openingStatus,
    openingError,
    retryOpening,
    error: contextError,
    serverContextReady,
    serverContextError,
    retryServerContext
  } = usePOSProfileGuard({ 
    requiresOpening: true,
    targetModule: 'imogi-cashier'
  })
  
  // Opening validation - ensures opening is valid & consistent
  const {
    opening: effectiveOpening,
    effectiveOpeningName,
    status: openingValidationStatus,
    error: openingValidationError,
    isValid: hasValidOpening,
    isMismatch: openingMismatch,
    isUrlOpening,
    revalidate: revalidateOpening
  } = useEffectiveOpening({
    requiresOpening: true,
    allowUrlParam: true,
    autoRefreshMs: 30000
  })
  
  // Get context mode as fallback
  const { mode: contextMode } = useImogiPOS()
  
  // Fallback context resolution
  const effectiveBranch = branch || initialState.branch || null
  const effectivePosProfile = posProfile || initialState.pos_profile || null
  const validModes = ['Counter', 'Table']
  const posMode = profileData?.mode || contextMode
  const mode = validModes.includes(posMode) ? posMode : (validModes.includes(initialState.pos_mode) ? initialState.pos_mode : 'Counter')
  
  // CRITICAL: Define shouldFetch BEFORE hooks to avoid ReferenceError (React Rules of Hooks)
  const shouldFetchOrders = guardPassed && hasValidOpening && !guardLoading
  const orderType = mode === 'Table' ? 'Dine In' : 'Counter'
  
  // Fetch orders for current mode
  const { data: modeOrders, error: ordersError, isLoading: ordersLoading } = useOrderHistory(
    shouldFetchOrders ? effectivePosProfile : null,
    shouldFetchOrders ? effectiveBranch : null,
    shouldFetchOrders ? orderType : null
  )
  
  // Fetch Self Order orders (if enabled)
  const shouldFetchSelfOrder = shouldFetchOrders && profileData?.imogi_enable_self_order === 1
  const { data: selfOrders } = useOrderHistory(
    shouldFetchSelfOrder ? effectivePosProfile : null,
    shouldFetchSelfOrder ? effectiveBranch : null,
    shouldFetchSelfOrder ? 'Self Order' : null
  )
  
  // Fetch Kiosk orders (if enabled)
  const shouldFetchKiosk = shouldFetchOrders && profileData?.imogi_enable_kiosk === 1
  const { data: kioskOrders } = useOrderHistory(
    shouldFetchKiosk ? effectivePosProfile : null,
    shouldFetchKiosk ? effectiveBranch : null,
    shouldFetchKiosk ? 'Kiosk' : null
  )

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS (React Rules of Hooks)
  // State: Order & view management
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [viewMode, setViewModeRaw] = useState('orders')
  const [showPayment, setShowPayment] = useState(false)
  const [showSplit, setShowSplit] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showCloseShift, setShowCloseShift] = useState(false)
  const [showVariantPicker, setShowVariantPicker] = useState(false)
  const [variantPickerContext, setVariantPickerContext] = useState(null)
  const [showTableSelector, setShowTableSelector] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [branding, setBranding] = useState(null)
  const [printerStatus, setPrinterStatus] = useState({ connected: false, checking: true })
  const [isCustomerDisplayOpen, setIsCustomerDisplayOpen] = useState(false)

  // Logged setViewMode for debugging
  const setViewMode = (newMode) => {
    if (import.meta.env.DEV && newMode !== viewMode) {
      console.log(`[Cashier] viewMode transition: "${viewMode}" -> "${newMode}"`)
    }
    setViewModeRaw(newMode)
  }

  // Customer Display handlers
  const openCustomerDisplay = useCallback(() => {
    setIsCustomerDisplayOpen(true)
    // TODO: Implement actual customer display window opening logic
    console.log('[Cashier] Customer display opened')
  }, [])

  const closeCustomerDisplay = useCallback(() => {
    setIsCustomerDisplayOpen(false)
    // TODO: Implement actual customer display window closing logic
    console.log('[Cashier] Customer display closed')
  }, [])

  // EFFECT: Load branding
  useEffect(() => {
    if (effectivePosProfile) {
      loadBranding()
      checkPrinterStatus()
    }
  }, [effectivePosProfile])

  // EFFECT: Listen for variant selection from OrderDetailPanel
  useEffect(() => {
    const handleSelectVariant = (event) => {
      const { itemRow, itemCode } = event.detail
      setVariantPickerContext({
        mode: 'convert',
        templateName: itemCode,
        orderItemRow: itemRow
      })
      setShowVariantPicker(true)
    }

    window.addEventListener('selectVariant', handleSelectVariant)
    return () => window.removeEventListener('selectVariant', handleSelectVariant)
  }, [selectedOrder])

  // EFFECT: Listen for shift summary trigger from header
  useEffect(() => {
    const handleShowSummary = () => {
      setShowSummary(true)
      setShowPayment(false)
      setShowCloseShift(false)
      setViewMode('summary')
    }

    window.addEventListener('showShiftSummary', handleShowSummary)
    return () => window.removeEventListener('showShiftSummary', handleShowSummary)
  }, [])

  // EFFECT: Listen for close shift trigger from header
  useEffect(() => {
    const handleCloseShift = () => {
      setShowCloseShift(true)
      setShowPayment(false)
      setShowSplit(false)
      setShowSummary(false)
      setViewMode('close')
    }

    window.addEventListener('closeShift', handleCloseShift)
    return () => window.removeEventListener('closeShift', handleCloseShift)
  }, [])

  // EFFECT: Guard timeout - redirect if guard doesn't pass within 10 seconds
  useEffect(() => {
    if (!guardLoading && !guardPassed) {
      const timeout = setTimeout(() => {
        console.warn('[Cashier Console] Guard timeout - redirecting to module selection')
        window.location.href = '/app/imogi-module-select?reason=timeout&target=imogi-cashier'
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, guardPassed])
  
  // EFFECT: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input/textarea (except ESC)
      if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && e.key !== 'Escape') {
        return
      }
      
      // "/" - Focus search and open catalog
      if (e.key === '/' && viewMode !== 'catalog') {
        e.preventDefault()
        setViewMode('catalog')
        setTimeout(() => {
          const searchInput = document.querySelector('.catalog-search-input')
          if (searchInput) searchInput.focus()
        }, 100)
      }
      
      // F2 - Open payment
      if (e.key === 'F2') {
        e.preventDefault()
        if (selectedOrder && !showPayment) {
          setShowPayment(true)
          setViewMode('payment')
        }
      }
      
      // F3 - Toggle catalog
      if (e.key === 'F3') {
        e.preventDefault()
        setViewMode(viewMode === 'catalog' ? 'orders' : 'catalog')
      }
      
      // ESC - Close modals
      if (e.key === 'Escape') {
        setShowPayment(false)
        setShowSplit(false)
        setShowSummary(false)
        setShowCloseShift(false)
        setViewMode('orders')
      }
      
      // Ctrl+N / Cmd+N - New order
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        if (mode === 'Counter') {
          createCounterOrder()
        } else {
          setShowTableSelector(true)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, selectedOrder, showPayment, showSplit, showSummary, showCloseShift, mode])

  // HANDLER: Load branding
  const loadBranding = async () => {
    try {
      const result = await apiCall('imogi_pos.api.public.get_branding')
      if (result) {
        setBranding(result)
        console.log('[Cashier] Branding loaded:', result)
      }
    } catch (err) {
      console.warn('[Cashier] Failed to load branding:', err)
    }
  }

  // HANDLER: Check printer status
  const checkPrinterStatus = async () => {
    try {
      if (window.escposPrint && typeof window.escposPrint.getStatus === 'function') {
        const status = await window.escposPrint.getStatus()
        setPrinterStatus({ connected: status.connected || false, checking: false })
      } else {
        setPrinterStatus({ connected: false, checking: false })
      }
    } catch (err) {
      console.warn('[Cashier] Printer status check failed:', err)
      setPrinterStatus({ connected: false, checking: false })
    }
  }

  // HANDLER: Select order
  const handleSelectOrder = (order) => {
    setSelectedOrder(order)
    setViewMode('orders')
    setShowPayment(false)
    setShowSplit(false)
  }

  // HANDLER: Create counter order
  const createCounterOrder = async () => {
    setCreatingOrder(true)
    
    try {
      const context = await resolveOperationalContext()
      
      if (!context.pos_profile || !context.branch) {
        alert('POS Profile & Branch wajib dipilih. Silakan pilih dari module select.')
        return
      }
      
      const result = await apiCall('imogi_pos.api.orders.create_order', {
        pos_profile: context.pos_profile,
        branch: context.branch,
        order_type: 'Counter',
        items: []
      })
      
      if (result?.order_name) {
        const orderDetails = await apiCall('imogi_pos.api.orders.get_order', {
          order_name: result.order_name
        })
        
        if (orderDetails) {
          handleSelectOrder(orderDetails)
        }
        
        setViewMode('catalog')
      }
    } catch (err) {
      console.error('[Cashier] Failed to create counter order:', err)
      frappe.show_alert({
        message: 'Failed to create order: ' + (err.message || 'Unknown error'),
        indicator: 'red'
      }, 5)
    } finally {
      setCreatingOrder(false)
    }
  }
  
  // HANDLER: Create table order
  const createTableOrder = async (table) => {
    setCreatingOrder(true)
    setShowTableSelector(false)
    
    try {
      const context = await resolveOperationalContext()
      
      if (!context.pos_profile || !context.branch) {
        alert('POS Profile & Branch wajib dipilih. Silakan pilih dari module select.')
        return
      }
      
      const result = await apiCall('imogi_pos.api.orders.create_order', {
        pos_profile: context.pos_profile,
        branch: context.branch,
        order_type: 'Dine In',
        table: table.name,
        items: []
      })
      
      if (result?.order_name) {
        const orderDetails = await apiCall('imogi_pos.api.orders.get_order', {
          order_name: result.order_name
        })
        
        if (orderDetails) {
          setSelectedOrder(orderDetails)
          setSelectedTable(table)
        }
        
        setViewMode('catalog')
      }
    } catch (err) {
      console.error('[Cashier] Failed to create table order:', err)
      frappe.show_alert({
        message: 'Failed to create order: ' + (err.message || 'Unknown error'),
        indicator: 'red'
      }, 5)
    } finally {
      setCreatingOrder(false)
    }
  }

  // HANDLER: Add item to order
  const addItemToOrder = async (itemName) => {
    if (!selectedOrder) {
      alert('Please select an order first or create a new one')
      return
    }

    try {
      await apiCall('imogi_pos.api.orders.add_item_to_order', {
        order_name: selectedOrder.name,
        item_code: itemName,
        qty: 1
      })
      alert('Item added to order successfully')
    } catch (err) {
      alert('Failed to add item: ' + (err.message || 'Unknown error'))
    }
  }

  // HANDLER: Convert template to variant
  const convertTemplateToVariant = async (orderItemRow, variantName) => {
    if (!selectedOrder) return

    try {
      await apiCall('imogi_pos.api.variants.choose_variant_for_order_item', {
        pos_order: selectedOrder.name,
        order_item_row: orderItemRow,
        variant_item: variantName
      })
      alert('Template converted to variant successfully')
    } catch (err) {
      alert('Failed to convert: ' + (err.message || 'Unknown error'))
    }
  }

  // GUARD CHECKS: Verify guard passed and opening is valid
  if (!guardLoading && (!guardPassed || !hasValidOpening)) {
    const title = !guardPassed 
      ? 'POS Profile tidak tersedia' 
      : 'POS Opening belum ada'
    const message = !guardPassed
      ? 'Silakan pilih POS Profile melalui Module Select.'
      : 'Silakan buat POS Opening Entry via ERPNext. Setelah itu refresh halaman ini.'
    
    const errorMessage = !guardPassed 
      ? (serverContextError?.message || contextError?.message || serverContextError || contextError || null)
      : (openingValidationError?.message || openingError?.message || openingValidationError || openingError || null)
    
    return (
      <BlockedScreen
        title={title}
        message={message}
        error={errorMessage}
        actions={
          !guardPassed ? [
            { 
              label: "Pilih POS Profile", 
              href: "/app/imogi-module-select?target=imogi-cashier" 
            }
          ] : [
            { 
              label: "Buat POS Opening Entry", 
              href: `/app/pos-opening-entry/new-pos-opening-entry-1?pos_profile=${encodeURIComponent(posProfile || '')}` 
            }
          ]
        }
      />
    )
  }
  
  // Combine all orders
  const orders = [
    ...asArray(modeOrders),
    ...asArray(selfOrders),
    ...asArray(kioskOrders)
  ]

  // Loading states
  if (guardLoading) {
    return <LoadingSpinner message="Loading Cashier Console..." />
  }

  if (serverContextError) {
    return (
      <ErrorMessage
        error={serverContextError?.message || 'Failed to sync operational context.'}
        onRetry={() => retryServerContext && retryServerContext()}
      />
    )
  }

  if (openingStatus === 'error') {
    return (
      <ErrorMessage
        error={openingError?.message || 'Failed to verify POS opening.'}
        onRetry={() => retryOpening && retryOpening()}
      />
    )
  }
  
  if (!guardPassed) {
    return <LoadingSpinner message="Verifying POS opening..." />
  }

  // Render with context provider
  return (
    <CashierProvider
      selectedOrder={selectedOrder}
      setSelectedOrder={handleSelectOrder}
      viewMode={viewMode}
      setViewMode={setViewMode}
      orders={orders}
      ordersLoading={ordersLoading}
      ordersError={ordersError}
      selfOrders={selfOrders}
      kioskOrders={kioskOrders}
      showPayment={showPayment}
      setShowPayment={setShowPayment}
      showSplit={showSplit}
      setShowSplit={setShowSplit}
      showSummary={showSummary}
      setShowSummary={setShowSummary}
      showCloseShift={showCloseShift}
      setShowCloseShift={setShowCloseShift}
      showVariantPicker={showVariantPicker}
      setShowVariantPicker={setShowVariantPicker}
      variantPickerContext={variantPickerContext}
      setVariantPickerContext={setVariantPickerContext}
      showTableSelector={showTableSelector}
      setShowTableSelector={setShowTableSelector}
      selectedTable={selectedTable}
      setSelectedTable={setSelectedTable}
      effectiveOpening={effectiveOpening}
      posMode={mode}
      posProfile={effectivePosProfile}
      branch={effectiveBranch}
      profileData={profileData}
      branding={branding}
      printerStatus={printerStatus}
      guardPassed={guardPassed}
      hasValidOpening={hasValidOpening}
      creatingOrder={creatingOrder}
      isCustomerDisplayOpen={isCustomerDisplayOpen}
      openCustomerDisplay={openCustomerDisplay}
      closeCustomerDisplay={closeCustomerDisplay}
    >
      <div className="cashier-console" data-pos-mode={mode}>
        <NetworkStatus />
        
        <CashierHeaderBar />
        
        {/* Keyboard shortcuts hint */}
        <div className="keyboard-shortcuts-hint">
          <div>/ - Catalog | F2 - Pay | F3 - Toggle | Ctrl+N - New | ESC - Close</div>
        </div>

        <div className="cashier-console-layout">
          <CashierOrderSidebar />
          <CashierMainContent />
          <CashierActionBar />
        </div>

        <CashierModalsContainer />
      </div>
    </CashierProvider>
  )
}

/**
 * App wrapper with providers
 */
function App({ initialState }) {
  return (
    <SessionExpiredProvider>
      <ImogiPOSProvider initialState={initialState}>
        <CounterPOSContent initialState={initialState} />
      </ImogiPOSProvider>
    </SessionExpiredProvider>
  )
}

export default App
