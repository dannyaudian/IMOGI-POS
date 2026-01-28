/**
 * IMOGI POS - POS Opening Modal Component
 * 
 * Modal dialog for creating POS Opening Entry from React UI.
 * Allows users to start a new POS opening without leaving the app.
 */

import React, { useState, useEffect } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import { isSessionExpired } from '../utils/session-manager'
import storage from '../utils/storage'
import './POSOpeningModal.css'

/**
 * Modal for creating a new POS Opening Entry
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close handler (optional - modal can be non-dismissable)
 * @param {Function} props.onSuccess - Success callback with opening entry data
 * @param {string} props.posProfile - POS Profile name (required)
 * @param {boolean} props.required - If true, modal cannot be dismissed without completing
 * @param {string} props.redirectOnCancel - URL to redirect if user cancels (when required)
 */
export function POSOpeningModal({
  isOpen,
  onClose,
  onSuccess,
  posProfile,
  required = false,
  redirectOnCancel = '/app/imogi-module-select'
}) {
  const [openingAmount, setOpeningAmount] = useState('')
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Fetch available payment methods
  const { data: paymentMethods, isLoading: methodsLoading, error: methodsError } = useFrappeGetCall(
    'imogi_pos.api.cashier.get_pos_payment_methods',
    { pos_profile: posProfile },
    posProfile ? undefined : false,
    {
      errorRetryCount: 0,
      shouldRetryOnError: false,
      onError: (error) => {
        console.error('[POSOpeningModal] Payment methods API failed:', error)
        
        // Use centralized session expiry detection
        if (isSessionExpired(error)) {
          console.warn('[POSOpeningModal] Session expired - user needs to re-authenticate through Frappe desk')
          // Just show error, don't redirect
          setError('Session expired. Please login through Frappe desk and try again.')
        }
      }
    }
  )

  // API for creating POS Opening
  const { call: createOpening } = useFrappePostCall(
    'imogi_pos.api.cashier.create_pos_opening'
  )

  // Set default mode of payment when methods load
  useEffect(() => {
    if (paymentMethods && paymentMethods.length > 0) {
      const defaultMethod = paymentMethods.find(m => m.default)
      setModeOfPayment(defaultMethod?.mode_of_payment || paymentMethods[0]?.mode_of_payment || 'Cash')
    }
  }, [paymentMethods])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setOpeningAmount('')
      setNotes('')
      setError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await createOpening({
        pos_profile: posProfile,
        opening_amount: parseFloat(openingAmount) || 0,
        mode_of_payment: modeOfPayment,
        notes: notes
      })

      if (result.success) {
        // Store in localStorage for immediate use
        storage.setItem('pos_opening_entry', result.pos_opening_entry)
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('posSessionOpened', {
          detail: result
        }))

        if (onSuccess) {
          onSuccess(result)
        }
      } else {
        setError(result.error || 'Failed to create POS opening')
      }
    } catch (err) {
      console.error('Error creating POS opening:', err)
      setError(err.message || err._server_messages || 'Failed to create POS opening. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (required) {
      // Redirect to module select if required modal is cancelled
      window.location.href = redirectOnCancel
    } else if (onClose) {
      onClose()
    }
  }

  const handleBackdropClick = (e) => {
    // Only close if clicking on backdrop, not modal content
    if (e.target === e.currentTarget && !required) {
      handleCancel()
    }
  }

  return (
    <div className="pos-opening-modal-backdrop" onClick={handleBackdropClick}>
      <div className="pos-opening-modal" role="dialog" aria-modal="true">
        <div className="pos-opening-modal-header">
          <h2>
            <i className="fa-solid fa-cash-register"></i>
            Open POS Opening
          </h2>
          {!required && (
            <button 
              type="button" 
              className="modal-close-btn"
              onClick={handleCancel}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="pos-opening-modal-body">
          {error && (
            <div className="pos-opening-error">
              <i className="fa-solid fa-exclamation-circle"></i>
              {error}
            </div>
          )}

          <div className="pos-opening-info">
            <div className="info-row">
              <span className="info-label">POS Profile:</span>
              <span className="info-value">{posProfile}</span>
            </div>
            <div className="info-row">
              <span className="info-label">User:</span>
              <span className="info-value">{frappe?.session?.user_fullname || frappe?.session?.user}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Date/Time:</span>
              <span className="info-value">{new Date().toLocaleString('id-ID')}</span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="openingAmount">
              Opening Cash Amount
              <span className="optional-label">(optional)</span>
            </label>
            <div className="input-with-prefix">
              <span className="input-prefix">Rp</span>
              <input
                type="number"
                id="openingAmount"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="0"
                min="0"
                step="1000"
                disabled={isSubmitting}
              />
            </div>
            <small className="form-help">
              Enter the cash amount in the drawer at the start of this session
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="modeOfPayment">Mode of Payment</label>
            <select
              id="modeOfPayment"
              value={modeOfPayment}
              onChange={(e) => setModeOfPayment(e.target.value)}
              disabled={isSubmitting || methodsLoading}
            >
              {methodsLoading ? (
                <option>Loading...</option>
              ) : paymentMethods && paymentMethods.length > 0 ? (
                paymentMethods.map((method) => (
                  <option key={method.mode_of_payment} value={method.mode_of_payment}>
                    {method.mode_of_payment}
                    {method.default ? ' (Default)' : ''}
                  </option>
                ))
              ) : (
                <option value="Cash">Cash</option>
              )}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="notes">
              Notes
              <span className="optional-label">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this session..."
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        </form>

        <div className="pos-opening-modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            {required ? 'Go Back' : 'Cancel'}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !posProfile}
          >
            {isSubmitting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Opening...
              </>
            ) : (
              <>
                <i className="fa-solid fa-play"></i>
                Open Opening
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default POSOpeningModal
