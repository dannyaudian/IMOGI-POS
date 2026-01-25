import React from 'react'

/**
 * DeviceSelector Component
 * Sidebar for selecting customer display profile
 */
export function DeviceSelector({ devices, selectedDevice, onDeviceSelect, onCreateNew }) {
  // Ensure devices is an array
  const deviceList = Array.isArray(devices) ? devices : []
  
  if (deviceList.length === 0) {
    return (
      <aside className="cde-sidebar">
        <div className="cde-sidebar-header">
          <h3>Display Profiles</h3>
          <button className="cde-btn-add" onClick={onCreateNew}>
            + New
          </button>
        </div>
        <div className="cde-empty-state">
          <p>No profiles yet</p>
          <small>Create your first display profile</small>
        </div>
      </aside>
    )
  }

  return (
    <aside className="cde-sidebar">
      <div className="cde-sidebar-header">
        <h3>Display Profiles</h3>
        <button className="cde-btn-add" onClick={onCreateNew} title="Create new profile">
          + New
        </button>
      </div>

      <div className="cde-device-list">
        {deviceList.map(device => (
          <button
            key={device.name}
            className={`cde-device-item ${selectedDevice === device.name ? 'active' : ''}`}
            onClick={() => onDeviceSelect(device.name)}
          >
            <div className="cde-device-info">
              <div className="cde-device-name">{device.profile_name || device.name}</div>
              <div className="cde-device-meta">
                <span className="cde-device-branch">{device.branch}</span>
                <span className={`cde-device-status ${device.is_active ? 'active' : 'inactive'}`}>
                  {device.is_active ? '●' : '○'}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="cde-sidebar-footer">
        <div className="cde-stats">
          <small>{deviceList.length} profile(s)</small>
        </div>
      </div>
    </aside>
  )
}
