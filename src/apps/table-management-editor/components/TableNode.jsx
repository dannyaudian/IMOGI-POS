import { memo } from 'react'

const shapes = {
  round: '⭕',
  rectangle: '⬜',
  booth: '🛋️',
  square: '🟦'
}

const statusColors = {
  'Available': { bg: '#e8f5e9', color: '#2e7d32', border: '#4caf50' },
  'Occupied': { bg: '#ffebee', color: '#c62828', border: '#f44336' },
  'Reserved': { bg: '#fff3e0', color: '#e65100', border: '#ff9800' },
  'Cleaning': { bg: '#e3f2fd', color: '#1565c0', border: '#2196f3' }
}

export const TableNode = memo(({ data, selected }) => {
  const shapeIcon = shapes[data.shape] || shapes.rectangle
  const statusStyle = statusColors[data.status] || statusColors.Available
  
  const nodeStyle = {
    width: `${data.width || 100}px`,
    height: `${data.height || 100}px`,
    background: data.backgroundColor || '#ffffff',
    border: selected 
      ? '3px solid #667eea' 
      : `2px solid ${statusStyle.border}`,
    borderRadius: data.shape === 'round' ? '50%' : '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    cursor: 'move',
    boxShadow: selected 
      ? '0 4px 12px rgba(102, 126, 234, 0.3)' 
      : '0 2px 8px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
    transform: `rotate(${data.rotation || 0}deg)`
  }

  return (
    <div className={`table-node ${data.shape} ${selected ? 'selected' : ''}`} style={nodeStyle}>
      {/* Shape Icon */}
      <div style={{ 
        fontSize: '2rem', 
        marginBottom: '0.25rem',
        opacity: 0.8
      }}>
        {shapeIcon}
      </div>
      
      {/* Table Label */}
      <strong style={{ 
        fontSize: '0.875rem',
        textAlign: 'center',
        marginBottom: '0.25rem'
      }}>
        {data.label || 'Table'}
      </strong>
      
      {/* Capacity */}
      <div style={{ 
        fontSize: '0.75rem', 
        color: '#6b7280',
        marginTop: '0.125rem'
      }}>
        {data.capacity || 4} seats
      </div>
      
      {/* Status Badge */}
      {data.status && (
        <div 
          className={`status-badge status-${data.status}`}
          style={{
            marginTop: '0.5rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.65rem',
            fontWeight: 'bold',
            background: statusStyle.bg,
            color: statusStyle.color,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          {data.status}
        </div>
      )}

      {/* Current Order Info (if occupied) */}
      {data.currentOrder && (
        <div style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          background: '#f44336',
          color: 'white',
          borderRadius: '50%',
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.7rem',
          fontWeight: 'bold'
        }}>
          🔥
        </div>
      )}
    </div>
  )
})

TableNode.displayName = 'TableNode'
