import { useState, useEffect } from 'react'
import { ImogiPOSProvider, useImogiPOS } from '@/shared/providers/ImogiPOSProvider'
import { SessionExpiredProvider } from '@/shared/components/SessionExpired'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useEffectiveOpening } from '@/shared/hooks/useEffectiveOpening'
import { useOrderHistory } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { apiCall } from '@/shared/utils/api'
import { resolveOperationalContext } from '@/shared/utils/operationalContext'
import { OrderListSidebar } from './components/OrderListSidebar'
import { OrderDetailPanel } from './components/OrderDetailPanel'
import { CashierHeader } from './components/CashierHeader'
import { CashierActionBar } from './components/CashierActionBar'
import { PaymentView } from './components/PaymentView'
import { ShiftSummaryView } from './components/ShiftSummaryView'
import { CloseShiftView } from './components/CloseShiftView'
import { SplitBillView } from './components/SplitBillView'
import { VariantPickerModal } from './components/VariantPickerModal'
import { CatalogView } from './components/CatalogView'
import { TableSelector } from './components/TableSelector'
import { useCustomerDisplay } from './components/CustomerDisplay'
import { BlockedScreen } from './components/BlockedScreen'
import './App.css'
import './CashierLayout.css'

const asArray = (value) => (Array.isArray(value) ? value : [])

