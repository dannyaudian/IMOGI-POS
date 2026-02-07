/**
 * Cashier Console Constants
 * Centralized configuration values
 */

// Timing Constants
export const TIMING = {
  AUTO_REFRESH_OPENING: 30000, // 30s - auto refresh opening status
  GUARD_TIMEOUT: 10000, // 10s - redirect if guard doesn't pass
  DEBOUNCE_SEARCH: 300, // 300ms - debounce search input
  TOAST_DURATION: 3000, // 3s - toast notification duration
  REALTIME_GRACE_PERIOD: 3000, // 3s - grace period before showing reconnecting
  REALTIME_MAX_RECONNECT: 10, // max reconnection attempts
  REALTIME_BASE_DELAY: 1000, // 1s - base delay for exponential backoff
  REALTIME_MAX_DELAY: 32000, // 32s - max delay between reconnects
}

// API Endpoints
export const API = {
  // Cashier Operations
  GET_ACTIVE_OPENING: 'imogi_pos.api.cashier.get_active_opening',
  CREATE_INVOICE_FROM_ORDER: 'imogi_pos.api.cashier.create_invoice_from_order',
  PROCESS_PAYMENT: 'imogi_pos.api.cashier.process_payment',
  COMPLETE_ORDER: 'imogi_pos.api.cashier.complete_order',
  GET_CASHIER_DEVICE_SESSIONS: 'imogi_pos.api.cashier.get_cashier_device_sessions',
  GET_OPENING_SUMMARY: 'imogi_pos.api.cashier.get_opening_summary',
  CLOSE_POS_OPENING: 'imogi_pos.api.cashier.close_pos_opening',
  
  // Order Operations (uses orders.* namespace)
  CREATE_ORDER: 'imogi_pos.api.orders.create_order',
  GET_ORDER: 'imogi_pos.api.orders.get_order',
  ADD_ITEM: 'imogi_pos.api.orders.add_item_to_order',
  UPDATE_ITEM_QTY: 'imogi_pos.api.orders.update_item_qty',
  REMOVE_ITEM: 'imogi_pos.api.orders.remove_item',
  
  // Variant Operations
  GET_ITEM_GROUPS: 'imogi_pos.api.variants.get_item_groups',
  GET_POS_ITEMS: 'imogi_pos.api.items.get_pos_items',  // Unified API for item retrieval
  GET_ITEM_VARIANTS: 'imogi_pos.api.variants.get_item_variants',
  CHOOSE_VARIANT: 'imogi_pos.api.variants.choose_variant_for_order_item',
  
  // Table Operations
  GET_TABLES: 'imogi_pos.api.table.get_tables',
  
  // Public/Common Operations
  GET_BRANDING: 'imogi_pos.api.public.get_branding',
  
  // Printing Operations
  PRINT_BILL: 'imogi_pos.api.cashier.print_bill',
  PRINT_KOT: 'imogi_pos.api.cashier.print_kot',
  CHECK_PRINTER: 'imogi_pos.api.cashier.check_printer_status',
}

// UI Constants
export const UI = {
  SIDEBAR_WIDTH: 320, // px
  ORDER_CARD_HEIGHT: 120, // px
  MIN_TOUCH_TARGET: 44, // px - minimum for iOS
  CATALOG_GRID_MIN_WIDTH: 150, // px
  TABLE_GRID_MIN_WIDTH: 100, // px
}

// Order Types
export const ORDER_TYPES = {
  COUNTER: 'Counter',
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
  SELF_ORDER: 'Self Order',
  KIOSK: 'Kiosk',
}

// Order Status
export const ORDER_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

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
