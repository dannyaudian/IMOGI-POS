import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { apiCall } from '../../../shared/utils/api'
import { API } from '@/shared/api/constants'

const STATUS_COLORS = {
  active: '#10b981',
  inactive: '#9ca3af',
  online: '#10b981',
  offline: '#ef4444'
}

const TOGGLE_FIELDS = [
  { key: 'showTableNumbers', label: 'Show Table Numbers' },
  { key: 'showSeats', label: 'Show Seat Count' },
  { key: 'showStatusLabels', label: 'Show Status Labels' },
  { key: 'showWaiterName', label: 'Show Waiter Name' },
  { key: 'showOrderTime', label: 'Show Order Time' },
  { key: 'enableAutoRefresh', label: 'Auto Refresh' },
  { key: 'enableAnimations', label: 'Enable Animations' },
  { key: 'showSectionHeader', label: 'Show Section Header' }
]

const COLOR_FIELDS = [
  { key: 'backgroundColor', label: 'Background' },
  { key: 'textColor', label: 'Text' },
  { key: 'availableColor', label: 'Available Tables' },
  { key: 'occupiedColor', label: 'Occupied Tables' },
  { key: 'reservedColor', label: 'Reserved Tables' },
  { key: 'dirtyColor', label: 'Dirty (Cleaning) Tables' }
]

