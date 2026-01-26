import React, { useState, useEffect } from 'react'
import { FrappeProvider } from 'frappe-react-sdk'
import {
  OrderList,
  OrderDetails,
  PaymentPanel,
  InvoicePreview,
  CustomerInfo,
  CashierHeader
} from './components'
import {
  usePaymentProcessor,
  useCashierSession,
  useQRISPayment
} from './hooks'
import {
  usePendingOrders,
  useOrderDetails,
  usePaymentMethods
} from '../../shared/api/imogi-api'
import { useAuth } from '../../shared/hooks/useAuth'
import { usePOSProfile } from '../../shared/hooks/usePOSProfile'
import { LoadingSpinner, ErrorMessage } from '../../shared/components/UI'
import { POSProfileSwitcher } from '../../shared/components/POSProfileSwitcher'
import './cashier.css'

/**
 * Cashier App - Main Component
 * Complete payment processing interface
 */
function CashierApp() {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Cashier', 'Branch Manager', 'System Manager'])
  const { cashier, branch: sessionBranch } = useCashierSession()
  
  // Use centralized POS Profile management
  const { currentProfile: posProfile, branch: profileBranch } = usePOSProfile()
  const branch = profileBranch || sessionBranch
  
  // Order state
  const [selectedOrderName, setSelectedOrderName] = useState(null)
  const [currentCustomer, setCurrentCustomer] = useState(null)
  const [filters, setFilters] = useState({})
  
  // Invoice state
  const [showInvoicePreview, setShowInvoicePreview] = useState(false)
  const [completedInvoice, setCompletedInvoice] = useState(null)
  const [completedPayment, setCompletedPayment] = useState(null)

  // Check authentication
  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied - Cashier or Manager role required'} />
  }

  // Fetch data
  const { data: ordersData, isLoading: ordersLoading, mutate: refreshOrders } = usePendingOrders(branch, filters)
  const { data: orderDetailsData, isLoading: detailsLoading } = useOrderDetails(selectedOrderName)
  const { data: paymentMethodsData } = usePaymentMethods(branch)

  // Payment processor
  const { 
    processCompletePayment, 
    processing, 
    currentStep,
    result: paymentResult,
    error: paymentError,
    reset: resetPayment
  } = usePaymentProcessor()

  // Extract data
  const orders = ordersData?.orders || []
  const selectedOrder = orderDetailsData?.order
  const kots = orderDetailsData?.kots || []
  const table = orderDetailsData?.table
  const customer = orderDetailsData?.customer
  const paymentMethods = paymentMethodsData?.methods || []

  // Handle order selection
  const handleOrderSelect = (orderName) => {
    setSelectedOrderName(orderName)
    setCurrentCustomer(null)
    resetPayment()
  }

  // Handle customer selection
  const handleCustomerSelect = (customer) => {
    setCurrentCustomer(customer)
  }

  // Handle payment processing
  const handleProcessPayment = async (paymentData) => {
    if (!selectedOrder) return

    // Check if all KOTs are served
    const allServed = kots.every(kot => kot.workflow_state === 'Served')
    if (!allServed) {
      frappe.show_alert({
        message: 'All items must be served before payment',
        indicator: 'red'
      })
      return
    }

    try {
      const result = await processCompletePayment({
        order_name: selectedOrder.name,
        customer: currentCustomer?.name || 'Walk-In Customer',
        customer_name: currentCustomer?.customer_name || 'Walk-In Customer',
        mode_of_payment: paymentData.mode_of_payment,
        paid_amount: paymentData.paid_amount,
        reference_no: paymentData.reference_no,
        table: table?.name
      })

      if (result.success) {
        // Store invoice and payment data
        setCompletedInvoice({
          name: result.invoice,
          grand_total: selectedOrder.grand_total
        })
        setCompletedPayment({
          mode_of_payment: paymentData.mode_of_payment,
          paid_amount: paymentData.paid_amount,
          change_amount: result.change_amount
        })

        // Show invoice preview
        setShowInvoicePreview(true)

        frappe.show_alert({
          message: 'Payment processed successfully',
          indicator: 'green'
        })
      }
    } catch (error) {
      frappe.show_alert({
        message: error.message || 'Payment processing failed',
        indicator: 'red'
      })
    }
  }

  // Handle invoice complete
  const handleCompleteOrder = () => {
    setShowInvoicePreview(false)
    setSelectedOrderName(null)
    setCurrentCustomer(null)
    setCompletedInvoice(null)
    setCompletedPayment(null)
    resetPayment()
    refreshOrders()
  }

  // Auto-select first order if none selected
  useEffect(() => {
    if (!selectedOrderName && orders.length > 0) {
      setSelectedOrderName(orders[0].name)
    }
  }, [orders, selectedOrderName])

  return (
    <div className="cashier-container">
      {/* Header */}
      <CashierHeader 
        cashier={cashier}
        pendingCount={orders.length}
        branch={branch}
      />

      {/* Main Content - 3 Column Layout */}
      <div className="cashier-main">
        {/* Left Sidebar - Order List */}
        <div className="cashier-sidebar">
          <OrderList
            orders={orders}
            selectedOrder={selectedOrderName}
            onOrderSelect={handleOrderSelect}
            loading={ordersLoading}
          />
        </div>

        {/* Center - Order Details */}
        <div className="cashier-center">
          <OrderDetails
            order={selectedOrder}
            kots={kots}
            table={table}
            customer={customer}
            loading={detailsLoading}
          />

          {/* Customer Info Section */}
          {selectedOrder && (
            <CustomerInfo
              currentCustomer={currentCustomer}
              onCustomerSelect={handleCustomerSelect}
              onCustomerCreate={handleCustomerSelect}
              disabled={processing}
            />
          )}
        </div>

        {/* Right - Payment Panel */}
        <div className="cashier-payment">
          <PaymentPanel
            order={selectedOrder}
            paymentMethods={paymentMethods}
            onProcessPayment={handleProcessPayment}
            processing={processing}
            disabled={!selectedOrder || kots.some(kot => kot.workflow_state !== 'Served')}
          />

          {/* Processing Status */}
          {processing && currentStep && (
            <div className="processing-status">
              <div className="spinner"></div>
              <p>
                {currentStep === 'invoice' && 'Creating invoice...'}
                {currentStep === 'payment' && 'Processing payment...'}
                {currentStep === 'complete' && 'Completing order...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {paymentError && (
            <div className="payment-error">
              <strong>Error:</strong> {paymentError}
            </div>
          )}
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {showInvoicePreview && completedInvoice && (
        <InvoicePreview
          invoice={completedInvoice}
          order={selectedOrder}
          payment={completedPayment}
          onClose={() => setShowInvoicePreview(false)}
          onPrint={() => {
            frappe.show_alert({
              message: 'Printing receipt...',
              indicator: 'blue'
            })
          }}
          onComplete={handleCompleteOrder}
        />
      )}
    </div>
  )
}

/**
 * App Wrapper with FrappeProvider
 */
export default function App() {
  return (
    <FrappeProvider>
      <CashierApp />
    </FrappeProvider>
  )
}
