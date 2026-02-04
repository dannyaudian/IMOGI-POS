import { useTableManagementContext } from '../context/TableManagementContext'
import { Card, LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { LayoutCanvas } from './LayoutCanvas'
import { ToolbarPanel } from './ToolbarPanel'
import { FloorSelector } from './FloorSelector'

export function LayoutEditorPanel() {
  const {
    branch,
    selectedFloor,
    setSelectedFloor,
    layoutData,
    layoutError,
    layoutLoading,
    onSaveLayout,
    onAddNode
  } = useTableManagementContext()

  return (
    <>
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
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>
              Restaurant Floor Layout
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Drag and drop tables to design your floor plan
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

        <FloorSelector
          branch={branch}
          selectedFloor={selectedFloor}
          onSelectFloor={setSelectedFloor}
        />
      </div>

      {selectedFloor && (
        <ToolbarPanel onAddNode={onAddNode} />
      )}

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
          onSave={onSaveLayout}
        />
      )}

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
    </>
  )
}
