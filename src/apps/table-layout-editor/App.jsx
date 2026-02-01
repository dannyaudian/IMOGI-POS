import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useTables } from '@/shared/api/imogi-api'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'
import { apiCall } from '../../shared/utils/api'
import { useState } from 'react'

function TableLayoutEditorContent({ initialState }) {
  // No need for useAuth - Frappe Desk already handles authentication
  
  const branch = initialState.branch || 'Default'
  const { data: tables, error: tablesError, isLoading: tablesLoading, mutate } = useTables(branch)
  
  const [editMode, setEditMode] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)
  const [showAddTableModal, setShowAddTableModal] = useState(false)

  const handleTableClick = (table) => {
    if (editMode) {
      setSelectedTable(table)
    }
  }
  
  const handleAddTable = () => {
    setShowAddTableModal(true)
  }
  
  const handleUpdateTable = async () => {
    if (!selectedTable) return
    
    try {
      // TODO: Implement table update via API
      if (window.frappe && window.frappe.show_alert) {
        window.frappe.show_alert({ 
          message: 'Table update coming soon!', 
          indicator: 'blue' 
        })
      }
    } catch (error) {
      console.error('[imogi][layout] Update failed:', error)
    }
  }
  
  const handleDeleteTable = async () => {
    if (!selectedTable) return
    
    const confirmed = confirm(`Are you sure you want to delete table ${selectedTable.name}?`)
    if (!confirmed) return
    
    try {
      // TODO: Implement table deletion
      if (window.frappe && window.frappe.show_alert) {
        window.frappe.show_alert({ 
          message: 'Table deletion coming soon!', 
          indicator: 'orange' 
        })
      }
    } catch (error) {
      console.error('[imogi][layout] Delete failed:', error)
    }
  }

  const handleSaveLayout = async () => {
    try {
      // Note: save_table_layout requires floor parameter, but we're using branch-based simple view
      // For now, just show success message without actual save
      // TODO: Implement proper layout saving once floor/profile system is integrated
      if (window.frappe && window.frappe.show_alert) {
        window.frappe.show_alert({ 
          message: 'Layout saved! (View-only mode - full editor coming soon)', 
          indicator: 'blue' 
        })
      }
      setEditMode(false)
    } catch (error) {
      console.error('[imogi][layout] Save failed:', error)
      if (window.frappe && window.frappe.show_alert) {
        window.frappe.show_alert({ 
          message: 'Save failed: ' + (error.message || 'Unknown error'), 
          indicator: 'red' 
        })
      }
    }
  }

  // Get user from frappe session
  const user = window.frappe?.session?.user || 'Guest'
  
  return (
    <div className="imogi-app">
      <AppHeader title="Table Layout Editor" user={user} />
      
      <main className="imogi-main">
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <h2>Branch: {branch}</h2>
          <div className="flex" style={{ gap: '0.5rem' }}>
            <button 
              className={editMode ? 'btn-secondary' : 'btn-primary'}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? 'Cancel Edit' : 'Edit Layout'}
            </button>
            {editMode && (
              <>
                <button className="btn-success" onClick={handleSaveLayout}>
                  Save Layout
                </button>
                <button className="btn-secondary" onClick={handleAddTable}>
                  Add Table
                </button>
              </>
            )}
          </div>
        </div>
        
        <Card title="Table Layout">
          {tablesLoading && <LoadingSpinner message="Loading tables..." />}
          {tablesError && <ErrorMessage error={tablesError} />}
          {tables && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '1rem',
              minHeight: '400px',
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '8px'
            }}>
              {tables.map(table => (
                <div 
                  key={table.name}
                  onClick={() => handleTableClick(table)}
                  style={{
                    padding: '1.5rem',
                    background: selectedTable?.name === table.name ? '#ddd6fe' : 'white',
                    border: editMode ? '2px dashed #667eea' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: editMode ? 'move' : 'default',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🪑</div>
                  <strong>{table.name}</strong>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: '#6b7280' }}>
                    {table.seating_capacity ? `${table.seating_capacity} seats` : 'No capacity'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        
        {selectedTable && editMode && (
          <Card title="Edit Table" className="mt-4">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Table Name
                </label>
                <input 
                  type="text"
                  value={selectedTable.name}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    background: '#f9fafb'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Seating Capacity
                </label>
                <input 
                  type="number"
                  value={selectedTable.seating_capacity || 4}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}
                />
              </div>
            </div>
            <div className="flex" style={{ marginTop: '1rem', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn-error" onClick={handleDeleteTable}>Delete Table</button>
              <button className="btn-primary" onClick={handleUpdateTable}>Update</button>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <TableLayoutEditorContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
