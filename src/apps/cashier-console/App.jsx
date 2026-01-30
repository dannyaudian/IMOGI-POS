import { useState, useEffect } from 'react'
import { ImogiPOSProvider, useImogiPOS } from '@/shared/providers/ImogiPOSProvider'
import { SessionExpiredProvider } from '@/shared/components/SessionExpired'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useOrderHistory } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { POSOpeningModal } from '@/shared/components/POSOpeningModal'
import { apiCall } from '@/shared/utils/api'
import { resolveOperationalContext } from '@/shared/utils/operationalContext'
import { OrderListSidebar } from './components/OrderListSidebar'
import { OrderDetailPanel } from './components/OrderDetailPanel'
import { CashierHeader } from './components/CashierHeader'
import { CashierActionBar } from './components/CashierActionBar'
import { PaymentView } from './components/PaymentView'
import { SplitBillView } from './components/SplitBillView'
import { VariantPickerModal } from './components/VariantPickerModal'
import { CatalogView } from './components/CatalogView'
import { TableSelector } from './components/TableSelector'
import { useCustomerDisplay } from './components/CustomerDisplay'
import './App.css'
import './CashierLayout.css'

function CounterPOSContent({ initialState }) {
  // POS Profile guard - this module requires opening
  // No need for useAuth - Frappe Desk already handles authentication
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    profileData,
    branch,
    posOpening,
    showOpeningModal,
    openingStatus,
    openingError,
    retryOpening,
    handleOpeningSuccess,
    handleOpeningCancel
  } = usePOSProfileGuard({ 
    requiresOpening: true,
    targetModule: 'imogi-cashier'
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
  
  // Map mode to order type
  const MODE_TO_ORDER_TYPE = {
    'Counter': 'Counter',
    'Table': 'Dine In'
  }
  const orderType = MODE_TO_ORDER_TYPE[mode]
  
  // CRITICAL FIX: Only fetch orders after guard passes AND context is ready
  // This prevents 417 errors from calling API before operational context is set
  // Additional defensive checks:
  // 1. guardPassed must be true (hook verified context)
  // 2. effectivePosProfile must exist (not null/undefined)
  // 3. effectiveBranch should exist (though API can handle null)
  const shouldFetchOrders = guardPassed && effectivePosProfile && !guardLoading
  
  // Fetch orders for current mode (Counter or Dine In)
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
  
  // Combine all orders
  const orders = [
    ...(modeOrders || []),
    ...(selfOrders || []),
    ...(kioskOrders || [])
  ]
  
  // State management
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [viewMode, setViewMode] = useState('orders') // orders, catalog, payment, split
  const [showPayment, setShowPayment] = useState(false)
  const [showSplit, setShowSplit] = useState(false)
  const [showVariantPicker, setShowVariantPicker] = useState(false)
  const [variantPickerContext, setVariantPickerContext] = useState(null)
  const [showTableSelector, setShowTableSelector] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [branding, setBranding] = useState(null)
  const [printerStatus, setPrinterStatus] = useState({ connected: false, checking: true })
  
  // Customer Display
  const { isOpen: isCustomerDisplayOpen, openDisplay: openCustomerDisplay, closeDisplay: closeCustomerDisplay } = useCustomerDisplay(selectedOrder, branding)

  // Load branding on mount
  useEffect(() => {
    if (effectivePosProfile) {
      loadBranding()
      checkPrinterStatus()
    }
  }, [effectivePosProfile])

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

  // Guard timeout: redirect to module-select if guard doesn't pass within 10 seconds
  // This prevents infinite loading state when context selection is required
  useEffect(() => {
    if (!guardLoading && !guardPassed && !showOpeningModal) {
      const timeout = setTimeout(() => {
        console.warn('[Cashier Console] Guard timeout - redirecting to module selection')
        window.location.href = '/app/imogi-module-select?reason=timeout&target=imogi-cashier'
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, guardPassed, showOpeningModal])

  // Show loading while checking guard
  // No auth loading needed - Frappe Desk handles authentication
  if (guardLoading) {
    return <LoadingSpinner message="Loading Cashier Console..." />
  }

  if (openingStatus === 'error') {
    return (
      <ErrorMessage
        error={openingError?.message || posOpening?.error_message || 'Failed to verify POS opening.'}
        onRetry={() => retryOpening && retryOpening()}
      />
    )
  }
  
  // Show POS Opening Modal if guard requires it
  if (showOpeningModal) {
    return (
      <POSOpeningModal
        isOpen={true}
        onClose={handleOpeningCancel}
        onSuccess={handleOpeningSuccess}
        posProfile={effectivePosProfile}
        required={true}
        redirectOnCancel="/app/imogi-module-select"
      />
    )
  }
  
  // Wait for guard to pass
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
    alert(`Split bill confirmed: ${splits.length} bills using ${method} method`)
    setShowSplit(false)
    setViewMode('orders')
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
          posMode={posMode}
        />
        
        <div className="cashier-console-main">
          <div className="cashier-console-content">
            {viewMode === 'orders' && !showPayment && !showSplit && (
              <OrderDetailPanel order={selectedOrder} posMode={posMode} />
            )}
            
            {viewMode === 'catalog' && (
              <CatalogView
                posProfile={posProfile}
                onSelectItem={handleCatalogItemSelect}
              />
            )}
            
            {showPayment && (
              <PaymentView
                order={selectedOrder}
                onClose={() => {
                  setShowPayment(false)
                  setViewMode('orders')
                }}
                onPaymentComplete={handlePaymentComplete}
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
