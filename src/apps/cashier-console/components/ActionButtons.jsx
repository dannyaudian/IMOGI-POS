import { useState, useEffect } from 'react'

export function ActionButtons({ 
  selectedOrder,
  viewMode,
  onViewChange,
  onNewOrder,
  onPrintBill,
  onSplitBill,
  onRequestPayment,
  posMode,
  selectedTable,
  creatingOrder,
  posProfile,
  branch,
  posOpening,
  branding,
  profileData,
  isCustomerDisplayOpen,
  onOpenCustomerDisplay,
  onCloseCustomerDisplay
}) {
  const hasOrder = !!selectedOrder
  const isCounterMode = posMode === 'Counter'
  const isTableMode = posMode === 'Table'
  const [printerStatus, setPrinterStatus] = useState({ connected: false, checking: true })
  const [showInfo, setShowInfo] = useState(false)

  // Check printer status on mount and periodically
  useEffect(() => {
    checkPrinterStatus()
    const interval = setInterval(checkPrinterStatus, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const checkPrinterStatus = async () => {
    try {
      // Check if ESC/POS printing is available
      if (window.escposPrint && typeof window.escposPrint.getStatus === 'function') {
        const status = await window.escposPrint.getStatus()
        setPrinterStatus({ connected: status.connected || false, checking: false })
      } else {
        setPrinterStatus({ connected: false, checking: false })
      }
    } catch (err) {
      console.warn('[ActionButtons] Printer status check failed:', err)
      setPrinterStatus({ connected: false, checking: false })
    }
  }

  const getPrinterStatusIcon = () => {
    if (printerStatus.checking) {
      return <i className="fa fa-spinner fa-spin" style={{ color: '#6b7280', fontSize: '0.875rem' }}></i>
    }
    return printerStatus.connected 
      ? <i className="fa fa-check-circle" style={{ color: '#10b981', fontSize: '0.875rem' }}></i>
      : <i className="fa fa-exclamation-triangle" style={{ color: '#f59e0b', fontSize: '0.875rem' }}></i>
  }

  const getPrinterStatusText = () => {
    if (printerStatus.checking) return 'Checking...'
    return printerStatus.connected ? 'Printer Ready' : 'Printer Not Connected'
  }

  return (
    <div className="cashier-console-header">
      <div className="header-left">
        {/* Branding Logo */}
        {branding?.logo && (
          <div className="branding-logo">
            <img 
              src={branding.logo} 
              alt={branding.company_name || 'Logo'} 
            />
          </div>
        )}
        
        {/* Mode Badge */}
        <div 
          className="mode-badge" 
          style={{
            backgroundColor: branding?.primary_color || (isCounterMode ? '#ff9800' : '#2196f3')
          }}
        >
          <i className={`fa ${isCounterMode ? 'fa-cash-register' : 'fa-utensils'}`}></i>
          {posMode} Mode
          {selectedTable && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.9 }}>
              | Table: {selectedTable.table_name}
            </span>
          )}
        </div>
        
        {/* POS Info Button */}
        <button 
          className="info-button"
          onClick={() => setShowInfo(!showInfo)}
          title="POS Information"
        >
          <i className="fa fa-info-circle"></i>
        </button>
        
        {/* POS Info Popup */}
        {showInfo && (
          <div className="pos-info-popup">
            <div className="pos-info-header">
              <strong>POS Information</strong>
              <button onClick={() => setShowInfo(false)} className="close-btn">
                <i className="fa fa-times"></i>
              </button>
            </div>
            <div className="pos-info-body">
              <div className="info-row">
                <span className="info-label">POS Profile:</span>
                <span className="info-value">{posProfile || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Branch:</span>
                <span className="info-value">{branch || 'N/A'}</span>
              </div>
              {posOpening && (
                <>
                  <div className="info-row">
                    <span className="info-label">Opening Entry:</span>
                    <span className="info-value">{posOpening.name}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Opening Balance:</span>
                    <span className="info-value">
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0
                      }).format(posOpening.balance_details?.[0]?.opening_amount || 0)}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">User:</span>
                    <span className="info-value">{posOpening.user}</span>
                  </div>
                </>
              )}
              {branding?.company_name && (
                <div className="info-row">
                  <span className="info-label">Company:</span>
                  <span className="info-value">{branding.company_name}</span>
                </div>
              )}
              
              {/* Channel Support */}
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
        
        <div className="view-controls">
          <button 
            className={`view-button ${viewMode === 'orders' ? 'active' : ''}`}
            onClick={() => onViewChange('orders')}
          >
            Orders
          </button>
          <button 
            className={`view-button ${viewMode === 'catalog' ? 'active' : ''}`}
            onClick={() => onViewChange('catalog')}
            disabled={!hasOrder}
          >
            Catalog
          </button>
        </div>
        
        {/* Printer Status Indicator */}
        <div className="printer-status" title={getPrinterStatusText()}>
          {getPrinterStatusIcon()}
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {getPrinterStatusText()}
          </span>
        </div>
      </div>
      
      <div className="action-buttons">
        <button 
          className="action-button primary"
          onClick={() => {
            console.log('[ActionButtons] New Order button clicked')
            onNewOrder?.()
          }}
          disabled={creatingOrder}
        >
          <i className={creatingOrder ? "fa fa-spinner fa-spin" : "fa fa-plus"}></i>
          {creatingOrder ? 'Creating...' : (isCounterMode ? 'New Order' : 'New Table')}
        </button>
        
        <button 
          className={`action-button ${isCustomerDisplayOpen ? 'active' : ''}`}
          onClick={isCustomerDisplayOpen ? onCloseCustomerDisplay : onOpenCustomerDisplay}
          title={isCustomerDisplayOpen ? 'Close Customer Display' : 'Open Customer Display'}
        >
          <i className={`fa ${isCustomerDisplayOpen ? 'fa-eye-slash' : 'fa-desktop'}`}></i>
          Customer Display
        </button>
        
        <button 
          className="action-button"
          disabled={!hasOrder}
          onClick={onPrintBill}
        >
          <i className="fa fa-print"></i>
          Print Bill
        </button>
        
        <button 
          className="action-button"
          disabled={!hasOrder}
          onClick={onSplitBill}
        >
          <i className="fa fa-cut"></i>
          Split Bill
        </button>
        
        <button 
          className="action-button accent"
          disabled={!hasOrder}
          onClick={onRequestPayment}
        >
          <i className="fa fa-credit-card"></i>
          Request Payment
        </button>
      </div>
    </div>
  )
}
