import { useFloors } from '../hooks/useFloors'
import { LoadingSpinner } from '@/shared/components/UI'

export function FloorSelector({ branch, selectedFloor, onSelectFloor }) {
  const { data: floors, error, isLoading } = useFloors(branch)

  if (isLoading) {
    return (
      <div style={{ padding: '0.5rem' }}>
        <LoadingSpinner size="small" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        padding: '0.75rem', 
        background: '#fee', 
        color: '#c00',
        borderRadius: '6px',
        fontSize: '0.875rem'
      }}>
        Failed to load floors
      </div>
    )
  }

  if (!floors || floors.length === 0) {
    return (
      <div style={{ 
        padding: '0.75rem', 
        background: '#fff3cd', 
        color: '#856404',
        borderRadius: '6px',
        fontSize: '0.875rem'
      }}>
        No floors found for this branch. Please create a floor first.
      </div>
    )
  }

  return (
    <div className="floor-selector">
      <label 
        htmlFor="floor-select"
        style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: '600',
          fontSize: '0.875rem',
          color: '#374151'
        }}
      >
        Select Floor
      </label>
      <select
        id="floor-select"
        value={selectedFloor || ''}
        onChange={(e) => onSelectFloor(e.target.value)}
        style={{
          width: '100%',
          padding: '0.75rem',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          fontSize: '0.875rem',
          background: 'white',
          cursor: 'pointer'
        }}
      >
        <option value="">-- Choose a floor --</option>
        {floors.map((floor) => (
          <option key={floor.name} value={floor.name}>
            {floor.floor_name || floor.name}
            {floor.description ? ` - ${floor.description}` : ''}
          </option>
        ))}
      </select>
      
      {selectedFloor && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.5rem',
          background: '#f3f4f6',
          borderRadius: '4px',
          fontSize: '0.75rem',
          color: '#6b7280'
        }}>
          {floors.find(f => f.name === selectedFloor)?.description || 'No description'}
        </div>
      )}
    </div>
  )
}
