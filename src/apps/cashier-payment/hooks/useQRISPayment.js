import { useState, useCallback } from 'react'
import { apiCall } from '@/shared/utils/api'

/**
 * useQRISPayment Hook
 * Handle QRIS payment flow
 */
export function useQRISPayment() {
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState(null) // 'pending' | 'success' | 'failed'

  /**
   * Generate QRIS QR Code
   */
  const generateQRCode = useCallback(async (amount, merchantId) => {
    setLoading(true)
    try {
      // In production, this would call QRIS provider API
      // For now, we generate a mock QR code
      const qrData = {
        merchant_id: merchantId,
        amount: amount,
        timestamp: new Date().toISOString(),
        transaction_id: `QRIS-${Date.now()}`
      }

      // Mock QR code generation
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(JSON.stringify(qrData))}`
      
      setQrCode({
        url: qrCodeUrl,
        data: qrData
      })
      setPaymentStatus('pending')
      
      return qrData.transaction_id
    } catch (error) {
      console.error('Error generating QR code:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Check payment status (polling)
   */
  const checkPaymentStatus = useCallback(async (transactionId) => {
    // In production, this would poll QRIS provider API
    // For now, we return mock status
    try {
      const result = await apiCall('imogi_pos.api.cashier.check_qris_payment', {
        transaction_id: transactionId
      })
      
      setPaymentStatus(result.status)
      return result.status
    } catch (error) {
      console.error('[imogi][qris] Error checking payment status:', error)
      return 'pending'
    }
  }, [])

  /**
   * Reset QRIS state
   */
  const reset = useCallback(() => {
    setQrCode(null)
    setPaymentStatus(null)
    setLoading(false)
  }, [])

  return {
    qrCode,
    loading,
    paymentStatus,
    generateQRCode,
    checkPaymentStatus,
    reset
  }
}
