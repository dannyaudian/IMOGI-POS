import { useFrappePostCall, useFrappeGetCall } from 'frappe-react-sdk'
import { apiCall } from '@/shared/utils/api'

/**
 * Centralized API calls untuk IMOGI POS
 * Semua API endpoints di sini bisa dipakai oleh counter, kitchen, waiter, dll
 * 
 * PERMANENT FIX: Now uses apiCall() for proper session/CSRF handling
 * and session expiry detection (401/403/417 errors).
 */

/**
 * Hook untuk call Frappe API method
 * Wrapper around useFrappePostCall dengan error handling
 */
export function useImogiAPI(method, onSuccess, onError) {
  return useFrappePostCall(method, {
    onSuccess,
    onError: (error) => {
      console.error(`API Error [${method}]:`, error)
      if (onError) onError(error)
    }
  })
}

/**
 * Call IMOGI POS API
 * NOW USES: Shared apiCall() utility with proper session handling
 * 
 * REPLACES: Direct fetch calls that were causing 417 errors
 * 
 * @param {string} method - Frappe method path
 * @param {Object} args - Method arguments
 * @param {Object} options - Call options (freeze, silent, retry)
 * @returns {Promise} Promise resolving with response data
 */
export async function callImogiAPI(method, args = {}, options = {}) {
  return apiCall(method, args, options)
}

/**
 * Billing API hooks
 */
export function useOrderHistory(posProfile, branch = null, orderType = null) {
  // CRITICAL FIX: Don't make API call if posProfile is null (guard not passed yet)
  // This prevents 417 errors when operational context isn't set
  const shouldFetch = posProfile != null
  
  // pos_profile is now primary, branch is optional for backward compatibility
  const params = shouldFetch ? { pos_profile: posProfile } : null
  if (shouldFetch && branch) {
    params.branch = branch  // Deprecated: for backward compatibility only
  }
  if (shouldFetch && orderType) {
    params.order_type = orderType
  }
  
  return useFrappeGetCall(
    'imogi_pos.api.billing.list_orders_for_cashier',
    params,
    shouldFetch ? `order-history-${posProfile}-${orderType || 'all'}` : null,  // null key = no fetch
    {
      revalidateOnFocus: false,
      refreshInterval: 30000 // Auto refresh every 30 seconds
    }
  )
}

export function useCreateOrder() {
  return useImogiAPI('imogi_pos.api.orders.create_order')
}

export function useUpdateOrder() {
  return useImogiAPI('imogi_pos.api.orders.update_order')
}

export function useSubmitOrder() {
  return useImogiAPI('imogi_pos.api.orders.submit_order')
}

/**
 * Kitchen API hooks
 */
export function useKOTList(kitchen, station = null, posProfile = null) {
  const params = { kitchen }
  if (station) {
    params.station = station
  }
  if (posProfile) {
    params.pos_profile = posProfile
  }
  
  return useFrappeGetCall(
    'imogi_pos.api.kot.get_active_kots',
    params,
    `kot-list-${kitchen}-${station || 'all'}-${posProfile || 'default'}`,
    {
      refreshInterval: 5000, // Auto refresh every 5 seconds
      revalidateOnFocus: true
    }
  )
}

export function useUpdateKOTStatus() {
  return useImogiAPI('imogi_pos.api.kot.update_kot_status')
}

export function useUpdateKOTState() {
  return useImogiAPI('imogi_pos.api.kot.update_kot_state')
}

export function useSendToKitchen() {
  return useImogiAPI('imogi_pos.api.kot.send_to_kitchen')
}

/**
 * Items & Variants API
 */
export function useItems(posProfile, branch = null) {
  // pos_profile is now primary, branch derived from profile on server
  return useFrappeGetCall(
    'imogi_pos.api.items.get_items',
    { pos_profile: posProfile, branch },
    `items-${posProfile}`,
    {
      revalidateOnFocus: false
    }
  )
}

export function useItemVariants(itemCode) {
  return useFrappeGetCall(
    'imogi_pos.api.variants.get_item_variants',
    { item_code: itemCode },
    `variants-${itemCode}`,
    {
      revalidateOnFocus: false
    }
  )
}

/**
 * Customer API
 */
export function useCustomers(searchTerm = '') {
  return useFrappeGetCall(
    'imogi_pos.api.customers.search_customers',
    { search_term: searchTerm },
    `customers-${searchTerm}`,
    {
      revalidateOnFocus: false
    }
  )
}

