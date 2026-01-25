export function ActionButtons({ 
  selectedOrder,
  viewMode,
  onViewChange,
  onNewOrder,
  onPrintBill,
  onSplitBill,
  onRequestPayment
}) {
  const hasOrder = !!selectedOrder

  return (
    <div className="cashier-console-header">
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
        >
          Catalog
        </button>
      </div>
      
      <div className="action-buttons">
        <button 
          className="action-button primary"
          onClick={onNewOrder}
        >
          <i className="fa fa-plus"></i>
          New Order
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
