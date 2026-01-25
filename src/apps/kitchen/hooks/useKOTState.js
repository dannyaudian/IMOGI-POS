import { useState, useCallback } from 'react'
import { useUpdateKOTState } from '@/shared/api/imogi-api'

/**
 * Hook for managing KOT state transitions
 * @param {Function} onStateChanged - Callback after successful state change
 */
export function useKOTState(onStateChanged) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { call: updateKOT } = useUpdateKOTState()

  /**
   * Transition KOT to new state
   * @param {string} kotName - KOT document name
   * @param {string} newState - Target workflow state
   * @param {string} reason - Reason for state change (optional, for cancellation)
   */
  const transitionState = useCallback(async (kotName, newState, reason = null) => {
    setLoading(true)
    setError(null)

    try {
      const result = await updateKOT({
        kot_name: kotName,
        new_state: newState,
        reason: reason
      })

      if (result && result.message) {
        if (onStateChanged) {
          onStateChanged(result.message)
        }
        return result.message
      }
    } catch (err) {
      console.error('Failed to update KOT state:', err)
      setError(err.message || 'Failed to update state')
      throw err
    } finally {
      setLoading(false)
    }
  }, [updateKOT, onStateChanged])

  /**
   * Start preparing KOT (Queued → In Progress)
   */
  const startPreparing = useCallback((kotName) => {
    return transitionState(kotName, 'In Progress')
  }, [transitionState])

  /**
   * Mark KOT as ready (In Progress → Ready)
   */
  const markReady = useCallback((kotName) => {
    return transitionState(kotName, 'Ready')
  }, [transitionState])

  /**
   * Mark KOT as served (Ready → Served)
   */
  const markServed = useCallback((kotName) => {
    return transitionState(kotName, 'Served')
  }, [transitionState])

  /**
   * Return KOT to queue (In Progress → Queued)
   */
  const returnToQueue = useCallback((kotName) => {
    return transitionState(kotName, 'Queued')
  }, [transitionState])

  /**
   * Return KOT to kitchen (Ready → In Progress)
   */
  const returnToKitchen = useCallback((kotName) => {
    return transitionState(kotName, 'In Progress')
  }, [transitionState])

  /**
   * Cancel KOT with reason
   */
  const cancelKOT = useCallback((kotName, reason) => {
    if (!reason || reason.trim().length === 0) {
      setError('Cancellation reason is required')
      return Promise.reject(new Error('Cancellation reason is required'))
    }
    return transitionState(kotName, 'Cancelled', reason)
  }, [transitionState])

  return {
    loading,
    error,
    startPreparing,
    markReady,
    markServed,
    returnToQueue,
    returnToKitchen,
    cancelKOT
  }
}
