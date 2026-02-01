import React from 'react'
import { getModulePriority } from '../utils/moduleRules'
import { getModuleStatusBadges, isModuleAccessible } from '../utils/moduleUtils'

function ModuleCard({ module, onClick, posOpeningStatus, isNavigating, isLoading }) {
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

  // Get module priority and badges
  const priority = getModulePriority(module.type)
  const badges = getModuleStatusBadges(module, posOpeningStatus)
  const isAccessible = isModuleAccessible(module, posOpeningStatus)
  const needsOpening = module.requires_opening && !posOpeningStatus?.hasOpening
  const isDisabled = !isAccessible || isNavigating

  return (
    <div 
      className={`module-card module-card--${priority} ${getModuleColor(module.type)} ${!isAccessible ? 'module-locked' : ''} ${isNavigating ? 'module-navigating' : ''} ${isLoading ? 'module-loading' : ''}`}
      onClick={!isDisabled ? onClick : undefined}
      role="button"
      tabIndex={!isDisabled ? 0 : -1}
      onKeyDown={(e) => !isDisabled && e.key === 'Enter' && onClick()}
      title={needsOpening ? 'Please open a POS opening first' : isNavigating ? 'Navigation in progress...' : ''}
    >
      <div className="module-icon">
        {isLoading ? (
          <div className="loading-spinner"></div>
        ) : (
          <>
            <i className={`fa-solid ${getModuleIcon(module.type)}`}></i>
            {needsOpening && (
              <div className="module-lock-overlay">
                <i className="fa-solid fa-lock"></i>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="module-content">
        <h3 className="module-name">{module.name}</h3>
        <p className="module-description">{module.description}</p>
        
        {/* Only show badges if there are constraints */}
        {badges.length > 0 && (
          <div className="module-badges">
            {badges.map((badge, idx) => (
              <div key={idx} className={`module-badge module-badge--${badge.tone}`}>
                {badge.icon && <i className={`fa-solid ${badge.icon}`}></i>}
                {badge.text}
              </div>
            ))}
          </div>
        )}
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
