import { createTableNode } from '../utils/nodeFactory'

export function ToolbarPanel({ onAddNode }) {
  const handleAddTable = (shape = 'rectangle') => {
    const newNode = createTableNode(shape)
    onAddNode(newNode)
    
    window.frappe?.show_alert?.({ 
      message: `Added ${shape} table. Drag to position it!`, 
      indicator: 'blue' 
    })
  }

  const tools = [
    { shape: 'rectangle', icon: '⬜', label: 'Rectangle Table' },
    { shape: 'round', icon: '⭕', label: 'Round Table' },
    { shape: 'booth', icon: '🛋️', label: 'Booth' },
    { shape: 'square', icon: '🟦', label: 'Square Table' }
  ]

  return (
    <div 
      className="toolbar-panel"
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
      }}
    >
      <h3 style={{ 
        margin: '0 0 1rem 0', 
        fontSize: '1rem',
        fontWeight: '600',
        color: '#1f2937'
      }}>
        Add Elements
      </h3>
      
      <div 
        className="toolbar-buttons"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '0.75rem'
        }}
      >
        {tools.map((tool) => (
          <button
            key={tool.shape}
            onClick={() => handleAddTable(tool.shape)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              background: 'white',
              border: '2px dashed #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#4b5563'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#667eea'
              e.currentTarget.style.background = '#f3f4f6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db'
              e.currentTarget.style.background = 'white'
            }}
          >
            <span style={{ fontSize: '2rem' }}>{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      <div style={{
        marginTop: '1rem',
        padding: '0.75rem',
        background: '#f3f4f6',
        borderRadius: '6px',
        fontSize: '0.75rem',
        color: '#6b7280',
        lineHeight: '1.5'
      }}>
        <strong>💡 Tips:</strong>
        <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
          <li>Click a table to add it to the canvas</li>
          <li>Drag tables to position them</li>
          <li>Click a table on canvas to edit properties</li>
          <li>Use mouse wheel to zoom in/out</li>
          <li>Hold Space + drag to pan the canvas</li>
        </ul>
      </div>
    </div>
  )
}
