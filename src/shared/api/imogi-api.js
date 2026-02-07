import { useFrappePostCall, useFrappeGetCall } from 'frappe-react-sdk'
import { useEffect, useState } from 'react'
import { apiCall } from '@/shared/utils/api'
import { API } from './constants'

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
  
  // Build params only if shouldFetch
  let params = null
  let cacheKey = null
  
  if (shouldFetch) {
    params = { pos_profile: posProfile }
    if (branch) {
      params.branch = branch  // Deprecated: for backward compatibility only
    }
    if (orderType) {
      params.order_type = orderType
    }
    cacheKey = `order-history-${posProfile}-${orderType || 'all'}`
  }
  
  // IMPORTANT: Pass null for BOTH params AND key to disable fetch completely
  // frappe-react-sdk will not fetch if params is null
  const response = useFrappeGetCall(
    API.LIST_ORDERS_FOR_CASHIER,
    params,  // null = don't fetch
    cacheKey,  // null = no cache key needed
    {
      revalidateOnFocus: false,
      refreshInterval: shouldFetch ? 30000 : 0 // Only auto-refresh if actively fetching
    }
  )

  const [retryCount, setRetryCount] = useState(0)
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 400

  useEffect(() => {
    if (!shouldFetch || !response?.error || retryCount >= MAX_RETRIES) {
      return
    }

    const errorMessage = response.error?.message
      || response.error?.response?.data?.message
      || ''
    const isContextError = errorMessage.includes('Context Required')
      || errorMessage.includes('Operational context')

    if (!isContextError || !response.mutate) {
      return
    }

    const timer = setTimeout(() => {
      setRetryCount((prev) => prev + 1)
      response.mutate()
    }, RETRY_DELAY_MS * (retryCount + 1))

    return () => clearTimeout(timer)
  }, [shouldFetch, response, retryCount])

  useEffect(() => {
    if (response?.data && retryCount > 0) {
      setRetryCount(0)
    }
  }, [response?.data, retryCount])

  return response
}

export function useCreateOrder() {
  return useImogiAPI(API.CREATE_ORDER)
}

export function useUpdateOrder() {
  return useImogiAPI(API.UPDATE_ORDER)
}

export function useSubmitOrder() {
  return useImogiAPI(API.SUBMIT_ORDER)
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
    API.GET_ACTIVE_KOTS,
    params,
    `kot-list-${kitchen}-${station || 'all'}-${posProfile || 'default'}`,
    {
      refreshInterval: 5000, // Auto refresh every 5 seconds
      revalidateOnFocus: true
    }
  )
}

export function useUpdateKOTStatus() {
  return useImogiAPI(API.UPDATE_KOT_STATUS)
}

export function useUpdateKOTState() {
  return useImogiAPI(API.UPDATE_KOT_STATE)
}

export function useSendToKitchen() {
  return useImogiAPI(API.SEND_TO_KITCHEN)
}

/**
 * Items & Variants API
 */
export function useItems(posProfile, branch = null) {
  // CRITICAL FIX: Don't make API call if posProfile is null (guard not passed yet)
  const shouldFetch = posProfile != null
  
  let params = null
  let cacheKey = null
  
  if (shouldFetch) {
    params = { pos_profile: posProfile, branch }
    cacheKey = `items-${posProfile}`
  }
  
  return useFrappeGetCall(
    API.GET_POS_ITEMS,
    params,  // null = don't fetch
    cacheKey,  // null = no cache key
    {
      revalidateOnFocus: false
    }
  )
}

export function useItemVariants(itemCode) {
  return useFrappeGetCall(
    API.GET_ITEM_VARIANTS,
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
    API.SEARCH_CUSTOMERS,
    { search_term: searchTerm },
    `customers-${searchTerm}`,
    {
      revalidateOnFocus: false
    }
  )
}

export function useCreateTableOrder() {
  return useImogiAPI(API.CREATE_TABLE_ORDER)
}

/**
 * Customer Display Editor API
 */
export function useCustomerDisplayProfiles() {
  return useFrappeGetCall(
    API.GET_AVAILABLE_DEVICES,
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
    API.GET_DISPLAY_TEMPLATES,
    null,
    'display-templates',
    {
      revalidateOnFocus: false
    }
  )
}

