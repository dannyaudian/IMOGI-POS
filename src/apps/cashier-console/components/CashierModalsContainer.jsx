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
    selectedOrder
  } = useCashierContext()

  return (
    <>
      {/* Variant picker modal */}
      {showVariantPicker && variantPickerContext && (
        <VariantPickerModal
          isOpen={showVariantPicker}
          item={variantPickerContext}
          onClose={() => {
            setShowVariantPicker(false)
            setVariantPickerContext(null)
          }}
          selectedOrder={selectedOrder}
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
