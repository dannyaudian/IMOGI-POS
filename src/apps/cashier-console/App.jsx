import { useState, useEffect } from 'react'
import { ImogiPOSProvider, useImogiPOS } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { usePOSProfileGuard } from '@/shared/hooks/usePOSProfileGuard'
import { useOrderHistory } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { POSOpeningModal } from '@/shared/components/POSOpeningModal'
import { OrderListSidebar } from './components/OrderListSidebar'
import { OrderDetailPanel } from './components/OrderDetailPanel'
import { ActionButtons } from './components/ActionButtons'
import { PaymentView } from './components/PaymentView'
import { SplitBillView } from './components/SplitBillView'
import { VariantPickerModal } from './components/VariantPickerModal'
import { CatalogView } from './components/CatalogView'
import './App.css'

function CounterPOSContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Cashier', 'Branch Manager', 'System Manager'])
  
  // POS Profile guard - this module requires opening
  const {
    isLoading: guardLoading,
    guardPassed,
    posProfile,
    profileData,
    branch,
    posOpening,
    showOpeningModal,
    handleOpeningSuccess,
    handleOpeningCancel
  } = usePOSProfileGuard({ requiresOpening: true })
  
  // Debug logging
  useEffect(() => {
    console.log('[cashier-console] Guard state:', {
      guardLoading,
      guardPassed,
      posProfile,
      branch,
      hasOpening: !!posOpening,
      showOpeningModal,
      authLoading,
      hasAccess
    })
  }, [guardLoading, guardPassed, posProfile, branch, posOpening, showOpeningModal, authLoading, hasAccess])
  
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
  
  // useOrderHistory now takes posProfile as primary param
  const { data: orders, error: ordersError, isLoading: ordersLoading } = useOrderHistory(effectivePosProfile, effectiveBranch, orderType)
  
  // State management
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [viewMode, setViewMode] = useState('orders') // orders, catalog, payment, split
  const [showPayment, setShowPayment] = useState(false)
  const [showSplit, setShowSplit] = useState(false)
  const [showVariantPicker, setShowVariantPicker] = useState(false)
  const [variantPickerContext, setVariantPickerContext] = useState(null)

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
  useEffect(() => {
    if (!guardLoading && !authLoading && !guardPassed && !showOpeningModal) {
      const timeout = setTimeout(() => {
        console.error('POS Profile guard failed - redirecting to module select')
        window.location.href = '/shared/module-select'
      }, 10000)
      return () => clearTimeout(timeout)
    }
  }, [guardLoading, authLoading, guardPassed, showOpeningModal])

  // Show loading while checking auth and guard
  if (authLoading || guardLoading) {
    return <LoadingSpinner message="Loading Cashier Console..." />
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
        redirectOnCancel="/shared/module-select"
      />
    )
  }
  
  // Wait for guard to pass
  if (!guardPassed) {
    return <LoadingSpinner message="Verifying POS opening..." />
  }

  if (!effectivePosProfile) {
    return <ErrorMessage error="POS Profile selection required. Please choose a POS Profile." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied'} />
  }

  // Event handlers
  const handleSelectOrder = (order) => {
    setSelectedOrder(order)
    setViewMode('orders')
    setShowPayment(false)
    setShowSplit(false)
  }

  const handleNewOrder = () => {
    setViewMode('catalog')
    setShowPayment(false)
    setShowSplit(false)
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

    if (!window.frappe) {
      alert('System not ready. Please refresh the page.')
      return
    }

    try {
      // Call API to add item to order
      await window.frappe.call({
        method: 'imogi_pos.api.orders.add_item_to_order',
        args: {
          order_name: selectedOrder.name,
          item_code: itemName,
          qty: 1
        }
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

    if (!window.frappe) {
      alert('System not ready. Please refresh the page.')
      return
    }

    try {
      await window.frappe.call({
        method: 'imogi_pos.api.variants.choose_variant_for_order_item',
        args: {
          pos_order: selectedOrder.name,
          order_item_row: orderItemRow,
          variant_item: variantName
        }
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
  
  return (
    <div className="cashier-console" data-pos-mode={posMode}>
      <div className="cashier-console-layout">
        <OrderListSidebar
          orders={orders || []}
          selectedOrder={selectedOrder}
          onSelectOrder={handleSelectOrder}
          posMode={posMode}
        />
        
        <div className="cashier-console-main">
          <ActionButtons
            selectedOrder={selectedOrder}
            viewMode={viewMode}
            onViewChange={setViewMode}
            onNewOrder={handleNewOrder}
            onPrintBill={handlePrintBill}
            onSplitBill={handleSplitBill}
            onRequestPayment={handleRequestPayment}
          />
          
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
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <CounterPOSContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
