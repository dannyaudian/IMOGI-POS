import { useState, useCallback } from 'react'
import { 
  useCreateInvoice, 
  useProcessPayment, 
  useCompleteOrder,
  useSendToDisplay,
  useShowPaymentProcessing,
  useShowThankYou,
  useClearDisplay,
  useDisplayForTable
} from '../../../shared/api/imogi-api'

/**
 * usePaymentProcessor Hook
 * Orchestrates complete payment workflow
 */
export function usePaymentProcessor() {
  const [processing, setProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState(null) // 'invoice' | 'payment' | 'complete'
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const createInvoice = useCreateInvoice()
  const processPayment = useProcessPayment()
  const completeOrder = useCompleteOrder()
  const sendToDisplay = useSendToDisplay()
  const showPaymentProcessing = useShowPaymentProcessing()
  const showThankYou = useShowThankYou()
  const clearDisplay = useClearDisplay()
  const { data: displayConfig } = useDisplayForTable()

  /**
   * Process complete payment workflow
   */
  const processCompletePayment = useCallback(async ({
    order_name,
    customer,
    customer_name,
    mode_of_payment,
    paid_amount,
    reference_no,
    table
  }) => {
    setProcessing(true)
    setError(null)
    setResult(null)

    try {
      // Step 1: Create Invoice
      setCurrentStep('invoice')
      const invoiceResult = await createInvoice.trigger({
        order_name,
        customer,
        customer_name
      })

      if (!invoiceResult.success) {
        throw new Error(invoiceResult.message || 'Failed to create invoice')
      }

      const invoiceName = invoiceResult.invoice

      // Step 2: Show payment processing on display
      if (table && displayConfig) {
        await showPaymentProcessing.trigger({
          device: displayConfig.display,
          payment_method: mode_of_payment,
          amount: paid_amount
        })
      }

      // Step 3: Process Payment
      setCurrentStep('payment')
      const paymentResult = await processPayment.trigger({
        invoice_name: invoiceName,
        mode_of_payment,
        paid_amount,
        reference_no
      })

      if (!paymentResult.success) {
        throw new Error(paymentResult.message || 'Failed to process payment')
      }

      const paymentName = paymentResult.payment_entry
      const changeAmount = paymentResult.change_amount || 0

      // Step 4: Complete Order
      setCurrentStep('complete')
      const completeResult = await completeOrder.trigger({
        order_name,
        invoice_name: invoiceName,
        payment_name: paymentName
      })

      if (!completeResult.success) {
        throw new Error(completeResult.message || 'Failed to complete order')
      }

      // Step 5: Show thank you on display
      if (table && displayConfig) {
        await showThankYou.trigger({
          device: displayConfig.display,
          invoice_name: invoiceName,
          total_paid: paid_amount,
          change_amount: changeAmount
        })
      }

      // Success!
      const finalResult = {
        success: true,
        invoice: invoiceName,
        payment: paymentName,
        change_amount: changeAmount,
        order: order_name
      }

      setResult(finalResult)
      setCurrentStep(null)
      setProcessing(false)

      return finalResult

    } catch (err) {
      console.error('Payment processing error:', err)
      setError(err.message || 'Payment processing failed')
      setProcessing(false)
      setCurrentStep(null)
      throw err
    }
  }, [createInvoice, processPayment, completeOrder, showPaymentProcessing, showThankYou, displayConfig])

  return {
    processCompletePayment,
    processing,
    currentStep,
    result,
    error,
    reset: () => {
      setProcessing(false)
      setCurrentStep(null)
      setResult(null)
      setError(null)
    }
  }
}
