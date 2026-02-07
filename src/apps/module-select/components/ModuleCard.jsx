import React from 'react'
import PropTypes from 'prop-types'
import { getModulePriority } from '../utils/moduleRules'
import { getModuleStatusBadges, isModuleAccessible } from '../utils/moduleUtils'
import { MODULE_ICONS, MODULE_COLORS, MODULE_DEFAULTS } from '@/shared/api/constants'

function ModuleCard({ module, onClick, posOpeningStatus, isNavigating, isLoading }) {
  const getModuleIcon = (type) => MODULE_ICONS[type] || MODULE_DEFAULTS.ICON
  const getModuleColor = (type) => MODULE_COLORS[type] || MODULE_DEFAULTS.COLOR

  // Get module priority and badges
  const priority = getModulePriority(module.type)
  const badges = getModuleStatusBadges(module, posOpeningStatus)
  const isAccessible = isModuleAccessible(module, posOpeningStatus)
  const needsOpening = module.requires_opening && !posOpeningStatus?.hasOpening
  const isDisabled = !isAccessible || isNavigating

  // Handle keyboard interactions
  const handleKeyDown = (e) => {
    if (isDisabled) return
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  const getAriaLabel = () => {
    let label = `${module.name}: ${module.description}`
    if (needsOpening) {
      label += '. Requires POS opening. Please open a POS opening first.'
    } else if (!isAccessible) {
      label += '. Module is currently locked.'
    } else if (isNavigating) {
      label += '. Navigation in progress.'
    }
    return label
  }

  return (
    <div 
      className={`module-card module-card--${priority} ${getModuleColor(module.type)} ${!isAccessible ? 'module-locked' : ''} ${isNavigating ? 'module-navigating' : ''} ${isLoading ? 'module-loading' : ''}`}
      onClick={!isDisabled ? onClick : undefined}
      role="button"
      tabIndex={!isDisabled ? 0 : -1}
      onKeyDown={handleKeyDown}
      aria-label={getAriaLabel()}
      aria-disabled={isDisabled}
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

ModuleCard.propTypes = {
  module: PropTypes.shape({
    type: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    requires_opening: PropTypes.bool,
    requires_pos_profile: PropTypes.bool,
  }).isRequired,
  onClick: PropTypes.func.isRequired,
  posOpeningStatus: PropTypes.shape({
    hasOpening: PropTypes.bool,
    posOpeningEntry: PropTypes.string,
  }),
  isNavigating: PropTypes.bool,
  isLoading: PropTypes.bool,
}

ModuleCard.defaultProps = {
  posOpeningStatus: {},
  isNavigating: false,
  isLoading: false,
}

export default ModuleCard
