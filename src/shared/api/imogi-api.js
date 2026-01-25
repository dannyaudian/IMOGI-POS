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
export function useKOTList(branch, status = 'Pending') {
  return useFrappeGetCall(
    'imogi_pos.api.kot.get_kot_list',
    { branch, status },
    `kot-list-${branch}-${status}`,
    {
      refreshInterval: 5000, // Auto refresh tiap 5 detik
      revalidateOnFocus: true
    }
  )
}

export function useUpdateKOTStatus() {
  return useImogiAPI('imogi_pos.api.kot.update_kot_status')
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

/**
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
