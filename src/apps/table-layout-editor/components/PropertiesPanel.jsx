import { useState, useEffect } from 'react'

const shapes = [
  { value: 'rectangle', label: 'Rectangle', icon: '⬜' },
  { value: 'round', label: 'Round', icon: '⭕' },
  { value: 'booth', label: 'Booth', icon: '🛋️' },
  { value: 'square', label: 'Square', icon: '🟦' }
]

const statuses = [
  { value: 'Available', color: '#4caf50' },
  { value: 'Occupied', color: '#f44336' },
  { value: 'Reserved', color: '#ff9800' },
  { value: 'Cleaning', color: '#2196f3' }
]

export function PropertiesPanel({ node, onUpdate, onDelete, onClose }) {
  const [formData, setFormData] = useState({
    label: node.data.label || '',
    capacity: node.data.capacity || 4,
    width: node.data.width || 100,
    height: node.data.height || 100,
    shape: node.data.shape || 'rectangle',
    status: node.data.status || 'Available',
    backgroundColor: node.data.backgroundColor || '#ffffff',
    rotation: node.data.rotation || 0
  })

  useEffect(() => {
    setFormData({
      label: node.data.label || '',
      capacity: node.data.capacity || 4,
      width: node.data.width || 100,
      height: node.data.height || 100,
      shape: node.data.shape || 'rectangle',
      status: node.data.status || 'Available',
      backgroundColor: node.data.backgroundColor || '#ffffff',
      rotation: node.data.rotation || 0
    })
  }, [node])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleApply = () => {
    onUpdate(formData)
    window.frappe?.show_alert?.({ 
      message: 'Table updated!', 
      indicator: 'green' 
    })
  }

  const handleDelete = () => {
    if (confirm(`Delete table "${formData.label}"?`)) {
      onDelete()
      window.frappe?.show_alert?.({ 
        message: 'Table deleted', 
        indicator: 'orange' 
      })
    }
  }

  return (
    <div 
      className="properties-panel"
      style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        width: '300px',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        maxHeight: 'calc(100% - 2rem)',
        overflow: 'auto'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#f9fafb'
      }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
          Table Properties
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#6b7280',
            padding: 0,
            lineHeight: 1
          }}
        >
          ×
        </button>
      </div>

      {/* Form */}
      <div style={{ padding: '1rem' }}>
        {/* Label */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            Table Name
          </label>
          <input 
            type="text"
            value={formData.label}
            onChange={(e) => handleChange('label', e.target.value)}
            placeholder="e.g., Table 1"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          />
        </div>

        {/* Shape */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            Shape
          </label>
          <select
            value={formData.shape}
            onChange={(e) => handleChange('shape', e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            {shapes.map(shape => (
              <option key={shape.value} value={shape.value}>
                {shape.icon} {shape.label}
              </option>
            ))}
          </select>
        </div>

        {/* Capacity */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            Seating Capacity
          </label>
          <input 
            type="number"
            min="1"
            max="20"
            value={formData.capacity}
            onChange={(e) => handleChange('capacity', parseInt(e.target.value) || 4)}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          />
        </div>

        {/* Dimensions */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '600',
              fontSize: '0.875rem',
              color: '#374151'
            }}>
              Width (px)
            </label>
            <input 
              type="number"
              min="50"
              max="300"
              value={formData.width}
              onChange={(e) => handleChange('width', parseInt(e.target.value) || 100)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '600',
              fontSize: '0.875rem',
              color: '#374151'
            }}>
              Height (px)
            </label>
            <input 
              type="number"
              min="50"
              max="300"
              value={formData.height}
              onChange={(e) => handleChange('height', parseInt(e.target.value) || 100)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>
        </div>

        {/* Rotation */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            Rotation: {formData.rotation}°
          </label>
          <input 
            type="range"
            min="0"
            max="360"
            step="15"
            value={formData.rotation}
            onChange={(e) => handleChange('rotation', parseInt(e.target.value))}
            style={{
              width: '100%'
            }}
          />
        </div>

        {/* Status */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            Status
          </label>
          <select
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            {statuses.map(status => (
              <option key={status.value} value={status.value}>
                {status.value}
              </option>
            ))}
          </select>
        </div>

        {/* Background Color */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '600',
            fontSize: '0.875rem',
            color: '#374151'
          }}>
            Background Color
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="color"
              value={formData.backgroundColor}
              onChange={(e) => handleChange('backgroundColor', e.target.value)}
              style={{
                width: '60px',
                height: '38px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                cursor: 'pointer'
              }}
            />
            <input 
              type="text"
              value={formData.backgroundColor}
              onChange={(e) => handleChange('backgroundColor', e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem',
          marginTop: '1.5rem'
        }}>
          <button 
            onClick={handleApply}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            Apply Changes
          </button>
          <button 
            onClick={handleDelete}
            style={{
              padding: '0.75rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  )
}