function CounterPOSContent({ initialState }) {
  // POS Profile guard - Native ERPNext v15: ALWAYS requires opening (shift-based)
  // No need for useAuth - Frappe Desk already handles authentication
  // HARDENED: Single-session per user - opening is server-resolved, NOT client-selectable
  
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
    error: contextError,  // FIX: Properly destructure to prevent ReferenceError
    serverContextReady,
    serverContextError,
    retryServerContext
  } = usePOSProfileGuard({ 
    requiresOpening: true,  // Native v15: always require opening
    targetModule: 'imogi-cashier'
    // HARDENED: No overrideOpeningEntry - always use server-resolved active opening
  })
  
  // Multi-session opening validation and consistency hook
  // Validates opening_entry from URL (if present) and ensures consistency throughout session
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
  
  // Use centralized POS context as fallback
  const { mode: contextMode } = useImogiPOS()
  
  // Fallback to initialState for backward compatibility
  const effectiveBranch = branch || initialState.branch || null
  const effectivePosProfile = posProfile || initialState.pos_profile || null
  
  // Explicitly validate and set POS mode (Counter or Table)
  const validModes = ['Counter', 'Table']
  const posMode = profileData?.mode || contextMode
  const mode = validModes.includes(posMode) ? posMode : (validModes.includes(initialState.pos_mode) ? initialState.pos_mode : 'Counter')
  
  // Determine if we should fetch orders (only after guard passes)
  // CRITICAL: Define this BEFORE any conditional returns to avoid ReferenceError
  const shouldFetchOrders = guardPassed && hasValidOpening && !guardLoading
  
  // Map POS mode to order type for API
  const orderType = mode === 'Table' ? 'Dine In' : 'Counter'
  
  // Fetch orders for current mode (Counter or Dine In)
  // CRITICAL: Call hooks BEFORE any conditional returns (React rules of hooks)
  const { data: modeOrders, error: ordersError, isLoading: ordersLoading } = useOrderHistory(
    shouldFetchOrders ? effectivePosProfile : null,
    shouldFetchOrders ? effectiveBranch : null,
    shouldFetchOrders ? orderType : null
  )
  
  // Fetch Self Order orders - only if enabled in POS Profile
  const shouldFetchSelfOrder = shouldFetchOrders && profileData?.imogi_enable_self_order === 1
  const { data: selfOrders } = useOrderHistory(
    shouldFetchSelfOrder ? effectivePosProfile : null,
    shouldFetchSelfOrder ? effectiveBranch : null,
    shouldFetchSelfOrder ? 'Self Order' : null
  )
  
  // Fetch Kiosk orders - only if enabled in POS Profile
  const shouldFetchKiosk = shouldFetchOrders && profileData?.imogi_enable_kiosk === 1
  const { data: kioskOrders } = useOrderHistory(
    shouldFetchKiosk ? effectivePosProfile : null,
    shouldFetchKiosk ? effectiveBranch : null,
    shouldFetchKiosk ? 'Kiosk' : null
  )

  // CRITICAL: ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // State management - moved here to comply with React Rules of Hooks
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [viewMode, setViewModeRaw] = useState('orders') // orders, catalog, payment, split, summary, close
  
  // Wrapped setViewMode with logging for debugging catalog issues
  const setViewMode = (newMode) => {
    if (import.meta.env.DEV && newMode !== viewMode) {
      console.log(`[Cashier] viewMode transition: "${viewMode}" -> "${newMode}"`)
    }
    setViewModeRaw(newMode)
  }
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
  
  // Customer Display hook - must be called unconditionally
  const { isOpen: isCustomerDisplayOpen, openDisplay: openCustomerDisplay, closeDisplay: closeCustomerDisplay } = useCustomerDisplay(selectedOrder, branding)

  // Load branding on mount
  useEffect(() => {
    if (effectivePosProfile) {
      loadBranding()
      checkPrinterStatus()
    }
  }, [effectivePosProfile])

  // Listen for variant selection events from OrderDetailPanel
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

  // Listen for shift summary trigger from header
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

  // Listen for close shift trigger from header
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

  // Guard timeout: redirect to module-select if guard doesn't pass within 10 seconds
  // This prevents infinite loading state when context selection is required
  useEffect(() => {
    if (!guardLoading && !guardPassed) {
      const timeout = setTimeout(() => {
        console.warn('[Cashier Console] Guard timeout - redirecting to module selection')
        window.location.href = '/app/imogi-module-select?reason=timeout&target=imogi-cashier'
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, guardPassed])

  // Helper functions for branding and printer
  const loadBranding = async () => {
    try {
      // API get_branding is in public.py and uses operational context
      const result = await apiCall('imogi_pos.api.public.get_branding')
      if (result) {
        setBranding(result)
        console.log('[Cashier] Branding loaded:', result)
      }
    } catch (err) {
      console.warn('[Cashier] Failed to load branding:', err)
    }
  }

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

  // Block screen if no opening (show error without redirect)
  // CRITICAL: This return comes AFTER all hook calls (React Rules of Hooks)
  // HARDENED: All variables have safe defaults to prevent ReferenceError
  if (!guardLoading && (!guardPassed || !hasValidOpening)) {
    const reason = !guardPassed ? 'guard_failed' : 'no_opening'
    const title = !guardPassed 
      ? 'POS Profile tidak tersedia' 
      : 'POS Opening belum ada'
    const message = !guardPassed
      ? 'Silakan pilih POS Profile melalui Module Select.'
      : 'Silakan buat POS Opening Entry via ERPNext. Setelah itu refresh halaman ini.'
    
    // FIX: Safe error extraction with explicit null checks to prevent ReferenceError
    const errorMessage = !guardPassed 
      ? (serverContextError?.message || contextError?.message || serverContextError || contextError || null)
      : (openingValidationError?.message || openingError?.message || openingValidationError || openingError || null)
    
    if (import.meta.env.DEV) {
      console.error('[CashierConsole] Blocked:', {
        reason,
        guardPassed,
        hasValidOpening,
        posProfile: posProfile || null,
        effectiveOpening: effectiveOpening || null,
        openingStatus: openingStatus || 'unknown',
        openingValidationStatus: openingValidationStatus || 'unknown',
        error: errorMessage
      })
    }
    
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
            },
            { 
              label: "Kembali ke Module Select", 
              href: "/app/imogi-module-select" 
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

  // Show loading while checking guard
  // No auth loading needed - Frappe Desk handles authentication
  if (guardLoading) {
    return <LoadingSpinner message="Loading Cashier Console..." />
  }

  // HARDENED: Safe error checks with explicit null guards
  if (serverContextError) {
    const errorMsg = serverContextError?.message || (typeof serverContextError === 'string' ? serverContextError : 'Failed to sync operational context.')
    return (
      <ErrorMessage
        error={errorMsg}
        onRetry={() => retryServerContext && retryServerContext()}
      />
    )
  }

  if (openingStatus === 'error') {
    const errorMsg = openingError?.message || posOpening?.error_message || (typeof openingError === 'string' ? openingError : 'Failed to verify POS opening.')
    return (
      <ErrorMessage
        error={errorMsg}
        onRetry={() => retryOpening && retryOpening()}
      />
    )
  }
  
  // Wait for guard to pass (native v15: always requires POS opening)
  if (!guardPassed) {
    return <LoadingSpinner message="Verifying POS opening..." />
  }

  // Event handlers
  const handleSelectOrder = (order) => {
    setSelectedOrder(order)
    setViewMode('orders')
    setShowPayment(false)
    setShowSplit(false)
  }

  const handleClaimOrder = async (order) => {
    /**
     * Claim order for processing.
     * In shift-based single-session mode, all orders belong to the active opening.
     * Opening is always server-resolved, not client-selectable.
     * 
     * HARDENED: Uses effectiveOpeningName from useEffectiveOpening hook
     * which validates and locks opening for entire session.
     */
    if (!order || !order.name) {
      console.error('[Cashier] Invalid order for claim', order)
      throw new Error('Invalid order')
    }

    try {
      console.log('[Cashier] Claiming order:', order.name)
      
      // HARDENED: Use validated effective opening from hook (server-resolved)
      if (!effectiveOpeningName) {
        console.error('[Cashier] No effective opening available (validation failed)')
        throw new Error('Opening validation failed. Please reload.')
      }

      // Call claim_order API with validated effective opening
      const response = await apiCall(
        'imogi_pos.api.order_concurrency.claim_order',
        {
          order_name: order.name,
          opening_entry: effectiveOpeningName
        }
      )

      if (!response || !response.success) {
        throw new Error(response?.message || response?.error || 'Failed to claim order')
      }

      console.log('[Cashier] Order claimed successfully:', response)
      
      // Refresh orders to get updated claim status
      // Note: This would trigger a refetch in the actual implementation
      
      // Select the claimed order
      handleSelectOrder({...order, claimed_by: frappe.session.user})
    } catch (error) {
      console.error('[Cashier] Error claiming order:', error)
      // Show error message but allow fallback
      frappe.msgprint({
        title: 'Claim Error',
        message: error.message || 'Failed to claim order. You may still process it.',
        indicator: 'orange'
      })
      // Still allow selecting the order
      handleSelectOrder(order)
    }
  }

  const handleNewOrder = () => {
    console.log('[Cashier] New Order clicked, mode:', mode)
    
    if (mode === 'Counter') {
      // Counter mode: Create order immediately and go to catalog
      createCounterOrder()
    } else {
      // Table mode: Show table selector first
      setShowTableSelector(true)
    }
    
    setShowPayment(false)
    setShowSplit(false)
  }
  
  const createCounterOrder = async () => {
    setCreatingOrder(true)
    
    try {
      // CRITICAL FIX: Resolve operational context sebelum create order
      // Ini memastikan context valid dan tidak null
      const context = await resolveOperationalContext()
      
      if (!context.pos_profile || !context.branch) {
        alert('POS Profile & Branch wajib dipilih. Silakan pilih dari module select.')
        console.error('[Cashier] Context not resolved:', context)
        return
      }
      
      console.log('[Cashier] Creating counter order with context:', context.pos_profile, context.branch)
      
      const result = await apiCall('imogi_pos.api.orders.create_order', {
        pos_profile: context.pos_profile,
        branch: context.branch,
        order_type: 'Counter',
        items: []  // Empty items array - items will be added later via catalog
      })
      
      if (result?.order_name) {
        console.log('[Cashier] Counter order created:', result.order_name)
        
        // Fetch the newly created order details
        const orderDetails = await apiCall('imogi_pos.api.orders.get_order', {
          order_name: result.order_name
        })
        
        if (orderDetails) {
          setSelectedOrder(orderDetails)
          console.log('[Cashier] Order selected:', orderDetails)
          console.log('[Cashier] Switching viewMode -> catalog (Counter)')
        }
        
        setViewMode('catalog')
      }
    } catch (err) {
      console.error('[Cashier] Failed to create counter order:', err)
      
      // Handle context-specific errors
      if (err.message?.includes('CONTEXT_')) {
        alert('Context Error: ' + err.message.split(': ')[1])
        // Redirect to module select
        window.location.href = '/app/imogi-module-select'
      } else {
        alert('Failed to create order: ' + (err.message || 'Unknown error'))
      }
    } finally {
      setCreatingOrder(false)
    }
  }
  
  const createTableOrder = async (table) => {
    setCreatingOrder(true)
    setShowTableSelector(false)
    
    try {
      // CRITICAL FIX: Resolve operational context sebelum create order
      // Ini memastikan context valid dan tidak null
      const context = await resolveOperationalContext()
      
      if (!context.pos_profile || !context.branch) {
        alert('POS Profile & Branch wajib dipilih. Silakan pilih dari module select.')
        console.error('[Cashier] Context not resolved:', context)
        return
      }
      
      console.log('[Cashier] Creating table order with context:', context.pos_profile, context.branch)
      
      const result = await apiCall('imogi_pos.api.orders.create_order', {
        pos_profile: context.pos_profile,
        branch: context.branch,
        order_type: 'Dine In',
        table: table.name,
        items: []  // Empty items array - items will be added later via catalog
      })
      
      if (result?.order_name) {
        console.log('[Cashier] Table order created:', result.order_name)
        
        // Fetch the newly created order details
        const orderDetails = await apiCall('imogi_pos.api.orders.get_order', {
          order_name: result.order_name
        })
        
        if (orderDetails) {
          setSelectedOrder(orderDetails)
          setSelectedTable(table)
          console.log('[Cashier] Order selected:', orderDetails)
          console.log('[Cashier] Switching viewMode -> catalog (Table)')
        }
        
        setViewMode('catalog')
      }
    } catch (err) {
      console.error('[Cashier] Failed to create table order:', err)
      
      // Handle context-specific errors
      if (err.message?.includes('CONTEXT_')) {
        alert('Context Error: ' + err.message.split(': ')[1])
        // Redirect to module select
        window.location.href = '/app/imogi-module-select'
      } else {
        alert('Failed to create order: ' + (err.message || 'Unknown error'))
      }
    } finally {
      setCreatingOrder(false)
    }
  }

  const handleCatalogItemSelect = (item) => {
    const hasVariants = item.has_variants === 1 || item.has_variants === true
    
    if (hasVariants) {
      // Show variant picker for template items
      setVariantPickerContext({
        mode: 'add',
        templateName: item.name,
        orderItemRow: null
      })
      setShowVariantPicker(true)
    } else {
      // Add regular item directly
      addItemToOrder(item.name)
    }
  }

  const handleVariantSelect = async (variantName, mode) => {
    if (mode === 'convert' && variantPickerContext?.orderItemRow) {
      // Convert template to variant
      await convertTemplateToVariant(variantPickerContext.orderItemRow, variantName)
    } else {
      // Add variant to order
      await addItemToOrder(variantName)
    }
    setShowVariantPicker(false)
    setVariantPickerContext(null)
  }

  const addItemToOrder = async (itemName) => {
    if (!selectedOrder) {
      alert('Please select an order first or create a new one')
      return
    }

    try {
      // Call API to add item to order
      await apiCall('imogi_pos.api.orders.add_item_to_order', {
        order_name: selectedOrder.name,
        item_code: itemName,
        qty: 1
      })

      alert('Item added to order successfully')
      // Refresh order data
      // Note: In production, you'd want to refetch the order or update optimistically
    } catch (err) {
      alert('Failed to add item: ' + (err.message || 'Unknown error'))
    }
  }

  const convertTemplateToVariant = async (orderItemRow, variantName) => {
    if (!selectedOrder) return

    try {
      await apiCall('imogi_pos.api.variants.choose_variant_for_order_item', {
        pos_order: selectedOrder.name,
        order_item_row: orderItemRow,
        variant_item: variantName
      })

      alert('Template converted to variant successfully')
      // Refresh order data
    } catch (err) {
      alert('Failed to convert: ' + (err.message || 'Unknown error'))
    }
  }

  const handlePrintBill = () => {
    if (!selectedOrder) return
    alert(`Printing bill for order: ${selectedOrder.name}`)
    // Implement print functionality
  }

  const handleSplitBill = () => {
    if (!selectedOrder) return
    setShowSplit(true)
    setShowPayment(false)
    setShowSummary(false)
    setViewMode('split')
  }

  const handleRequestPayment = () => {
    if (!selectedOrder) return
    setShowPayment(true)
    setShowSplit(false)
    setViewMode('payment')
  }

  const handlePaymentComplete = (paymentData) => {
    console.log('Payment completed:', paymentData)
    alert(`Payment successful!\nChange: ${paymentData.change}`)
    setShowPayment(false)
    setViewMode('orders')
  }

  const handleSplitConfirm = (splits, method) => {
    console.log('Split confirmed:', { splits, method })
    setShowSummary(false)
    setViewMode('orders')
  }

  const handleCloseSummary = () => {
    setShowSummary(false)
    setShowSplit(false)
    setViewMode('orders')
  }

  // FIX: Add missing handlers referenced in CloseShiftView JSX
  const handleCloseShiftView = () => {
    setShowCloseShift(false)
    setShowPayment(false)
    setShowSplit(false)
    setShowSummary(false)
    setViewMode('orders')
  }

  const handleShiftClosed = (closingData) => {
    console.log('[Cashier] Shift closed:', closingData)
    // Refresh page or redirect after shift close
    if (closingData?.success) {
      alert('Shift closed successfully!')
      // Reload to clear state and require new opening
      window.location.reload()
    }
  }

  const handleModeChange = (newMode) => {
    // Mode change handler - would typically update POS Profile or context
    console.log('[Cashier] Mode change requested:', newMode)
    alert(`Mode switching to ${newMode} - This would update POS Profile configuration`)
  }

  const handleSearchScan = (query) => {
    console.log('[Cashier] Search/Scan:', query)
    // Implement search/scan functionality
    alert(`Searching for: ${query}`)
  }

  const handleHoldOrder = () => {
    if (!selectedOrder) return
    console.log('[Cashier] Hold order:', selectedOrder.name)
    alert(`Order ${selectedOrder.name} put on hold`)
  }

  const handleClearOrder = () => {
    if (!selectedOrder) return
    const confirmed = confirm(`Are you sure you want to clear order ${selectedOrder.name}?`)
    if (confirmed) {
      console.log('[Cashier] Clear order:', selectedOrder.name)
      setSelectedOrder(null)
    }
  }
  
  return (
    <div className="cashier-console" data-pos-mode={posMode}>
      <CashierHeader
        posMode={mode}
        onModeChange={handleModeChange}
        posProfile={effectivePosProfile}
        branch={effectiveBranch}
        posOpening={posOpening}
        branding={branding}
        profileData={profileData}
        printerStatus={printerStatus}
        onSearchScan={handleSearchScan}
      />

      <div className="cashier-console-layout">
        <OrderListSidebar
          orders={orders || []}
          selectedOrder={selectedOrder}
          onSelectOrder={handleSelectOrder}
          onClaimOrder={handleClaimOrder}
          posMode={posMode}
          isMultiSession={isUrlOpening}
        />
        
        <div className="cashier-console-main">
          <div className="cashier-console-content">
            {viewMode === 'orders' && !showPayment && !showSplit && !showSummary && !showCloseShift && (
              <OrderDetailPanel order={selectedOrder} posMode={posMode} />
            )}
            
            {viewMode === 'catalog' && (
              <CatalogView
                posProfile={effectivePosProfile}
                branch={effectiveBranch}
                menuChannel="Cashier"
                onSelectItem={handleCatalogItemSelect}
              />
            )}
            
            {showPayment && (
              <PaymentView
                order={selectedOrder}
                posProfile={effectivePosProfile}
                effectiveOpeningName={effectiveOpeningName}
                revalidateOpening={revalidateOpening}
                onClose={() => {
                  setShowPayment(false)
                  setViewMode('orders')
                }}
                onPaymentComplete={handlePaymentComplete}
              />
            )}

            {showSummary && (
              <ShiftSummaryView
                posProfile={effectivePosProfile}
                posOpening={posOpening}
                onClose={handleCloseSummary}
              />
            )}

            {showCloseShift && (
              <CloseShiftView
                posProfile={effectivePosProfile}
                posOpening={posOpening}
                effectiveOpeningName={effectiveOpeningName}
                revalidateOpening={revalidateOpening}
                onClose={handleCloseShiftView}
                onShiftClosed={handleShiftClosed}
              />
            )}
            
            {showSplit && (
              <SplitBillView
                order={selectedOrder}
                onClose={() => {
                  setShowSplit(false)
                  setViewMode('orders')
                }}
                onSplitConfirm={handleSplitConfirm}
              />
            )}
          </div>
        </div>
      </div>

      <CashierActionBar
        selectedOrder={selectedOrder}
        viewMode={viewMode}
        onViewChange={setViewMode}
        onNewOrder={handleNewOrder}
        onPrintBill={handlePrintBill}
        onSplitBill={handleSplitBill}
        onRequestPayment={handleRequestPayment}
        onHoldOrder={handleHoldOrder}
        onClearOrder={handleClearOrder}
        posMode={mode}
        selectedTable={selectedTable}
        creatingOrder={creatingOrder}
        isCustomerDisplayOpen={isCustomerDisplayOpen}
        onOpenCustomerDisplay={openCustomerDisplay}
        onCloseCustomerDisplay={closeCustomerDisplay}
      />
      
      {/* Variant Picker Modal */}
      <VariantPickerModal
        isOpen={showVariantPicker}
        onClose={() => {
          setShowVariantPicker(false)
          setVariantPickerContext(null)
        }}
        templateName={variantPickerContext?.templateName}
        mode={variantPickerContext?.mode || 'add'}
        onSelectVariant={handleVariantSelect}
      />
      
      {/* Table Selector Modal */}
      {showTableSelector && (
        <TableSelector
          branch={effectiveBranch}
          onSelectTable={createTableOrder}
          onClose={() => setShowTableSelector(false)}
        />
      )}
    </div>
  )
}

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
