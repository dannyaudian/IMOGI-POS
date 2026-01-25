import React from 'react'

/**
 * CashierHeader Component
 * Top header with cashier session info
 */
export function CashierHeader({ cashier, pendingCount, branch }) {
  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="cashier-header">
      <div className="header-left">
        <h1>💰 Cashier Console</h1>
        {branch && <span className="header-branch">{branch}</span>}
      </div>

      <div className="header-center">
        {pendingCount > 0 && (
          <div className="pending-badge">
            <span className="badge-count">{pendingCount}</span>
            <span className="badge-label">Pending</span>
          </div>
        )}
      </div>

      <div className="header-right">
        <div className="header-time">{currentTime}</div>
        {cashier && (
          <div className="header-user">
            <span className="user-icon">👤</span>
            <span className="user-name">{cashier}</span>
          </div>
        )}
      </div>
    </div>
  )
}
