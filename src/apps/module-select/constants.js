/**
 * Module Select Constants
 * Centralized configuration values for maintainability
 */

// Timing Constants
export const TIMING = {
  NAVIGATION_DELAY: 100, // ms delay before navigation
  GRACE_PERIOD: 3000, // ms before showing disconnect banner
  RECONNECT_DELAY: 1000, // Initial reconnect delay
  RECONNECT_DELAY_MAX: 5000, // Max reconnect delay
  MAX_RECONNECT_ATTEMPTS: 5, // Max reconnection attempts
}

// UI Constants
export const UI = {
  MIN_TOUCH_TARGET: 44, // Minimum touch target size (px) for mobile
  HEADER_ICON_SIZE: 36, // Header icon/button size (px)
  SKELETON_GRID_ITEMS: 6, // Number of skeleton items in grid
}

// API Constants
export const API = {
  // Module Select Operations
  GET_AVAILABLE_MODULES: 'imogi_pos.api.module_select.get_available_modules',
  METHOD: 'imogi_pos.api.module_select.get_available_modules', // Alias for backward compatibility
  
  // Session Management
  GET_CASHIER_DEVICE_SESSIONS: 'imogi_pos.api.cashier.get_cashier_device_sessions',
  
  // Branch Management
  SET_USER_BRANCH: 'imogi_pos.api.public.set_user_branch',
  
  // Configuration
  ERROR_RETRY_COUNT: 1,
  SHOULD_RETRY_ON_ERROR: false,
}

// Module Icons Mapping
export const MODULE_ICONS = {
  'cashier': 'fa-cash-register',
  'cashier-payment': 'fa-money-bill-wave',
  'waiter': 'fa-server',
  'kiosk': 'fa-tablet',
  'kitchen': 'fa-fire',
  'self-order': 'fa-shopping-bag',
  'customer-display': 'fa-tv',
  'table-display': 'fa-th',
  'table-editor': 'fa-edit',
  'device-select': 'fa-mobile',
}

// Module Color Classes
export const MODULE_COLORS = {
  'cashier': 'color-cashier',
  'cashier-payment': 'color-cashier-payment',
  'waiter': 'color-waiter',
  'kiosk': 'color-kiosk',
  'kitchen': 'color-kitchen',
  'self-order': 'color-selforder',
  'customer-display': 'color-display',
  'table-display': 'color-table',
  'table-editor': 'color-editor',
  'device-select': 'color-device',
}

// Default Fallbacks
export const DEFAULTS = {
  MODULE_ICON: 'fa-box',
  MODULE_COLOR: 'color-default',
}

// Realtime Socket Configuration
export const REALTIME = {
  RECONNECTION_FACTOR: 0.5, // Jitter factor for reconnection
}

// External Links
export const LINKS = {
  HELP_DOCS: 'https://docs.frappe.io/frappe/user-manual',
  LOGOUT_URL: '/api/method/logout',
  USER_PROFILE_URL: '/app/user-profile',
  DESK_HOME_URL: '/app',
}

// Module Priority Mapping
export const MODULE_PRIORITY = {
  'cashier': 'critical',
  'cashier-payment': 'critical',
  'waiter': 'high',
  'kiosk': 'high',
  'kitchen': 'medium',
  'self-order': 'medium',
  'customer-display': 'low',
  'table-display': 'low',
  'table-editor': 'low',
  'device-select': 'low',
}
