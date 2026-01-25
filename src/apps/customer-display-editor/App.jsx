import React, { useState, useEffect } from 'react'
import { useFrappeGetDocList } from 'frappe-react-sdk'
import './styles.css'

function App() {
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [devices, setDevices] = useState([])
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('preview')

  // Fetch customer display profiles
  const { data: profileList, isLoading: devicesLoading, mutate: mutateDevices } = useFrappeGetDocList(
    'Customer Display Profile',
    {
      fields: ['name', 'profile_name', 'branch', 'description', 'is_active'],
      filters: [['is_active', '=', 1]],
      limit_page_length: 0
    }
  )

  // Load profiles
  useEffect(() => {
    if (profileList) {
      setDevices(profileList)
      if (!selectedDevice && profileList.length > 0) {
        setSelectedDevice(profileList[0].name)
      }
    }
  }, [profileList, selectedDevice])

  // Load config when device changes
  useEffect(() => {
    if (selectedDevice) {
      loadDeviceConfig()
    }
  }, [selectedDevice])

  const loadDeviceConfig = () => {
    setLoading(true)
    frappe.call({
      method: 'imogi_pos.api.customer_display_editor.get_device_config',
      args: { device: selectedDevice },
      callback: (r) => {
        if (r.message) {
          setConfig(r.message.config || {})
        }
        setLoading(false)
      },
      error: () => {
        setLoading(false)
        frappe.show_alert({ message: 'Error loading config', indicator: 'red' }, 3)
      }
    })
  }

  const handleSaveConfig = () => {
    if (!selectedDevice) return
    
    setSaving(true)
    frappe.call({
      method: 'imogi_pos.api.customer_display_editor.save_device_config',
      args: { 
        device: selectedDevice,
        config: config
      },
      callback: (r) => {
        setSaving(false)
        if (r.message && r.message.success) {
          frappe.show_alert({
            message: 'Configuration saved successfully',
            indicator: 'green'
          }, 3)
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
          mutateDevices()
        }
      },
      error: (err) => {
        setSaving(false)
        frappe.show_alert({
          message: 'Error saving configuration',
          indicator: 'red'
        }, 3)
      }
    })
  }

  const handleResetConfig = () => {
    if (!selectedDevice) return
    
    if (!confirm('Reset to default configuration?')) return
    
    frappe.call({
      method: 'imogi_pos.api.customer_display_editor.reset_device_config',
      args: { device: selectedDevice },
      callback: (r) => {
        if (r.message && r.message.success) {
          loadDeviceConfig()
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
    if (!selectedDevice) return
    
    frappe.call({
      method: 'imogi_pos.api.customer_display_editor.test_device_display',
      args: { device: selectedDevice },
      callback: (r) => {
        if (r.message && r.message.success) {
          frappe.show_alert({
            message: 'Test message sent to display',
            indicator: 'blue'
          }, 3)
        }
      },
      error: () => {
        frappe.show_alert({
          message: 'Error sending test message',
          indicator: 'red'
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

  return (
    <div className="cde-container">
      {devicesLoading ? (
        <div className="cde-loading">
          <div className="spinner"></div>
          <p>Loading Customer Display Editor...</p>
        </div>
      ) : !devices || devices.length === 0 ? (
        <div className="cde-empty">
          <h2>No Customer Display Profiles</h2>
          <p>Create a Customer Display Profile to get started.</p>
        </div>
      ) : (
    <div className="cde-app">
      {/* Header */}
      <div className="cde-header">
        <div className="cde-header-content">
          <h1>Customer Display Editor</h1>
          <p>Configure and test customer display devices</p>
        </div>
        <div className="cde-header-actions">
          <button 
            className="cde-btn cde-btn-secondary"
            onClick={handleResetConfig}
            disabled={!selectedDevice || loading}
          >
            Reset to Defaults
          </button>
          <button 
            className="cde-btn cde-btn-secondary"
            onClick={handleTestDisplay}
            disabled={!selectedDevice || loading}
          >
            Test Display
          </button>
          <button 
            className="cde-btn cde-btn-primary"
            onClick={handleSaveConfig}
            disabled={!selectedDevice || saving || loading}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="cde-main">
        {/* Sidebar - Device Selector */}
        <aside className="cde-sidebar">
          <h3>Display Profiles</h3>
          <div className="cde-device-list">
            {devices.map(device => (
              <button
                key={device.name}
                className={`cde-device-item ${selectedDevice === device.name ? 'active' : ''}`}
                onClick={() => setSelectedDevice(device.name)}
              >
                <div className="cde-device-name">{device.profile_name || device.name}</div>
                <div className="cde-device-status online">
                  {device.branch}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Content - Configuration Panels */}
        <main className="cde-content">
          {loading ? (
            <div className="cde-loading-content">
              <div className="spinner"></div>
              <p>Loading configuration...</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="cde-tabs">
                <button
                  className={`cde-tab ${activeTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  Preview
                </button>
                <button
                  className={`cde-tab ${activeTab === 'layout' ? 'active' : ''}`}
                  onClick={() => setActiveTab('layout')}
                >
                  Layout
                </button>
                <button
                  className={`cde-tab ${activeTab === 'theme' ? 'active' : ''}`}
                  onClick={() => setActiveTab('theme')}
                >
                  Theme
                </button>
                <button
                  className={`cde-tab ${activeTab === 'advanced' ? 'active' : ''}`}
                  onClick={() => setActiveTab('advanced')}
                >
                  Advanced
                </button>
              </div>

              {/* Tab Content */}
              <div className="cde-tab-content">
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
  const sampleItems = [
    { name: 'Margherita Pizza', qty: 2, price: 12.00 },
    { name: 'Caesar Salad', qty: 1, price: 8.50 },
    { name: 'Iced Tea', qty: 3, price: 2.50 }
  ]

  const bgColor = config.backgroundColor || '#1f2937'
  const textColor = config.textColor || '#ffffff'
  const fontSize = config.fontSize || '1rem'

  return (
    <div className="cde-preview">
      <div className="cde-preview-label">Live Preview</div>
      <div 
        className="cde-preview-display"
        style={{
          backgroundColor: bgColor,
          color: textColor,
          fontSize: fontSize
        }}
      >
        <div className="cde-preview-header">
          <h2>Current Order</h2>
        </div>

        <div className="cde-preview-items">
          {sampleItems.map((item, idx) => (
            <div key={idx} className="cde-preview-item">
              <div className="cde-preview-item-info">
                <span className="cde-preview-item-name">{item.name}</span>
                <span className="cde-preview-item-qty">×{item.qty}</span>
              </div>
              <span className="cde-preview-item-price">${item.price.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="cde-preview-total">
          <span>Total</span>
          <span>${sampleItems.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

function LayoutTab({ config, onChange }) {
  return (
    <div className="cde-form-group">
      <h3>Layout Settings</h3>
      
      <div className="cde-form-field">
        <label>Show Item Images</label>
        <input
          type="checkbox"
          checked={config.showImages || false}
          onChange={(e) => onChange('showImages', e.target.checked)}
        />
      </div>

      <div className="cde-form-field">
        <label>Show Item Description</label>
        <input
          type="checkbox"
          checked={config.showDescription || false}
          onChange={(e) => onChange('showDescription', e.target.checked)}
        />
      </div>

      <div className="cde-form-field">
        <label>Show Brand Logo</label>
        <input
          type="checkbox"
          checked={config.showLogo || false}
          onChange={(e) => onChange('showLogo', e.target.checked)}
        />
      </div>

      <div className="cde-form-field">
        <label>Show Subtotal</label>
        <input
          type="checkbox"
          checked={config.showSubtotal || false}
          onChange={(e) => onChange('showSubtotal', e.target.checked)}
        />
      </div>

      <div className="cde-form-field">
        <label>Show Taxes</label>
        <input
          type="checkbox"
          checked={config.showTaxes || false}
          onChange={(e) => onChange('showTaxes', e.target.checked)}
        />
      </div>

      <div className="cde-form-field">
        <label>Auto-scroll Items</label>
        <input
          type="checkbox"
          checked={config.autoScroll || false}
          onChange={(e) => onChange('autoScroll', e.target.checked)}
        />
      </div>

      {config.autoScroll && (
        <div className="cde-form-field">
          <label>Scroll Speed (seconds)</label>
          <input
            type="number"
            min="1"
            max="10"
            step="0.5"
            value={config.scrollSpeed || 3}
            onChange={(e) => onChange('scrollSpeed', parseFloat(e.target.value))}
          />
        </div>
      )}

      <div className="cde-form-field">
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
    </div>
  )
}

function ThemeTab({ config, onChange }) {
  return (
    <div className="cde-form-group">
      <h3>Theme Settings</h3>

      <div className="cde-form-field">
        <label>Background Color</label>
        <input
          type="color"
          value={config.backgroundColor || '#1f2937'}
          onChange={(e) => onChange('backgroundColor', e.target.value)}
        />
      </div>

      <div className="cde-form-field">
        <label>Text Color</label>
        <input
          type="color"
          value={config.textColor || '#ffffff'}
          onChange={(e) => onChange('textColor', e.target.value)}
        />
      </div>

      <div className="cde-form-field">
        <label>Accent Color</label>
        <input
          type="color"
          value={config.accentColor || '#10b981'}
          onChange={(e) => onChange('accentColor', e.target.value)}
        />
      </div>

      <div className="cde-form-field">
        <label>Price Color</label>
        <input
          type="color"
          value={config.priceColor || '#fbbf24'}
          onChange={(e) => onChange('priceColor', e.target.value)}
        />
      </div>

      <div className="cde-form-field">
        <label>Theme Preset</label>
        <select
          value={config.themePreset || 'dark'}
          onChange={(e) => onChange('themePreset', e.target.value)}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="highcontrast">High Contrast</option>
          <option value="colorful">Colorful</option>
        </select>
      </div>
    </div>
  )
}

function AdvancedTab({ config, onChange }) {
  return (
    <div className="cde-form-group">
      <h3>Advanced Settings</h3>

      <div className="cde-form-field">
        <label>Display Timeout (seconds)</label>
        <input
          type="number"
          min="5"
          max="300"
          step="5"
          value={config.displayTimeout || 30}
          onChange={(e) => onChange('displayTimeout', parseInt(e.target.value))}
        />
        <small>Time to keep order on display when inactive</small>
      </div>

      <div className="cde-form-field">
        <label>Refresh Interval (seconds)</label>
        <input
          type="number"
          min="1"
          max="60"
          step="1"
          value={config.refreshInterval || 5}
          onChange={(e) => onChange('refreshInterval', parseInt(e.target.value))}
        />
        <small>How often to check for updates</small>
      </div>

      <div className="cde-form-field">
        <label>Enable Debug Mode</label>
        <input
          type="checkbox"
          checked={config.debugMode || false}
          onChange={(e) => onChange('debugMode', e.target.checked)}
        />
      </div>

      <div className="cde-form-field">
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