export function useCreateTableOrder() {
  return useImogiAPI('imogi_pos.api.orders.create_table_order')
}

/**
 * Customer Display Editor API
 */
export function useCustomerDisplayProfiles() {
  return useFrappeGetCall(
    'imogi_pos.api.customer_display_editor.get_available_devices',
    null,
    'customer-display-profiles',
    {
      revalidateOnFocus: false,
      refreshInterval: 30000
    }
  )
}

export function useDisplayTemplates() {
  return useFrappeGetCall(
    'imogi_pos.api.customer_display_editor.get_display_templates',
    null,
    'display-templates',
    {
      revalidateOnFocus: false
    }
  )
}

export function useSaveDisplayConfig() {
  return useImogiAPI('imogi_pos.api.customer_display_editor.save_device_config')
}

export function useResetDisplayConfig() {
  return useImogiAPI('imogi_pos.api.customer_display_editor.reset_device_config')
}

export function useTestDisplay() {
  return useImogiAPI('imogi_pos.api.customer_display_editor.test_device_display')
}

export function useDuplicateProfile() {
  return useImogiAPI('imogi_pos.api.customer_display_editor.duplicate_profile')
}

export function useCreateProfile() {
  return useImogiAPI('imogi_pos.api.customer_display_editor.create_profile')
}

/**
 * Table Management API (untuk restaurant)
 */
export function useTables(posProfile, branch = null) {
  // pos_profile is primary, branch derived from profile on server
  return useFrappeGetCall(
    'imogi_pos.api.layout.get_tables',
    { pos_profile: posProfile, branch },
    `tables-${posProfile}`,
    {
      refreshInterval: 10000, // Auto refresh tiap 10 detik
      revalidateOnFocus: true
    }
  )
}

export function useUpdateTableStatus() {
  return useImogiAPI('imogi_pos.api.layout.update_table_status')
}

/**
 * Cashier API (Phase 2)
 */
export function usePendingOrders(posProfile = null, branch = null, filters = {}) {
  // pos_profile is primary for POS Profile-first architecture
  const params = { pos_profile: posProfile, ...filters }
  if (branch) {
    params.branch = branch  // Deprecated: for backward compatibility
  }
  
  return useFrappeGetCall(
    'imogi_pos.api.cashier.get_pending_orders',
    params,
    `pending-orders-${posProfile || 'all'}`,
    {
      refreshInterval: 10000, // Auto refresh every 10 seconds
      revalidateOnFocus: true
    }
  )
}

export function useOrderDetails(orderName) {
  return useFrappeGetCall(
    'imogi_pos.api.cashier.get_order_details',
    { order_name: orderName },
    `order-details-${orderName}`,
    {
      revalidateOnFocus: true
    }
  )
}

export function useCreateInvoice() {
  return useImogiAPI('imogi_pos.api.cashier.create_invoice_from_order')
}

export function useProcessPayment() {
  return useImogiAPI('imogi_pos.api.cashier.process_payment')
}

export function useCompleteOrder() {
  return useImogiAPI('imogi_pos.api.cashier.complete_order')
}

export function usePaymentMethods(posProfile = null, branch = null) {
  // pos_profile is primary, branch is deprecated fallback
  return useFrappeGetCall(
    'imogi_pos.api.cashier.get_payment_methods',
    { pos_profile: posProfile, branch },
    `payment-methods-${posProfile || 'all'}`,
    {
      revalidateOnFocus: false,
      refreshInterval: 60000 // Refresh every minute
    }
  )
}

export function useSplitBill() {
  return useImogiAPI('imogi_pos.api.cashier.split_bill')
}

/**
 * Customer Display Realtime API (Phase 2)
 */
export function useSendToDisplay() {
  return useImogiAPI('imogi_pos.api.customer_display.send_order_to_display')
}

export function useUpdateDisplayStatus() {
  return useImogiAPI('imogi_pos.api.customer_display.update_display_status')
}

export function useClearDisplay() {
  return useImogiAPI('imogi_pos.api.customer_display.clear_display')
}

export function useDisplayForTable(table) {
  return useFrappeGetCall(
    'imogi_pos.api.customer_display.get_display_for_table',
    { table },
    `display-for-table-${table}`,
    {
      revalidateOnFocus: false
    }
  )
}

export function useShowPaymentProcessing() {
  return useImogiAPI('imogi_pos.api.customer_display.show_payment_processing')
}

export function useShowThankYou() {
  return useImogiAPI('imogi_pos.api.customer_display.show_thank_you')
}