export function DisplayConfigTab() {
  const [selectedDisplay, setSelectedDisplay] = useState(null)
  const [editedConfig, setEditedConfig] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  // Fetch available displays
  const { data: displays, error: displaysError, isLoading: displaysLoading } = useSWR(
    'table-displays',
    async () => {
      const res = await apiCall(API.GET_AVAILABLE_DISPLAYS)
      return res?.displays || []
    },
    { revalidateOnFocus: false }
  )

  // Fetch config for selected display
  const {
    data: displayConfig,
    isLoading: configLoading,
    mutate: mutateConfig
  } = useSWR(
    selectedDisplay ? ['display-config', selectedDisplay] : null,
    async () => {
      const res = await apiCall(API.GET_DISPLAY_CONFIG, { display: selectedDisplay })
      return res?.config || {}
    },
    { revalidateOnFocus: false }
  )

  // Sync local edit state when config loads or display changes
  useEffect(() => {
    if (displayConfig) {
      setEditedConfig({ ...displayConfig })
    }
  }, [displayConfig])

  const handleConfigChange = (key, value) => {
    setEditedConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!selectedDisplay || !editedConfig) return
    setIsSaving(true)
    try {
      await apiCall(API.SAVE_DISPLAY_CONFIG, { display: selectedDisplay, config: editedConfig })
      mutateConfig()
      window.frappe?.show_alert?.({ message: '✅ Display config saved!', indicator: 'green' })
    } catch (err) {
      window.frappe?.show_alert?.({ message: `Save failed: ${err.message}`, indicator: 'red' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!selectedDisplay) return
    try {
      await apiCall(API.RESET_DISPLAY_CONFIG, { display: selectedDisplay })
      mutateConfig()
      window.frappe?.show_alert?.({ message: 'Config reset to defaults.', indicator: 'blue' })
    } catch (err) {
      window.frappe?.show_alert?.({ message: `Reset failed: ${err.message}`, indicator: 'red' })
    }
  }

  const handleTest = async () => {
    if (!selectedDisplay) return
    setIsTesting(true)
    try {
      await apiCall(API.TEST_DISPLAY, { display: selectedDisplay })
      window.frappe?.show_alert?.({ message: '📺 Test signal sent to display!', indicator: 'green' })
    } catch (err) {
      window.frappe?.show_alert?.({ message: `Test failed: ${err.message}`, indicator: 'red' })
    } finally {
      setIsTesting(false)
    }
  }

  // ─── Loading / Error states ───────────────────────────────────────────────
  if (displaysLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
        Loading display devices…
      </div>
    )
  }

  if (displaysError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
        Failed to load display devices.{' '}
        <button
          onClick={() => window.location.reload()}
          style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!displays || displays.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ background: 'white', padding: '3rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📺</div>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>No Display Devices Found</h3>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.875rem' }}>
            No <strong>Restaurant Table Display</strong> records exist in this branch.
            Create one in the Frappe backend to configure it here.
          </p>
        </div>
      </div>
    )
  }

  // ─── Main layout ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', padding: '1rem' }}>

      {/* Left — Display list */}
      <div>
        <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Display Devices ({displays.length})
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {displays.map(d => (
            <button
              key={d.name}
              onClick={() => { setSelectedDisplay(d.name); setEditedConfig(null) }}
              style={{
                padding: '0.75rem',
                background: selectedDisplay === d.name ? '#ede9fe' : 'white',
                border: selectedDisplay === d.name ? '2px solid #667eea' : '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1f2937' }}>
                  {d.display_name || d.name}
                </span>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: STATUS_COLORS[d.status?.toLowerCase()] || '#9ca3af',
                  flexShrink: 0
                }} />
              </div>
              {d.section && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Section: {d.section}
                </div>
              )}
              {d.ip_address && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                  {d.ip_address}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right — Config panel */}
      <div>
        {!selectedDisplay && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>👈</div>
            Select a display device to configure it.
          </div>
        )}

        {selectedDisplay && configLoading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
            Loading config…
          </div>
        )}

        {selectedDisplay && editedConfig && (
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>
                {displays.find(d => d.name === selectedDisplay)?.display_name || selectedDisplay}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleTest}
                  disabled={isTesting}
                  style={{
                    padding: '0.5rem 0.875rem', background: '#f3f4f6', color: '#374151',
                    border: '1px solid #d1d5db', borderRadius: '6px', cursor: isTesting ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem', fontWeight: '500'
                  }}
                >
                  {isTesting ? '⏳ Testing…' : '📺 Test'}
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    padding: '0.5rem 0.875rem', background: '#f3f4f6', color: '#374151',
                    border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: '500'
                  }}
                >
                  ↺ Reset
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    padding: '0.5rem 0.875rem', background: isSaving ? '#9ca3af' : '#667eea', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem', fontWeight: '600'
                  }}
                >
                  {isSaving ? '⏳ Saving…' : '💾 Save'}
                </button>
              </div>
            </div>

            {/* Form body */}
            <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

              {/* Toggle settings */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                  Display Options
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {TOGGLE_FIELDS.map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.875rem', color: '#4b5563' }}>
                      <input
                        type="checkbox"
                        checked={!!editedConfig[key]}
                        onChange={e => handleConfigChange(key, e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#667eea', cursor: 'pointer' }}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Grid layout */}
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    Grid Columns
                  </label>
                  <select
                    value={editedConfig.gridLayout || '4'}
                    onChange={e => handleConfigChange('gridLayout', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
                  >
                    {['2', '3', '4', '5', '6'].map(n => (
                      <option key={n} value={n}>{n} columns</option>
                    ))}
                  </select>
                </div>

                {/* Polling interval */}
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    Refresh Interval: {editedConfig.pollingInterval || 5}s
                  </label>
                  <input
                    type="range" min="2" max="60" step="1"
                    value={editedConfig.pollingInterval || 5}
                    onChange={e => handleConfigChange('pollingInterval', Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#667eea' }}
                  />
                </div>
              </div>

              {/* Color settings */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                  Colors
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {COLOR_FIELDS.map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <input
                        type="color"
                        value={editedConfig[key] || '#ffffff'}
                        onChange={e => handleConfigChange(key, e.target.value)}
                        style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #d1d5db', cursor: 'pointer', padding: '2px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '500', color: '#374151' }}>{label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>{editedConfig[key]}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Font size */}
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    Font Size
                  </label>
                  <select
                    value={editedConfig.fontSize || '1rem'}
                    onChange={e => handleConfigChange('fontSize', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
                  >
                    {['0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem', '1.5rem'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}

