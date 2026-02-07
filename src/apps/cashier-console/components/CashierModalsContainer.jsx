/**
 * Cashier Modals Container
 * 
 * Renders all modals and overlays:
 * - Variant picker (add items with options)
 * - Table selector (for Dine In orders)
 * - Various view modals
 */

import React from 'react'
import { useCashierContext } from '../context/CashierContext'
import { VariantPickerModal } from './VariantPickerModal'
import { TableSelector } from './TableSelector'
import { apiCall } from '@/shared/utils/api'
import { API } from '@/shared/api/constants'

export function CashierModalsContainer() {
  const {
    showVariantPicker,
    setShowVariantPicker,
    variantPickerContext,
    setVariantPickerContext,
    showTableSelector,
    setShowTableSelector,
    selectedTable,
    setSelectedTable,
    posMode,
    posProfile,
    selectedOrder,
    setSelectedOrder
  } = useCashierContext()

  const showAlert = (opts, secs = 3) => {
    if (window.frappe?.show_alert) {
      window.frappe.show_alert(opts, secs)
    } else if (import.meta.env.DEV) {
      console.warn('[Alert fallback]', opts.message, `(${opts.indicator})`)
    }
  }

  const closeVariantPicker = () => {
    setShowVariantPicker(false)
    setVariantPickerContext(null)
  }

  const handleVariantSelect = async (variantName) => {
    if (!variantPickerContext) return

    const { mode, orderItemRow } = variantPickerContext

    // Guard: variantName wajib ada
    if (!variantName || typeof variantName !== 'string') {
      if (import.meta.env.DEV) {
        console.warn('[CashierModalsContainer] Invalid variantName:', variantName)
      }
      showAlert({
        message: 'Variant tidak valid',
        indicator: 'orange'
      }, 3)
      closeVariantPicker()
      return
    }

    // Guard: only handle convert mode (add mode uses VariantListModal)
    if (mode !== 'convert') {
      if (import.meta.env.DEV) {
        console.warn('[CashierModalsContainer] Unexpected mode:', mode)
      }
      closeVariantPicker()
      return
    }

    // Guard: validate convert prerequisites
    if (!selectedOrder || !orderItemRow) {
      if (import.meta.env.DEV) {
        console.warn('[CashierModalsContainer] Missing selectedOrder/orderItemRow for convert', {
          selectedOrder: !!selectedOrder,
          orderItemRow
        })
      }
      showAlert({
        message: 'Order tidak valid untuk convert variant',
        indicator: 'orange'
      }, 3)
      closeVariantPicker()
      return
    }

    const orderName = selectedOrder.name
      
    try {
      await apiCall(API.CHOOSE_VARIANT, {
        pos_order: orderName,
        order_item_row: orderItemRow,
        variant_item: variantName
      })
      
      showAlert({
        message: 'Variant selected successfully',
        indicator: 'green'
      }, 3)
      
      // Reload order to reflect changes
      const updatedOrder = await apiCall(API.GET_ORDER, {
        order_name: orderName
      })
      
      // Only update if still on same order (prevent race condition)
      if (updatedOrder && orderName === selectedOrder?.name) {
        setSelectedOrder(updatedOrder)
      }
    } catch (err) {
      showAlert({
        message: 'Failed to select variant: ' + (err.message || 'Unknown error'),
        indicator: 'red'
      }, 5)
    }

    closeVariantPicker()
  }

  return (
    <>
      {showVariantPicker && variantPickerContext?.templateName && (
        <VariantPickerModal
          isOpen={showVariantPicker}
          templateName={variantPickerContext.templateName}
          posProfile={posProfile}
          mode={variantPickerContext.mode || 'add'}
          onSelectVariant={handleVariantSelect}
          onClose={closeVariantPicker}
        />
      )}

      {/* Table selector modal (for Dine In mode) */}
      {showTableSelector && posMode === 'Table' && (
        <TableSelector
          isOpen={showTableSelector}
          selectedTable={selectedTable}
          onSelectTable={setSelectedTable}
          onConfirm={() => {
            setShowTableSelector(false)
            // Create new order with selected table
          }}
          onClose={() => setShowTableSelector(false)}
        />
      )}
    </>
  )
}
