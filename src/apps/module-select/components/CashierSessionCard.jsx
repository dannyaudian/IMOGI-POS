import React from 'react'

/**
 * CashierSessionCard - Displays a single POS cashier session
 * 
 * Shows:
 * - Cashier name (user who opened the session)
 * - Session start time (period_start_date)
 * - Opening balance
 * - Session status
 * 
 * Used in multi-session mode where one POS Profile can have multiple concurrent openings.
 */
function CashierSessionCard({ 
  session, 
  onClick, 
  isNavigating = false, 
  isLoading = false,
  isSelected = false 
}) {
  
  if (!session) {
    return null
  }

  const {
    name,
    user,
    period_start_date,
    opening_balance,
    status,
    company
  } = session

  // Format display values
  const startTime = period_start_date ? new Date(period_start_date).toLocaleString() : 'Unknown'
  const balance = opening_balance ? parseFloat(opening_balance).toFixed(2) : '0.00'
  const isOpen = status === 'Open'

  // Determine card state
  const isDisabled = !isOpen || isNavigating || isLoading

  return (
    <div 
      className={`cashier-session-card ${!isOpen ? 'session-closed' : 'session-open'} ${isNavigating ? 'session-navigating' : ''} ${isLoading ? 'session-loading' : ''} ${isSelected ? 'session-selected' : ''}`}
      onClick={!isDisabled ? onClick : undefined}
      role="button"
      tabIndex={!isDisabled ? 0 : -1}
      onKeyDown={(e) => !isDisabled && e.key === 'Enter' && onClick()}
      title={!isOpen ? 'This session is closed' : isNavigating ? 'Opening cashier console...' : ''}
    >
      {/* Session Icon / Status Indicator */}
      <div className="session-icon">
        {isLoading ? (
          <div className="session-loading-spinner"></div>
        ) : (
          <>
            <i className={`fa-solid ${isOpen ? 'fa-cash-register' : 'fa-ban'}`}></i>
            {!isOpen && (
              <div className="session-lock-overlay">
                <i className="fa-solid fa-lock"></i>
              </div>
            )}
          </>
        )}
      </div>

      {/* Session Information */}
      <div className="session-content">
        {/* Cashier Name */}
        <h3 className="session-cashier">
          <i className="fa-solid fa-user"></i>
          {user || 'Unknown Cashier'}
        </h3>

        {/* Session Metadata */}
        <div className="session-details">
          {/* Session ID */}
          <div className="session-detail-row">
            <span className="session-detail-label">Session:</span>
            <span className="session-detail-value">{name}</span>
          </div>

          {/* Start Time */}
          <div className="session-detail-row">
            <span className="session-detail-label">Started:</span>
            <span className="session-detail-value">{startTime}</span>
          </div>

          {/* Opening Balance */}
          <div className="session-detail-row">
            <span className="session-detail-label">Opening Balance:</span>
            <span className="session-detail-value session-balance">{balance}</span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="session-badges">
          <div className={`session-badge ${isOpen ? 'badge-success' : 'badge-danger'}`}>
            <i className={`fa-solid ${isOpen ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
            {isOpen ? 'Active' : 'Closed'}
          </div>
        </div>
      </div>

      {/* Navigation Arrow */}
      <div className="session-arrow">
        {isOpen ? (
          <i className="fa-solid fa-arrow-right"></i>
        ) : (
          <i className="fa-solid fa-lock"></i>
        )}
      </div>
    </div>
  )
}

export default CashierSessionCard
