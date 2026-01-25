import React from 'react'

function ModuleCard({ module, onClick, posOpeningStatus }) {
  const getModuleIcon = (type) => {
    const icons = {
      'cashier': 'fa-cash-register',
      'cashier-payment': 'fa-money-bill-wave',
      'waiter': 'fa-server',
      'kiosk': 'fa-tablet',
      'kitchen': 'fa-fire',
      'self-order': 'fa-shopping-bag',
      'customer-display': 'fa-tv',
      'table-display': 'fa-th',
      'table-editor': 'fa-edit',
      'device-select': 'fa-mobile'
    }
    return icons[type] || 'fa-box'
  }

  const getModuleColor = (type) => {
    const colors = {
      'cashier': 'color-cashier',
      'cashier-payment': 'color-cashier-payment',
      'waiter': 'color-waiter',
      'kiosk': 'color-kiosk',
      'kitchen': 'color-kitchen',
      'self-order': 'color-selforder',
      'customer-display': 'color-display',
      'table-display': 'color-table',
      'table-editor': 'color-editor',
      'device-select': 'color-device'
    }
    return colors[type] || 'color-default'
  }

  // Determine if module is accessible
  const isAccessible = !module.requires_opening || posOpeningStatus?.hasOpening
  const needsOpening = module.requires_opening && !posOpeningStatus?.hasOpening

  return (
    <div 
      className={`module-card ${getModuleColor(module.type)} ${!isAccessible ? 'module-locked' : ''}`}
      onClick={isAccessible ? onClick : undefined}
      role="button"
      tabIndex={isAccessible ? 0 : -1}
      onKeyDown={(e) => isAccessible && e.key === 'Enter' && onClick()}
      title={needsOpening ? 'Please open a POS session first' : ''}
    >
      <div className="module-icon">
        <i className={`fa-solid ${getModuleIcon(module.type)}`}></i>
        {needsOpening && (
          <div className="module-lock-overlay">
            <i className="fa-solid fa-lock"></i>
          </div>
        )}
      </div>
      
      <div className="module-content">
        <h3 className="module-name">{module.name}</h3>
        <p className="module-description">{module.description}</p>
        
        <div className="module-badges">
          {module.requires_opening ? (
            <div className={`module-badge ${posOpeningStatus?.hasOpening ? 'badge-success' : 'badge-warning'}`}>
              <i className={`fa-solid ${posOpeningStatus?.hasOpening ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
              {posOpeningStatus?.hasOpening ? 'Session Active' : 'Needs POS Opening'}
            </div>
          ) : (
            <div className="module-badge badge-info">
              <i className="fa-solid fa-circle-check"></i>
              Always Available
            </div>
          )}
        </div>
      </div>

      <div className="module-arrow">
        {isAccessible ? (
          <i className="fa-solid fa-arrow-right"></i>
        ) : (
          <i className="fa-solid fa-lock"></i>
        )}
      </div>
    </div>
  )
}

export default ModuleCard
