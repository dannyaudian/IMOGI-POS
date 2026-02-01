/**
 * Module Rules: Priority & Role-based Visibility
 * 
 * Defines which modules are primary/secondary/tertiary
 * and which user roles can access each module.
 */

export const MODULE_PRIORITIES = {
  cashier: 'primary',
  'cashier-payment': 'primary',
  waiter: 'primary',
  kitchen: 'secondary',
  kiosk: 'tertiary',
  'self-order': 'tertiary',
  'table-display': 'tertiary',
  'customer-display': 'tertiary',
  'table-editor': 'tertiary',
  'device-select': 'tertiary',
}

/**
 * Role-based module visibility rules
 * If a module is not listed here, it's visible to all roles
 */
export const MODULE_ROLE_RULES = {
  cashier: [
    'Cashier',
    'System Manager',
    'Restaurant Manager',
    'Branch Manager',
  ],
  'cashier-payment': [
    'Cashier',
    'System Manager',
    'Restaurant Manager',
    'Branch Manager',
  ],
  waiter: [
    'Waiter',
    'System Manager',
    'Restaurant Manager',
    'Branch Manager',
  ],
  kitchen: [
    'Kitchen Staff',
    'System Manager',
    'Restaurant Manager',
    'Branch Manager',
  ],
  'self-order': [
    'System Manager',
    'Restaurant Manager',
    'Branch Manager',
  ],
  'table-display': [
    'Waiter',
    'Cashier',
    'System Manager',
    'Restaurant Manager',
    'Branch Manager',
  ],
  'customer-display': [
    'Cashier',
    'System Manager',
    'Restaurant Manager',
    'Branch Manager',
  ],
  // kiosk and table-editor - visible to all by default (not in this object)
}

/**
 * Get module priority level
 * @param {string} moduleType - Module type identifier
 * @returns {'primary'|'secondary'|'tertiary'} Priority level
 */
export function getModulePriority(moduleType) {
  return MODULE_PRIORITIES[moduleType] || 'tertiary'
}

/**
 * Check if module should be visible for given user roles
 * @param {string} moduleType - Module type identifier
 * @param {string[]} userRoles - Array of user role names
 * @returns {boolean} Whether module should be visible
 */
export function isModuleVisibleForRoles(moduleType, userRoles = []) {
  // System Manager and Administrator always bypass all restrictions
  const privilegedRoles = ['System Manager', 'Administrator']
  if (userRoles.some((role) => privilegedRoles.includes(role))) {
    return true
  }
  
  const allowedRoles = MODULE_ROLE_RULES[moduleType]
  
  // If no rules defined for this module, it's visible to everyone
  if (!allowedRoles) return true
  
  // Check if user has any of the allowed roles
  return userRoles.some((role) => allowedRoles.includes(role))
}
