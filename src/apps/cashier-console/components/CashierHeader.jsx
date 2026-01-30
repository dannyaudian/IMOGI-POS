import { useState } from 'react'

export function CashierHeader({
  posMode,
  onModeChange,
  posProfile,
  branch,
  posOpening,
  branding,
  profileData,
  printerStatus,
  onSearchScan
}) {
  const [showInfo, setShowInfo] = useState(false)
  const [scanInput, setScanInput] = useState('')
  const openingEntryName = posOpening?.pos_opening_entry || posOpening?.name
  const openingAmount = posOpening?.balance_details?.[0]?.opening_amount ?? posOpening?.opening_balance ?? 0

  const handleScanSubmit = (e) => {
    e.preventDefault()
    if (scanInput.trim()) {
      onSearchScan?.(scanInput.trim())
      setScanInput('')
    }
  }

  const getPrinterStatusIcon = () => {
    if (printerStatus?.checking) {
      return <i className="fa fa-spinner fa-spin"></i>
    }
    return printerStatus?.connected 
      ? <i className="fa fa-check-circle" style={{ color: '#10b981' }}></i>
      : <i className="fa fa-exclamation-triangle" style={{ color: '#f59e0b' }}></i>
  }

  return (
    <header className="cashier-header">
      <div className="header-container">
        {/* Left: Branding + Context Info */}
        <div className="header-left">
          {branding?.logo && (
            <div className="branding-logo">
              <img 
                src={branding.logo} 
                alt={branding.company_name || 'Logo'} 
              />
            </div>
          )}
          
          <div className="pos-context">
            <div className="pos-context-item">
              <i className="fa fa-building"></i>
              <span>{branch?.name || branch || 'N/A'}</span>
            </div>
            <div className="pos-context-item">
              <i className="fa fa-cash-register"></i>
              <span>{posProfile?.name || posProfile || 'N/A'}</span>
            </div>
          </div>

          {/* Info Button */}
          <button 
            className="info-button"
            onClick={() => setShowInfo(!showInfo)}
            title="POS Information"
            aria-label="Show POS Information"
          >
            <i className="fa fa-info-circle"></i>
          </button>

          {/* POS Info Popup */}
          {showInfo && (
            <div className="pos-info-popup">
              <div className="pos-info-header">
                <strong>POS Information</strong>
                <button 
                  onClick={() => setShowInfo(false)} 
                  className="close-btn"
                  aria-label="Close"
                >
                  <i className="fa fa-times"></i>
                </button>
              </div>
              <div className="pos-info-body">
                <div className="info-row">
                  <span className="info-label">POS Profile:</span>
                  <span className="info-value">{posProfile?.name || posProfile || 'N/A'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Branch:</span>
                  <span className="info-value">{branch?.name || branch || 'N/A'}</span>
                </div>
                {posOpening && (
                  <>
                    <div className="info-row">
                      <span className="info-label">Opening Entry:</span>
                      <span className="info-value">{openingEntryName}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Opening Balance:</span>
                      <span className="info-value">
                        {new Intl.NumberFormat('id-ID', {
                          style: 'currency',
                          currency: 'IDR',
                          minimumFractionDigits: 0
                        }).format(openingAmount)}
                      </span>
                    </div>
                  </>
                )}
                {branding?.company_name && (
                  <div className="info-row">
                    <span className="info-label">Company:</span>
                    <span className="info-value">{branding.company_name}</span>
                  </div>
                )}
                
                <div className="info-section-header">Channels</div>
                <div className="info-row">
                  <span className="info-label">Self Order:</span>
                  <span className="info-value">
                    {profileData?.imogi_enable_self_order === 1 ? (
                      <span style={{ color: '#10b981' }}>✓ Enabled</span>
                    ) : (
                      <span style={{ color: '#6b7280' }}>✗ Disabled</span>
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Kiosk:</span>
                  <span className="info-value">
                    {profileData?.imogi_enable_kiosk === 1 ? (
                      <span style={{ color: '#10b981' }}>✓ Enabled</span>
                    ) : (
                      <span style={{ color: '#6b7280' }}>✗ Disabled</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center: Mode Segmented Control */}
        <div className="header-center">
          <div className="segmented-control">
            <button
              className={`segment ${posMode === 'Counter' ? 'active' : ''}`}
              onClick={() => onModeChange?.('Counter')}
              style={{
                '--active-color': branding?.primary_color || '#ff9800'
              }}
            >
              <i className="fa fa-cash-register"></i>
              <span>Counter</span>
            </button>
            <button
              className={`segment ${posMode === 'Table' ? 'active' : ''}`}
              onClick={() => onModeChange?.('Table')}
              style={{
                '--active-color': branding?.primary_color || '#2196f3'
              }}
            >
              <i className="fa fa-utensils"></i>
              <span>Dine In</span>
            </button>
          </div>
        </div>

        {/* Right: Search/Scan + Printer Status */}
        <div className="header-right">
          <form className="search-scan-form" onSubmit={handleScanSubmit}>
            <input
              type="text"
              placeholder="Scan or search..."
              className="search-scan-input"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
            />
            <button type="submit" className="search-scan-button" aria-label="Search">
              <i className="fa fa-search"></i>
            </button>
          </form>

          <div className="printer-status" title={printerStatus?.connected ? 'Printer Ready' : 'Printer Not Connected'}>
            {getPrinterStatusIcon()}
          </div>
        </div>
      </div>
    </header>
  )
}
