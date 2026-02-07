/**
 * UNIFIED API & UI Constants
 * Single source of truth untuk semua modules
 * 
 * Usage:
 *   import { API, TIMING, UI, ORDER_TYPES, ORDER_STATUS, MODULE_ICONS } from '@/shared/api/constants'
 *   
 *   const response = await apiCall(API.GET_POS_ITEMS, params)
 */

// ============================================================================
// TIMING CONSTANTS - Shared across all modules
// ============================================================================
export const TIMING = {
  // Auto-refresh intervals
  AUTO_REFRESH_OPENING: 30000, // 30s - auto refresh opening status
  GUARD_TIMEOUT: 10000, // 10s - redirect if guard doesn't pass
  DEBOUNCE_SEARCH: 300, // 300ms - debounce search input
  TOAST_DURATION: 3000, // 3s - toast notification duration
  REALTIME_GRACE_PERIOD: 3000, // 3s - grace period before showing reconnecting
  
  // Reconnection behavior
  REALTIME_MAX_RECONNECT: 10, // max reconnection attempts
  REALTIME_BASE_DELAY: 1000, // 1s - base delay for exponential backoff
  REALTIME_MAX_DELAY: 32000, // 32s - max delay between reconnects
  
  // Module Select timing
  NAVIGATION_DELAY: 100, // ms delay before navigation
  GRACE_PERIOD: 3000, // ms before showing disconnect banner
  RECONNECT_DELAY: 1000, // Initial reconnect delay
  RECONNECT_DELAY_MAX: 5000, // Max reconnect delay
  MAX_RECONNECT_ATTEMPTS: 5, // Max reconnection attempts
}

// ============================================================================
// API ENDPOINTS - Unified for all modules
// ============================================================================
export const API = {
  // Cashier Operations
  GET_ACTIVE_OPENING: 'imogi_pos.api.cashier.get_active_opening',
  CREATE_INVOICE_FROM_ORDER: 'imogi_pos.api.cashier.create_invoice_from_order',
  PROCESS_PAYMENT: 'imogi_pos.api.cashier.process_payment',
  COMPLETE_ORDER: 'imogi_pos.api.cashier.complete_order',
  GET_CASHIER_DEVICE_SESSIONS: 'imogi_pos.api.cashier.get_cashier_device_sessions',
  GET_OPENING_SUMMARY: 'imogi_pos.api.cashier.get_opening_summary',
  CLOSE_POS_OPENING: 'imogi_pos.api.cashier.close_pos_opening',
  PRINT_BILL: 'imogi_pos.api.cashier.print_bill',
  PRINT_KOT: 'imogi_pos.api.cashier.print_kot',
  CHECK_PRINTER: 'imogi_pos.api.cashier.check_printer_status',
  
  // Order Operations
  CREATE_ORDER: 'imogi_pos.api.orders.create_order',
  UPDATE_ORDER: 'imogi_pos.api.orders.update_order',
  SUBMIT_ORDER: 'imogi_pos.api.orders.submit_order',
  CREATE_TABLE_ORDER: 'imogi_pos.api.orders.create_table_order',
  GET_ORDER: 'imogi_pos.api.orders.get_order',
  ADD_ITEM: 'imogi_pos.api.orders.add_item_to_order',
  UPDATE_ITEM_QTY: 'imogi_pos.api.orders.update_item_qty',
  REMOVE_ITEM: 'imogi_pos.api.orders.remove_item',
  
  // Billing Operations
  LIST_ORDERS_FOR_CASHIER: 'imogi_pos.api.billing.list_orders_for_cashier',
  
  // KOT (Kitchen Order Ticket) Operations
  GET_ACTIVE_KOTS: 'imogi_pos.api.kot.get_active_kots',
  UPDATE_KOT_STATUS: 'imogi_pos.api.kot.update_kot_status',
  UPDATE_KOT_STATE: 'imogi_pos.api.kot.update_kot_state',
  SEND_TO_KITCHEN: 'imogi_pos.api.kot.send_to_kitchen',
  
  // Cashier Operations (Advanced)
  GET_PENDING_ORDERS: 'imogi_pos.api.cashier.get_pending_orders',
  GET_ORDER_DETAILS: 'imogi_pos.api.cashier.get_order_details',
  GET_PAYMENT_METHODS: 'imogi_pos.api.cashier.get_payment_methods',
  SPLIT_BILL: 'imogi_pos.api.cashier.split_bill',
  
  // Item & Variant Operations (UNIFIED - only use get_pos_items)
  GET_POS_ITEMS: 'imogi_pos.api.items.get_pos_items', // ← MAIN: supports modes: sellable/template/variant
  GET_ITEM_GROUPS: 'imogi_pos.api.variants.get_item_groups',
  GET_ITEM_VARIANTS: 'imogi_pos.api.variants.get_item_variants',
  CHOOSE_VARIANT: 'imogi_pos.api.variants.choose_variant_for_order_item',
  SEARCH_CUSTOMERS: 'imogi_pos.api.customers.search_customers',
  
  // Table Operations
  GET_TABLES: 'imogi_pos.api.layout.get_tables',
  UPDATE_TABLE_STATUS: 'imogi_pos.api.layout.update_table_status',
  
  // Customer Display Editor Operations
  GET_AVAILABLE_DEVICES: 'imogi_pos.api.customer_display_editor.get_available_devices',
  GET_DISPLAY_TEMPLATES: 'imogi_pos.api.customer_display_editor.get_display_templates',
  SAVE_DEVICE_CONFIG: 'imogi_pos.api.customer_display_editor.save_device_config',
  RESET_DEVICE_CONFIG: 'imogi_pos.api.customer_display_editor.reset_device_config',
  TEST_DEVICE_DISPLAY: 'imogi_pos.api.customer_display_editor.test_device_display',
  DUPLICATE_PROFILE: 'imogi_pos.api.customer_display_editor.duplicate_profile',
  CREATE_PROFILE: 'imogi_pos.api.customer_display_editor.create_profile',
  
  // Customer Display (Realtime) Operations
  SEND_ORDER_TO_DISPLAY: 'imogi_pos.api.customer_display.send_order_to_display',
  UPDATE_DISPLAY_STATUS: 'imogi_pos.api.customer_display.update_display_status',
  CLEAR_DISPLAY: 'imogi_pos.api.customer_display.clear_display',
  GET_DISPLAY_FOR_TABLE: 'imogi_pos.api.customer_display.get_display_for_table',
  SHOW_PAYMENT_PROCESSING: 'imogi_pos.api.customer_display.show_payment_processing',
  SHOW_THANK_YOU: 'imogi_pos.api.customer_display.show_thank_you',
  
  // Module Select Operations
  GET_AVAILABLE_MODULES: 'imogi_pos.api.module_select.get_available_modules',
  
  // Branch & Configuration
  SET_USER_BRANCH: 'imogi_pos.api.public.set_user_branch',
  
  // Public/Branding
  GET_BRANDING: 'imogi_pos.api.public.get_branding',
}

