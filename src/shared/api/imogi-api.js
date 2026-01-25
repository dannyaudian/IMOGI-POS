import { useFrappePostCall, useFrappeGetCall } from 'frappe-react-sdk'

/**
 * Centralized API calls untuk IMOGI POS
 * Semua API endpoints di sini bisa dipakai oleh counter, kitchen, waiter, dll
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
 * Call IMOGI POS API dengan fetch
 * Alternative untuk component yang tidak menggunakan hooks
 */
export async function callImogiAPI(method, args = {}) {
  const response = await fetch('/api/method/' + method, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': window.FRAPPE_CSRF_TOKEN || '',
    },
    credentials: 'include',
    body: JSON.stringify(args),
  })

  const data = await response.json()
  
  if (data.exc) {
    throw new Error(data.exc)
  }
  
  return data.message
}

/**
 * Billing API hooks
 */
export function useOrderHistory(branch, posProfile, orderType = null) {
  const params = { branch, pos_profile: posProfile }
  if (orderType) {
    params.order_type = orderType
  }
  
  return useFrappeGetCall(
    'imogi_pos.api.billing.list_orders_for_cashier',
    params,
    `order-history-${branch}-${posProfile}-${orderType || 'all'}`,
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
export function useKOTList(kitchen, station = null) {
  const params = { kitchen }
  if (station) {
    params.station = station
  }
  
  return useFrappeGetCall(
    'imogi_pos.api.kot.get_active_kots',
    params,
    `kot-list-${kitchen}-${station || 'all'}`,
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
export function useItems(branch, posProfile) {
  return useFrappeGetCall(
    'imogi_pos.api.items.get_items',
    { branch, pos_profile: posProfile },
    `items-${branch}-${posProfile}`,
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

**
 * Table Management API (untuk restaurant)
 */
export function useTables(branch) {
  return useFrappeGetCall(
    'imogi_pos.api.layout.get_tables',
    { branch },
    `tables-${branch}`,
    {
      refreshInterval: 10000, // Auto refresh tiap 10 detik
      revalidateOnFocus: true
    }
  )
}

export function useUpdateTableStatus() {
  return useImogiAPI('imogi_pos.api.layout.update_table_status')
}
