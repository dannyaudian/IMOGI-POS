/**
 * ⚠️  DEPRECATED - DO NOT USE
 * All constants moved to src/shared/api/constants.js
 * 
 * This file is kept only for reference. Use:
 *   import { API, TIMING, ... } from '@/shared/api/constants'
 */

// Export from unified source (named exports to avoid circular imports)
export {
  API,
  TIMING,
  UI,
  ORDER_TYPES,
  ORDER_STATUS,
  ITEM_MODES,
  MODULE_ICONS,
  MODULE_COLORS,
  MODULE_PRIORITY,
  MODULE_DEFAULTS,
  ERRORS,
  LINKS,
  REALTIME,
} from '@/shared/api/constants'

// Payment Methods
export const PAYMENT_METHODS = {
  CASH: 'Cash',
  CARD: 'Card',
  QRIS: 'QRIS',
  WALLET: 'E-Wallet',
}

// View Modes
export const VIEW_MODES = {
  ORDERS: 'orders',
  CATALOG: 'catalog',
  PAYMENT: 'payment',
  SPLIT: 'split',
  SUMMARY: 'summary',
  CLOSE: 'close',
}

// POS Modes
export const POS_MODES = {
  COUNTER: 'Counter',
  TABLE: 'Table',
}

// Keyboard Shortcuts
export const SHORTCUTS = {
  CATALOG: '/',
  PAYMENT: 'F2',
  TOGGLE_VIEW: 'F3',
  NEW_ORDER: 'ctrl+n',
  ESCAPE: 'Escape',
  SEARCH: 'ctrl+f',
}

// Filter Options
export const FILTERS = {
  ALL: 'all',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PAID: 'paid',
}

// Color Themes
export const COLORS = {
  COUNTER_GRADIENT: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
  TABLE_GRADIENT: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
  PRIMARY: '#667eea',
  SUCCESS: '#22c55e',
  ERROR: '#ef4444',
  WARNING: '#f59e0b',
}

// Quick Cash Amounts
export const QUICK_CASH = [
  10000, 20000, 50000, 100000, 200000, 500000
]

// Error Messages
export const ERROR_MESSAGES = {
  NO_OPENING: 'Tidak ada POS Opening aktif. Silakan buka POS terlebih dulu.',
  INSUFFICIENT_CASH: 'Insufficient cash amount',
  PAYMENT_FAILED: 'Payment processing failed',
  INVOICE_FAILED: 'Failed to create invoice',
  ORDER_CREATE_FAILED: 'Failed to create order',
  ITEM_ADD_FAILED: 'Failed to add item to order',
  NETWORK_ERROR: 'Network error. Please check your connection.',
}
