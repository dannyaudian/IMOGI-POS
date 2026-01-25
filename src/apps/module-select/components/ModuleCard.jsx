import React from 'react'

function ModuleCard({ module, onClick }) {
  const getModuleIcon = (type) => {
    const icons = {
      'cashier': 'fa-cash-register',
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

  return (
    <div 
      className={`module-card ${getModuleColor(module.type)}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="module-icon">
        <i className={`fa-solid ${getModuleIcon(module.type)}`}></i>
      </div>
      
      <div className="module-content">
        <h3 className="module-name">{module.name}</h3>
        <p className="module-description">{module.description}</p>
        
        {module.requires_session && (
          <div className="module-badge badge-session">Requires POS Session</div>
        )}
        {module.requires_opening && (
          <div className="module-badge badge-opening">Requires Opening Balance</div>
        )}
      </div>

      <div className="module-arrow">
        <i className="fa-solid fa-arrow-right"></i>
      </div>
    </div>
  )
}

export default ModuleCard
