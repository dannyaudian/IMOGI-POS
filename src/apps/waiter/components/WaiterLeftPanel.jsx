/**
 * Waiter Left Panel - Tables & Menu
 */

import React from 'react'
import { useWaiterContext } from '../context/WaiterContext'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { TableLayout, MenuCatalog } from './index'

export function WaiterLeftPanel() {
  const {
    mode,
    selectedTable,
    setSelectedTable,
    tables,
    tablesLoading,
    tablesError,
    selectedCategory,
    setSelectedCategory,
    items,
    itemsLoading,
    itemsError,
    categories,
    addItem
  } = useWaiterContext()

  const handleTableSelect = (table) => {
    if (mode === 'Counter') {
      setSelectedTable(null)
    } else {
      setSelectedTable(table)
    }
  }

  return (
    <div className="waiter-left-panel">
      {mode === 'Dine-in' && (
        <div className="table-section">
          <h3 className="section-title">
            Select Table {selectedTable && `- ${selectedTable.name}`}
          </h3>
          {tablesLoading && <LoadingSpinner message="Loading tables..." />}
          {tablesError && <ErrorMessage error={tablesError} />}
          {tables && (
            <TableLayout
              tables={tables}
              selectedTable={selectedTable}
              onTableSelect={handleTableSelect}
              mode={mode}
            />
          )}
        </div>
      )}

      <div className="menu-section">
        <h3 className="section-title">Menu</h3>
        {itemsLoading && <LoadingSpinner message="Loading menu..." />}
        {itemsError && <ErrorMessage error={itemsError} />}
        {items && (
          <MenuCatalog
            items={items}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onAddToCart={addItem}
            loading={itemsLoading}
          />
        )}
      </div>
    </div>
  )
}
