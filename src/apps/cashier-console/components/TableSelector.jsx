import { useState, useEffect } from 'react'
import { apiCall } from '@/shared/utils/api'

export function TableSelector({ branch, onSelectTable, onClose }) {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('Available')

  useEffect(() => {
    loadTables()
  }, [branch])

  const loadTables = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await apiCall(API.GET_TABLES, {
        branch: branch
      })
      setTables(result || [])
    } catch (err) {
      setError('Failed to load tables')
      console.error('[TableSelector] Error loading tables:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredTables = tables.filter(table => {
    if (filterStatus === 'All') return true
    return table.status === filterStatus
  })

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available':
        return '#10b981'
      case 'Occupied':
        return '#f59e0b'
      case 'Reserved':
        return '#3b82f6'
      case 'Inactive':
        return '#6b7280'
      default:
        return '#6b7280'
    }
  }

  const handleTableClick = (table) => {
    if (table.status === 'Available') {
      onSelectTable(table)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content table-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Select Table</h3>
          <button onClick={onClose} className="btn-close">
            <i className="fa fa-times"></i>
          </button>
        </div>

        <div className="table-selector-filters">
          {['Available', 'Occupied', 'Reserved', 'All'].map(status => (
            <button
              key={status}
              className={`filter-btn ${filterStatus === status ? 'active' : ''}`}
              onClick={() => setFilterStatus(status)}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="table-selector-content">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading tables...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <i className="fa fa-exclamation-circle"></i>
              <p>{error}</p>
              <button className="btn-retry" onClick={loadTables}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filteredTables.length === 0 && (
            <div className="empty-state">
              <i className="fa fa-chair"></i>
              <p>No tables found</p>
            </div>
          )}

          {!loading && !error && filteredTables.length > 0 && (
            <div className="table-grid">
              {filteredTables.map(table => (
                <div
                  key={table.name}
                  className={`table-card ${table.status.toLowerCase()}`}
                  onClick={() => handleTableClick(table)}
                  style={{
                    borderColor: getStatusColor(table.status),
                    cursor: table.status === 'Available' ? 'pointer' : 'not-allowed',
                    opacity: table.status === 'Available' ? 1 : 0.6
                  }}
                >
                  <div className="table-card-header">
                    <div className="table-name">
                      <i className="fa fa-utensils"></i>
                      {table.table_name}
                    </div>
                    <div 
                      className="table-status"
                      style={{ backgroundColor: getStatusColor(table.status) }}
                    >
                      {table.status}
                    </div>
                  </div>

                  {table.capacity && (
                    <div className="table-capacity">
                      <i className="fa fa-users"></i>
                      Capacity: {table.capacity}
                    </div>
                  )}

                  {table.current_order && (
                    <div className="table-order-info">
                      <small>Order: {table.current_order}</small>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
