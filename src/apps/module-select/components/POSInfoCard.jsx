import React from 'react'

function POSInfoCard({ posData, isLoading }) {
  if (isLoading) {
    return (
      <div className="pos-info-card loading">
        <div className="spinner-small"></div>
        <p>Loading POS info...</p>
      </div>
    )
  }

  if (!posData || !posData.pos_opening_entry) {
    return (
      <div className="pos-info-card no-opening">
        <div className="status-badge inactive">No Active POS</div>
        <p className="pos-message">No POS session opened yet</p>
        {posData?.company && (
          <div className="pos-detail">
            <label>Company</label>
            <p className="pos-value">{posData.company}</p>
          </div>
        )}
        <p className="pos-hint">Open a POS session in Cashier Console</p>
      </div>
    )
  }

  const { pos_opening_entry, pos_profile_name, opening_balance, timestamp, company } = posData

  return (
    <div className="pos-info-card active">
      <div className="status-badge active">Active</div>
      
      {company && (
        <div className="pos-detail">
          <label>Company</label>
          <p className="pos-value">{company}</p>
        </div>
      )}

      <div className="pos-detail">
        <label>Profile</label>
        <p className="pos-value">{pos_profile_name}</p>
      </div>

      <div className="pos-detail">
        <label>Opening Balance</label>
        <p className="pos-value pos-amount">Rp {Number(opening_balance || 0).toLocaleString('id-ID')}</p>
      </div>

      <div className="pos-detail">
        <label>Opened At</label>
        <p className="pos-value">{new Date(timestamp).toLocaleString('id-ID')}</p>
      </div>

      <a href={`/app/pos-opening-entry/${pos_opening_entry}`} className="pos-link">
        View Details →
      </a>
    </div>
  )
}

export default POSInfoCard
