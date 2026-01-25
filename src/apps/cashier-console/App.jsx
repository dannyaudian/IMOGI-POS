import { useState } from 'react'
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrderHistory } from '@/shared/api/imogi-api'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { OrderListSidebar } from './components/OrderListSidebar'
import { OrderDetailPanel } from './components/OrderDetailPanel'
import { ActionButtons } from './components/ActionButtons'
import { PaymentView } from './components/PaymentView'
import { SplitBillView } from './components/SplitBillView'
import './App.css'

function CounterPOSContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Cashier', 'Branch Manager'])
  
  const branch = initialState.branch || 'Default'
  const posProfile = initialState.pos_profile || 'Default'
  const posMode = initialState.pos_mode || 'Counter'
  
  // Determine order type based on mode
  const orderType = posMode === 'Table' ? 'Dine In' : 'Counter'
  
  const { data: orders, error: ordersError, isLoading: ordersLoading } = useOrderHistory(branch, posProfile, orderType)
  
  // State management
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [viewMode, setViewMode] = useState('orders') // orders, catalog, payment, split
  const [showPayment, setShowPayment] = useState(false)
  const [showSplit, setShowSplit] = useState(false)

  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
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
    alert('New Order - Feature coming soon!\nThis will open the item catalog.')
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
              <div className="catalog-panel">
                <div className="empty-state">
                  <i className="fa fa-shopping-cart empty-icon"></i>
                  <h3>Item Catalog</h3>
                  <p>Menu catalog view coming soon</p>
                </div>
              </div>
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
