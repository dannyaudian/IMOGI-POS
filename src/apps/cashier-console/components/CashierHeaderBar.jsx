/**
 * Cashier Header Component
 * 
 * Top navigation bar with:
 * - Branch & POS Profile info
 * - Shift status
 * - Network status
 * - Action buttons (Summary, Close Shift)
 */

import React from 'react'
import { useCashierContext } from '../context/CashierContext'
import { CashierHeader as CashierHeaderUI } from './CashierHeader'
import { NetworkStatus } from '@/shared/components/NetworkStatus'

export function CashierHeaderBar() {
  const {
    posProfile,
    branch,
    posMode,
    effectiveOpening,
    branding,
    setShowSummary,
    setShowCloseShift
  } = useCashierContext()

  return (
    <header className="cashier-header">
      <div className="cashier-header-container">
        {/* Original CashierHeader component */}
        <CashierHeaderUI
          branding={branding}
          posProfile={posProfile}
          branch={branch}
          posMode={posMode}
          effectiveOpening={effectiveOpening}
        />

        {/* Network Status */}
        <div className="cashier-header-status">
          <NetworkStatus />
        </div>

        {/* Action buttons */}
        <div className="cashier-header-actions">
          <button
            className="cashier-btn-summary"
            onClick={() => setShowSummary(true)}
            title="Shift Summary"
          >
            <i className="fa-solid fa-chart-bar"></i> Summary
          </button>
          
          <button
            className="cashier-btn-close-shift"
            onClick={() => setShowCloseShift(true)}
            title="Close Shift"
          >
            <i className="fa-solid fa-power-off"></i> Close Shift
          </button>
        </div>
      </div>
    </header>
  )
}
