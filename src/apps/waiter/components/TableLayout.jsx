import React from 'react'

/**
 * TableLayout Component
 * Visual grid of restaurant tables with status indicators
 */
export function TableLayout({ tables, selectedTable, onTableSelect, mode }) {
  if (!tables || tables.length === 0) {
    return (
      <div className="table-layout-empty">
        <p>No tables available</p>
      </div>
    )
  }

  return (
    <div className="table-layout">
      <div className="table-grid">
        {tables.map(table => (
          <TableCard
            key={table.name}
            table={table}
            isSelected={selectedTable?.name === table.name}
            onSelect={() => onTableSelect(table)}
            mode={mode}
          />
        ))}
      </div>
    </div>
  )
}

function TableCard({ table, isSelected, onSelect, mode }) {
  const getStatusClass = () => {
    if (isSelected) return 'selected'
    if (table.status === 'Occupied') return 'occupied'
    if (table.status === 'Reserved') return 'reserved'
    return 'available'
  }

  const getStatusIcon = () => {
    if (table.status === 'Occupied') return '👥'
    if (table.status === 'Reserved') return '📅'
    return '✓'
  }

  return (
    <button
      className={`table-card ${getStatusClass()}`}
      onClick={onSelect}
      disabled={mode === 'Dine-in' && table.status === 'Occupied' && !isSelected}
    >
      <div className="table-number">{table.table_number || table.name}</div>
      <div className="table-capacity">
        <span className="capacity-icon">👤</span>
        <span>{table.seating_capacity || 4}</span>
      </div>
      <div className="table-status">
        <span className="status-icon">{getStatusIcon()}</span>
        <span className="status-text">{table.status || 'Available'}</span>
      </div>
      {table.current_order && (
        <div className="table-order-info">
          <small>Order: {table.current_order}</small>
        </div>
      )}
    </button>
  )
}
