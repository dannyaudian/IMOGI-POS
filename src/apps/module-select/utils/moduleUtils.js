/**
 * Module Utilities: Filtering, Sorting, and Status Logic
 */

import { getModulePriority, isModuleVisibleForRoles } from './moduleRules'

const PRIORITY_ORDER = { 
  primary: 0, 
  secondary: 1, 
  tertiary: 2 
}

/**
 * Get filtered and sorted list of modules based on user roles
 * Primary modules appear first, then sorted alphabetically within each priority
 * 
 * @param {Array} modules - List of module objects
 * @param {string[]} userRoles - Array of user role names
 * @returns {Array} Filtered and sorted modules
 */
export function getVisibleModules(modules = [], userRoles = []) {
  return modules
    .filter((module) => isModuleVisibleForRoles(module.type, userRoles))
    .sort((a, b) => {
      // Sort by priority first
      const priorityA = PRIORITY_ORDER[getModulePriority(a.type)] ?? 99
      const priorityB = PRIORITY_ORDER[getModulePriority(b.type)] ?? 99
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }
      
      // Within same priority, sort alphabetically
      return (a.name || '').localeCompare(b.name || '')
    })
}

/**
 * Get status badges for a module
 * Only returns badges when there's a constraint (not "Always Available")
 * 
 * @param {Object} module - Module object
 * @param {Object} posOpeningStatus - POS opening status object
 * @returns {Array} Array of badge objects with { tone, text }
 */
export function getModuleStatusBadges(module, posOpeningStatus = {}) {
  const badges = []

  // Check if module requires POS opening
  if (module.requires_opening) {
    if (posOpeningStatus.hasOpening) {
      // Opening is active - show success badge
      badges.push({ 
        tone: 'success', 
        text: 'Session Active',
        icon: 'fa-check-circle'
      })
    } else {
      // Opening required but not active - show warning
      badges.push({ 
        tone: 'warning', 
        text: 'Requires Opening',
        icon: 'fa-exclamation-circle'
      })
    }
  }

  // Check if module requires specific session
  if (module.requires_session && !module.requires_opening) {
    badges.push({ 
      tone: 'neutral', 
      text: 'Requires Session',
      icon: 'fa-user-clock'
    })
  }

  // Check if module requires POS profile (but not covered by opening)
  if (module.requires_pos_profile && !module.requires_opening) {
    badges.push({ 
      tone: 'neutral', 
      text: 'POS Profile Required',
      icon: 'fa-id-card'
    })
  }

  // Check access restrictions (default to true if not specified)
  const hasAccess = module.has_access !== undefined ? module.has_access : true
  if (hasAccess === false) {
    badges.push({ 
      tone: 'danger', 
      text: 'No Access',
      icon: 'fa-ban'
    })
  }

  // Check if inactive (default to true if not specified)
  const isActive = module.is_active !== undefined ? module.is_active : true
  if (isActive === false) {
    badges.push({ 
      tone: 'danger', 
      text: 'Inactive',
      icon: 'fa-times-circle'
    })
  }

  // If no badges, module is freely available - don't show "Always Available"
  return badges
}

/**
 * Check if module is accessible (can be clicked)
 * @param {Object} module - Module object
 * @param {Object} posOpeningStatus - POS opening status object
 * @returns {boolean} Whether module is accessible
 */
export function isModuleAccessible(module, posOpeningStatus = {}) {
  // Check basic access flags (default to true if not specified)
  const hasAccess = module.has_access !== undefined ? module.has_access : true
  const isActive = module.is_active !== undefined ? module.is_active : true
  
  if (hasAccess === false) return false
  if (isActive === false) return false
  
  // Check POS opening requirement
  if (module.requires_opening && !posOpeningStatus.hasOpening) {
    return false
  }
  
  return true
}