// ============================================================================
// UI CONSTANTS - Layout & sizing
// ============================================================================
export const UI = {
  // Layout dimensions
  SIDEBAR_WIDTH: 320, // px
  ORDER_CARD_HEIGHT: 120, // px
  MIN_TOUCH_TARGET: 44, // px - minimum for iOS/Android accessibility
  CATALOG_GRID_MIN_WIDTH: 150, // px
  TABLE_GRID_MIN_WIDTH: 100, // px
  HEADER_ICON_SIZE: 36, // px
  
  // Skeleton loading
  SKELETON_GRID_ITEMS: 6, // Number of skeleton items in grid
}

// ============================================================================
// ORDER TYPE CONSTANTS
// ============================================================================
export const ORDER_TYPES = {
  COUNTER: 'Counter',
  DINE_IN: 'Dine In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
  SELF_ORDER: 'Self Order',
  KIOSK: 'Kiosk',
}

// ============================================================================
// ORDER STATUS CONSTANTS
// ============================================================================
export const ORDER_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

// ============================================================================
// MODULE ICONS & COLORS (Module Select UI)
// ============================================================================
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

export const MODULE_DEFAULTS = {
  ICON: 'fa-box',
  COLOR: 'color-default',
}

// ============================================================================
// ITEM MODES - For get_pos_items() calls
// ============================================================================
export const ITEM_MODES = {
  SELLABLE: 'sellable', // Non-variant items only (has_variants=0)
  TEMPLATE: 'template', // Templates + standalone items (for catalog display)
  VARIANT: 'variant', // Variants of specific template (requires item_code)
}

// ============================================================================
// Error handling constants
// ============================================================================
export const ERRORS = {
  RETRY_COUNT: 1,
  SHOULD_RETRY_ON_ERROR: false,
}

// ============================================================================
// External Links (Module Select)
// ============================================================================
export const LINKS = {
  HELP_DOCS: 'https://docs.frappe.io/frappe/user-manual',
  LOGOUT_URL: '/api/method/logout',
  USER_PROFILE_URL: '/app/user-profile',
  DESK_HOME_URL: '/app',
}

// ============================================================================
// Realtime Socket Configuration
// ============================================================================
export const REALTIME = {
  RECONNECTION_FACTOR: 0.5, // Jitter factor for reconnection
}
