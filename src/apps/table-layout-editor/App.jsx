import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { AppHeader, LoadingSpinner, ErrorMessage, Card } from '@/shared/components/UI'
import { useState, useCallback } from 'react'
import { LayoutCanvas } from './components/LayoutCanvas'
import { ToolbarPanel } from './components/ToolbarPanel'
import { FloorSelector } from './components/FloorSelector'
import { useLayoutData } from './hooks/useLayoutData'

function TableLayoutEditorContent({ initialState }) {
  const branch = initialState.branch || 'Default'
  const user = window.frappe?.session?.user || 'Guest'
  
  const [selectedFloor, setSelectedFloor] = useState(null)
  const { data: layoutData, error: layoutError, isLoading: layoutLoading, mutate } = useLayoutData(selectedFloor)

  const handleSelectFloor = (floor) => {
    setSelectedFloor(floor)
  }

  const handleSaveLayout = useCallback(() => {
    // Reload layout data after save
    mutate()
    window.frappe?.show_alert?.({ 
      message: '✅ Layout saved successfully!', 
      indicator: 'green' 
    })
  }, [mutate])

  const handleAddNode = useCallback((node) => {
    // Node will be added via LayoutCanvas
    console.log('[imogi][layout] Adding node:', node)
  }, [])

  return (
    <div className="imogi-app">
      <AppHeader title="Table Layout Editor" user={user} />
      
      <main className="imogi-main" style={{ padding: '1.5rem' }}>
        {/* Header with Branch Info */}
        <div style={{ 
          marginBottom: '1.5rem',
          padding: '1rem',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
                Restaurant Floor Layout
              </h2>
              <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                Branch: {branch}
              </p>
            </div>
            <div style={{ 
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}>
              React Flow Editor
            </div>
          </div>
          
          {/* Floor Selector */}
          <FloorSelector 
            branch={branch}
            selectedFloor={selectedFloor}
            onSelectFloor={handleSelectFloor}
          />
        </div>

        {/* Toolbar */}
        {selectedFloor && (
          <ToolbarPanel onAddNode={handleAddNode} />
        )}

        {/* Main Canvas */}
        {!selectedFloor && (
          <Card>
            <div style={{ 
              padding: '3rem', 
              textAlign: 'center',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏢</div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#1f2937' }}>
                Select a Floor to Begin
              </h3>
              <p>Choose a floor from the dropdown above to start editing the table layout</p>
            </div>
          </Card>
        )}

        {selectedFloor && layoutLoading && (
          <Card>
            <LoadingSpinner message="Loading floor layout..." />
          </Card>
        )}

        {selectedFloor && layoutError && (
          <Card>
            <ErrorMessage error={layoutError} />
          </Card>
        )}

        {selectedFloor && layoutData && (
          <LayoutCanvas 
            floor={selectedFloor}
            initialLayout={layoutData}
            onSave={handleSaveLayout}
          />
        )}

        {/* Help Section */}
        {selectedFloor && (
          <Card title="🎯 Quick Tips" style={{ marginTop: '1rem' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
              fontSize: '0.875rem'
            }}>
              <div>
                <strong>🖱️ Navigation:</strong>
                <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                  <li>Drag canvas to pan</li>
                  <li>Scroll to zoom</li>
                  <li>Click table to select</li>
                </ul>
              </div>
              <div>
                <strong>✏️ Editing:</strong>
                <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                  <li>Drag tables to reposition</li>
                  <li>Click to edit properties</li>
                  <li>Use toolbar to add tables</li>
                </ul>
              </div>
              <div>
                <strong>💾 Saving:</strong>
                <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                  <li>Auto-snaps to grid</li>
                  <li>Click Save to persist</li>
                  <li>Changes sync to backend</li>
                </ul>
              </div>
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
