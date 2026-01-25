import React, { useState, useEffect } from 'react'
import { useFrappeGetDocList, useFrappePostCall } from 'frappe-react-sdk'
import './styles.css'

function App() {
  const [selectedDisplay, setSelectedDisplay] = useState(null)
  const [displays, setDisplays] = useState([])
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('preview')

  // Fetch table display devices
  const { data: displayList, isLoading: displaysLoading, mutate: mutateDisplays } = useFrappeGetDocList(
    'Restaurant Table Display',
    {
      fields: ['name', 'display_name', 'section', 'status', 'display_type'],
      limit_page_length: 0
    }
  )

  // Load displays
  useEffect(() => {
    if (displayList) {
      setDisplays(displayList)
      if (!selectedDisplay && displayList.length > 0) {
        setSelectedDisplay(displayList[0].name)
      }
    }
  }, [displayList, selectedDisplay])

  // Load config when display changes
  useEffect(() => {
    if (selectedDisplay) {
      loadDisplayConfig()
    }
  }, [selectedDisplay])

  const loadDisplayConfig = () => {
    setLoading(true)
    frappe.call({
      method: 'imogi_pos.api.table_display_editor.get_display_config',
      args: { display: selectedDisplay },
      callback: (r) => {
        if (r.message) {
          setConfig(r.message.config || {})
        }
        setLoading(false)
      },
      error: () => {
        setLoading(false)
        frappe.show_alert({
          message: 'Error loading display config',
          indicator: 'red'
        }, 3)
      }
    })
  }

  const handleSaveConfig = () => {
    if (!selectedDisplay) return
    
    setSaving(true)
    frappe.call({
      method: 'imogi_pos.api.table_display_editor.save_display_config',
      args: {
        display: selectedDisplay,
        config: config
      },
      callback: (r) => {
        if (r.message && r.message.success) {
          frappe.show_alert({
            message: 'Configuration saved successfully',
            indicator: 'green'
          }, 3)
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        }
        setSaving(false)
      },
      error: () => {
        frappe.show_alert({
          message: 'Error saving configuration',
          indicator: 'red'
        }, 3)
        setSaving(false)
      }
    })
  }

  const handleResetConfig = () => {
    if (!selectedDisplay) return
    
    if (!confirm('Reset to default configuration?')) return
    
    frappe.call({
      method: 'imogi_pos.api.table_display_editor.reset_display_config',
      args: { display: selectedDisplay },
      callback: (r) => {
        if (r.message && r.message.success) {
          loadDisplayConfig()
          frappe.show_alert({
            message: 'Configuration reset to defaults',
            indicator: 'green'
          }, 3)
        }
      },
      error: () => {
        frappe.show_alert({
          message: 'Error resetting configuration',
          indicator: 'red'
        }, 3)
      }
    })
  }

  const handleTestDisplay = () => {
    if (!selectedDisplay) return
    
    frappe.call({
      method: 'imogi_pos.api.table_display_editor.test_display',
      args: { display: selectedDisplay },
      callback: () => {
        frappe.show_alert({
          message: 'Test message sent to display',
          indicator: 'blue'
        }, 3)
      }
    })
  }

  const handleConfigChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }))
  }

  if (displaysLoading) {
    return (
      <div className="tde-container">
        <div className="tde-loading">
          <div className="spinner"></div>
          <p>Loading Table Display Editor...</p>
        </div>
      </div>
    )
  }

  if (!displays || displays.length === 0) {
    return (
      <div className="tde-container">
        <div className="tde-empty">
          <h2>No Table Displays</h2>
          <p>Create a Restaurant Table Display to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tde-app">
      {/* Header */}
      <div className="tde-header">
        <div className="tde-header-content">
          <h1>Table Display Editor</h1>
          <p>Configure and manage restaurant table status displays</p>
        </div>
        <div className="tde-header-actions">
          <button 
            className="tde-btn tde-btn-secondary"
            onClick={handleResetConfig}
            disabled={!selectedDisplay || loading}
          >
            Reset to Defaults
          </button>
          <button 
            className="tde-btn tde-btn-secondary"
            onClick={handleTestDisplay}
            disabled={!selectedDisplay || loading}
          >
            Test Display
          </button>
          <button 
            className="tde-btn tde-btn-primary"
            onClick={handleSaveConfig}
            disabled={!selectedDisplay || saving || loading}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="tde-main">
        {/* Sidebar - Display Selector */}
        <aside className="tde-sidebar">
          <h3>Displays</h3>
          <div className="tde-display-list">
            {displays.map(display => (
              <button
                key={display.name}
                className={`tde-display-item ${selectedDisplay === display.name ? 'active' : ''}`}
                onClick={() => setSelectedDisplay(display.name)}
              >
                <div className="tde-display-name">{display.display_name || display.name}</div>
                <div className="tde-display-section">{display.section || 'No section'}</div>
                <div className={`tde-display-status ${display.status || 'unknown'}`}>
                  {display.status || 'Unknown'}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Content - Configuration Panels */}
        <main className="tde-content">
          {loading ? (
            <div className="tde-loading-content">
              <div className="spinner"></div>
              <p>Loading configuration...</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="tde-tabs">
                <button
                  className={`tde-tab ${activeTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  Preview
                </button>
                <button
                  className={`tde-tab ${activeTab === 'layout' ? 'active' : ''}`}
                  onClick={() => setActiveTab('layout')}
                >
                  Layout
                </button>
                <button
                  className={`tde-tab ${activeTab === 'theme' ? 'active' : ''}`}
                  onClick={() => setActiveTab('theme')}
                >
                  Theme
                </button>
                <button
                  className={`tde-tab ${activeTab === 'advanced' ? 'active' : ''}`}
                  onClick={() => setActiveTab('advanced')}
                >
                  Advanced
                </button>
              </div>

              {/* Tab Content */}
              <div className="tde-tab-content">
                {activeTab === 'preview' && <PreviewTab config={config} />}
                {activeTab === 'layout' && (
                  <LayoutTab config={config} onChange={handleConfigChange} />
                )}
                {activeTab === 'theme' && (
                  <ThemeTab config={config} onChange={handleConfigChange} />
                )}
                {activeTab === 'advanced' && (
                  <AdvancedTab config={config} onChange={handleConfigChange} />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// Tab Components
function PreviewTab({ config }) {
  const getStatusDisplay = (status) => {
    const statuses = {
      'available': { icon: '✓', color: '#10b981', label: 'Available' },
      'occupied': { icon: '●', color: '#ef4444', label: 'Occupied' },
      'reserved': { icon: '◆', color: '#f59e0b', label: 'Reserved' },
      'dirty': { icon: '✗', color: '#8b5cf6', label: 'Dirty' }
    }
    return statuses[status] || { icon: '?', color: '#6b7280', label: 'Unknown' }
  }

  const sampleTables = [
    { id: 'T01', status: 'available', seats: 4 },
    { id: 'T02', status: 'occupied', seats: 6 },
    { id: 'T03', status: 'reserved', seats: 2 },
    { id: 'T04', status: 'dirty', seats: 4 }
  ]

  const bgColor = config.backgroundColor || '#1f2937'
  const textColor = config.textColor || '#ffffff'
  const fontSize = config.fontSize || '1rem'

  return (
    <div className="tde-preview">
      <div className="tde-preview-label">Live Preview</div>
      <div 
        className="tde-preview-display"
        style={{
          backgroundColor: bgColor,
          color: textColor,
          fontSize: fontSize
        }}
      >
        <div className="tde-preview-header">
          <h2>Table Status</h2>
        </div>

        <div className="tde-preview-grid">
          {sampleTables.map((table, idx) => {
            const status = getStatusDisplay(table.status)
            return (
              <div key={idx} className="tde-preview-table">
                <div 
                  className="tde-preview-table-status"
                  style={{ color: status.color }}
                >
                  {status.icon}
                </div>
                <div className="tde-preview-table-id">{table.id}</div>
                {config.showSeats && (
                  <div className="tde-preview-table-seats">{table.seats} seats</div>
                )}
                <div className="tde-preview-table-label" style={{ color: status.color }}>
                  {status.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LayoutTab({ config, onChange }) {
  return (
    <div className="tde-form-group">
      <h3>Layout Settings</h3>
      
      <div className="tde-form-field">
        <label>Show Table Numbers</label>
        <input
          type="checkbox"
          checked={config.showTableNumbers || false}
          onChange={(e) => onChange('showTableNumbers', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Show Seat Count</label>
        <input
          type="checkbox"
          checked={config.showSeats || false}
          onChange={(e) => onChange('showSeats', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Show Status Labels</label>
        <input
          type="checkbox"
          checked={config.showStatusLabels || true}
          onChange={(e) => onChange('showStatusLabels', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Show Waiter Name</label>
        <input
          type="checkbox"
          checked={config.showWaiterName || false}
          onChange={(e) => onChange('showWaiterName', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Show Order Time</label>
        <input
          type="checkbox"
          checked={config.showOrderTime || false}
          onChange={(e) => onChange('showOrderTime', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Grid Layout</label>
        <select
          value={config.gridLayout || '4'}
          onChange={(e) => onChange('gridLayout', e.target.value)}
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
          <option value="6">6 Columns</option>
        </select>
      </div>

      <div className="tde-form-field">
        <label>Font Size</label>
        <select
          value={config.fontSize || '1rem'}
          onChange={(e) => onChange('fontSize', e.target.value)}
        >
          <option value="0.875rem">Small</option>
          <option value="1rem">Medium</option>
          <option value="1.25rem">Large</option>
          <option value="1.5rem">Extra Large</option>
        </select>
      </div>

      <div className="tde-form-field">
        <label>Update Interval (seconds)</label>
        <input
          type="number"
          min="1"
          max="60"
          value={config.updateInterval || 5}
          onChange={(e) => onChange('updateInterval', parseInt(e.target.value))}
        />
      </div>
    </div>
  )
}

function ThemeTab({ config, onChange }) {
  return (
    <div className="tde-form-group">
      <h3>Theme Settings</h3>

      <div className="tde-form-field">
        <label>Background Color</label>
        <input
          type="color"
          value={config.backgroundColor || '#1f2937'}
          onChange={(e) => onChange('backgroundColor', e.target.value)}
        />
      </div>

      <div className="tde-form-field">
        <label>Text Color</label>
        <input
          type="color"
          value={config.textColor || '#ffffff'}
          onChange={(e) => onChange('textColor', e.target.value)}
        />
      </div>

      <div className="tde-form-field">
        <label>Available Table Color</label>
        <input
          type="color"
          value={config.availableColor || '#10b981'}
          onChange={(e) => onChange('availableColor', e.target.value)}
        />
      </div>

      <div className="tde-form-field">
        <label>Occupied Table Color</label>
        <input
          type="color"
          value={config.occupiedColor || '#ef4444'}
          onChange={(e) => onChange('occupiedColor', e.target.value)}
        />
      </div>

      <div className="tde-form-field">
        <label>Reserved Table Color</label>
        <input
          type="color"
          value={config.reservedColor || '#f59e0b'}
          onChange={(e) => onChange('reservedColor', e.target.value)}
        />
      </div>

      <div className="tde-form-field">
        <label>Dirty Table Color</label>
        <input
          type="color"
          value={config.dirtyColor || '#8b5cf6'}
          onChange={(e) => onChange('dirtyColor', e.target.value)}
        />
      </div>

      <div className="tde-form-field">
        <label>Theme Preset</label>
        <select
          value={config.themePreset || 'dark'}
          onChange={(e) => onChange('themePreset', e.target.value)}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="professional">Professional</option>
          <option value="vibrant">Vibrant</option>
        </select>
      </div>
    </div>
  )
}

function AdvancedTab({ config, onChange }) {
  return (
    <div className="tde-form-group">
      <h3>Advanced Settings</h3>

      <div className="tde-form-field">
        <label>Enable Auto-Refresh</label>
        <input
          type="checkbox"
          checked={config.enableAutoRefresh || true}
          onChange={(e) => onChange('enableAutoRefresh', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Polling Interval (seconds)</label>
        <input
          type="number"
          min="1"
          max="60"
          step="1"
          value={config.pollingInterval || 5}
          onChange={(e) => onChange('pollingInterval', parseInt(e.target.value))}
        />
        <small>How often to check for table status updates</small>
      </div>

      <div className="tde-form-field">
        <label>Animation Speed (ms)</label>
        <input
          type="number"
          min="100"
          max="2000"
          step="100"
          value={config.animationSpeed || 300}
          onChange={(e) => onChange('animationSpeed', parseInt(e.target.value))}
        />
      </div>

      <div className="tde-form-field">
        <label>Enable Animations</label>
        <input
          type="checkbox"
          checked={config.enableAnimations || true}
          onChange={(e) => onChange('enableAnimations', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Show Section Header</label>
        <input
          type="checkbox"
          checked={config.showSectionHeader || true}
          onChange={(e) => onChange('showSectionHeader', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>Enable Debug Mode</label>
        <input
          type="checkbox"
          checked={config.debugMode || false}
          onChange={(e) => onChange('debugMode', e.target.checked)}
        />
      </div>

      <div className="tde-form-field">
        <label>API Key (Optional)</label>
        <input
          type="password"
          placeholder="Enter API key for remote management"
          value={config.apiKey || ''}
          onChange={(e) => onChange('apiKey', e.target.value)}
        />
      </div>
    </div>
  )
}

export default App