export function useSaveDisplayConfig() {
  return useImogiAPI(API.SAVE_DEVICE_CONFIG)
}

export function useResetDisplayConfig() {
  return useImogiAPI(API.RESET_DEVICE_CONFIG)
}

export function useTestDisplay() {
  return useImogiAPI(API.TEST_DEVICE_DISPLAY)
}

export function useDuplicateProfile() {
  return useImogiAPI(API.DUPLICATE_PROFILE)
}

export function useCreateProfile() {
  return useImogiAPI(API.CREATE_PROFILE)
}

/**
 * Table Management API (untuk restaurant)
 */
export function useTables(posProfile, branch = null) {
  // CRITICAL FIX: Don't make API call if posProfile is null (guard not passed yet)
  const shouldFetch = posProfile != null
  
  let params = null
  let cacheKey = null
  
  if (shouldFetch) {
    params = { pos_profile: posProfile, branch }
    cacheKey = `tables-${posProfile}`
  }
  
  return useFrappeGetCall(
    API.GET_TABLES,
    params,  // null = don't fetch
    cacheKey,  // null = no cache key
    {
      refreshInterval: shouldFetch ? 10000 : 0, // Only auto-refresh if actively fetching
      revalidateOnFocus: shouldFetch
    }
  )
}

export function useUpdateTableStatus() {
  return useImogiAPI(API.UPDATE_TABLE_STATUS)
}

/**
 * Cashier API (Phase 2)
 */
export function usePendingOrders(posProfile = null, branch = null, filters = {}) {
  // CRITICAL FIX: Don't make API call if posProfile is null (guard not passed yet)
  const shouldFetch = posProfile != null
  
  let params = null
  let cacheKey = null
  
  if (shouldFetch) {
    params = { pos_profile: posProfile, ...filters }
    if (branch) {
      params.branch = branch  // Deprecated: for backward compatibility
    }
    cacheKey = `pending-orders-${posProfile || 'all'}`
  }
  
  return useFrappeGetCall(
    API.GET_PENDING_ORDERS,
    params,  // null = don't fetch
    cacheKey,  // null = no cache key
    {
      refreshInterval: shouldFetch ? 10000 : 0, // Only auto-refresh if actively fetching
      revalidateOnFocus: shouldFetch
    }
  )
}

export function useOrderDetails(orderName) {
  return useFrappeGetCall(
    API.GET_ORDER_DETAILS,
    { order_name: orderName },
    `order-details-${orderName}`,
    {
      revalidateOnFocus: true
    }
  )
}

export function useCreateInvoice() {
  return useImogiAPI(API.CREATE_INVOICE_FROM_ORDER)
}

export function useProcessPayment() {
  return useImogiAPI(API.PROCESS_PAYMENT)
}

export function useCompleteOrder() {
  return useImogiAPI(API.COMPLETE_ORDER)
}

export function usePaymentMethods(posProfile = null, branch = null) {
  // pos_profile is primary, branch is deprecated fallback
  return useFrappeGetCall(
    API.GET_PAYMENT_METHODS,
    { pos_profile: posProfile, branch },
    `payment-methods-${posProfile || 'all'}`,
    {
      revalidateOnFocus: false,
      refreshInterval: 60000 // Refresh every minute
    }
  )
}

export function useSplitBill() {
  return useImogiAPI(API.SPLIT_BILL)
}

/**
 * Customer Display Realtime API (Phase 2)
 */
export function useSendToDisplay() {
  return useImogiAPI(API.SEND_ORDER_TO_DISPLAY)
}

export function useUpdateDisplayStatus() {
  return useImogiAPI(API.UPDATE_DISPLAY_STATUS)
}

export function useClearDisplay() {
  return useImogiAPI(API.CLEAR_DISPLAY)
}

export function useDisplayForTable(table) {
  return useFrappeGetCall(
    API.GET_DISPLAY_FOR_TABLE,
    { table },
    `display-for-table-${table}`,
    {
      revalidateOnFocus: false
    }
  )
}

export function useShowPaymentProcessing() {
  return useImogiAPI(API.SHOW_PAYMENT_PROCESSING)
}

export function useShowThankYou() {
  return useImogiAPI(API.SHOW_THANK_YOU)
}
