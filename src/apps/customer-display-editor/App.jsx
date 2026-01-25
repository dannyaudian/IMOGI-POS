import React, { useState, useEffect } from 'react'
import {
  DeviceSelector,
  PreviewPanel,
  TemplateSelector,
  ConfigPanel
} from './components'
import {
  useCustomerDisplayProfiles,
  useDisplayTemplates,
  useSaveDisplayConfig,
  useResetDisplayConfig,
  useTestDisplay,
  useDuplicateProfile
} from '../../shared/api/imogi-api'
import './styles.css'

/**
 * Customer Display Editor - Main App
 * Manages configuration of customer-facing displays
 */
function App() {
  // State
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [config, setConfig] = useState({})
  const [activeTab, setActiveTab] = useState('layout')
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [sampleData, setSampleData] = useState(null)
  const [hasChanges, setHasChanges] = useState(false)

  // API Hooks
  const { data: profilesData, isLoading: loadingProfiles, mutate: refreshProfiles } = useCustomerDisplayProfiles()
  const { data: templates, isLoading: loadingTemplates } = useDisplayTemplates()
  const { trigger: saveConfig, isMutating: saving } = useSaveDisplayConfig()
  const { trigger: resetConfig } = useResetDisplayConfig()
  const { trigger: testDisplay } = useTestDisplay()
  const { trigger: duplicateProfile } = useDuplicateProfile()
  
  // Extract profiles array from API response
  const profiles = Array.isArray(profilesData?.devices) ? profilesData.devices : []

  // Load device config on selection
  useEffect(() => {
    if (selectedDevice && profiles.length > 0) {
      const device = profiles.find(p => p.name === selectedDevice)
      if (device && device.config) {
        setConfig(device.config)
        setHasChanges(false)
      }
    }
  }, [selectedDevice, profiles])

  // Load sample data
  useEffect(() => {
    if (selectedDevice) {
      frappe.call({
        method: 'imogi_pos.api.customer_display_editor.get_preview_data',
        args: { device: selectedDevice, sample_type: 'restaurant' },
        callback: (r) => {
          if (r.message) {
            setSampleData(r.message)
          }
        }
      })
    }
  }, [selectedDevice])

  // Handle config changes
  const handleConfigChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }))
    setHasChanges(true)
  }

  // Handle template selection
  const handleTemplateSelect = (template) => {
    if (template && template.config) {
      setConfig(template.config)
      setHasChanges(true)
    }
    setShowTemplateSelector(false)
  }

  // Save configuration
  const handleSave = async () => {
    if (!selectedDevice) return

    try {
      await saveConfig({
        device: selectedDevice,
        config: config
      })
      frappe.show_alert({
        message: 'Configuration saved successfully',
        indicator: 'green'
      })
      setHasChanges(false)
      refreshProfiles()
    } catch (error) {
      frappe.show_alert({
        message: 'Failed to save configuration',
        indicator: 'red'
      })
    }
  }

  // Reset configuration
  const handleReset = async () => {
    if (!selectedDevice) return

    frappe.confirm(
      'Are you sure you want to reset to default configuration?',
      async () => {
        try {
          await resetConfig({ device: selectedDevice })
          frappe.show_alert({
            message: 'Configuration reset successfully',
            indicator: 'green'
          })
          refreshProfiles()
        } catch (error) {
          frappe.show_alert({
            message: 'Failed to reset configuration',
            indicator: 'red'
          })
        }
      }
    )
  }

  // Test display
  const handleTest = async () => {
    if (!selectedDevice) return

    try {
      await testDisplay({
        device: selectedDevice,
        message: 'Test Display - ' + new Date().toLocaleTimeString()
      })
      frappe.show_alert({
        message: 'Test message sent to display',
        indicator: 'green'
      })
    } catch (error) {
      frappe.show_alert({
        message: 'Failed to send test message',
        indicator: 'red'
      })
    }
  }

  // Duplicate profile
  const handleDuplicate = async () => {
    if (!selectedDevice) return

    const newName = prompt('Enter name for the new profile:')
    if (!newName) return

    const branch = prompt('Enter branch for the new profile:', 'Main')
    if (!branch) return

    try {
      await duplicateProfile({
        source_profile: selectedDevice,
        new_name: newName,
        new_branch: branch
      })
      frappe.show_alert({
        message: 'Profile duplicated successfully',
        indicator: 'green'
      })
      refreshProfiles()
    } catch (error) {
      frappe.show_alert({
        message: 'Failed to duplicate profile',
        indicator: 'red'
      })
    }
  }

  // Create new profile
  const handleCreateNew = () => {
    setShowTemplateSelector(true)
  }

  if (loadingProfiles) {
    return (
      <div className="cde-loading">
        <div className="cde-spinner"></div>
        <p>Loading profiles...</p>
      </div>
    )
  }

  if (showTemplateSelector) {
    return (
      <div className="cde-container">
        <TemplateSelector
          templates={templates}
          onTemplateSelect={handleTemplateSelect}
        />
      </div>
    )
  }

  return (
    <div className="cde-container">
      {/* Sidebar */}
      <DeviceSelector
        devices={profiles}
        selectedDevice={selectedDevice}
        onDeviceSelect={setSelectedDevice}
        onCreateNew={handleCreateNew}
      />

      {/* Main Content */}
      <main className="cde-main">
        {!selectedDevice ? (
          <div className="cde-empty-content">
            <div className="cde-empty-icon">📱</div>
            <h2>Welcome to Customer Display Editor</h2>
            <p>Select a profile from the sidebar or create a new one to get started</p>
            <button className="cde-btn-primary" onClick={handleCreateNew}>
              Create New Profile
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="cde-header">
              <div className="cde-header-left">
                <h1>Customer Display Editor</h1>
                <span className="cde-header-device">
                  {profiles?.find(p => p.name === selectedDevice)?.profile_name || selectedDevice}
                </span>
              </div>
              <div className="cde-header-right">
                <button
                  className="cde-btn-secondary"
                  onClick={() => setShowTemplateSelector(true)}
                >
                  Templates
                </button>
                <button className="cde-btn-secondary" onClick={handleDuplicate}>
                  Duplicate
                </button>
                <button className="cde-btn-secondary" onClick={handleTest}>
                  Test
                </button>
                <button className="cde-btn-secondary" onClick={handleReset}>
                  Reset
                </button>
                <button
                  className="cde-btn-primary"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </header>

            {/* Content */}
            <div className="cde-content">
              {/* Preview */}
              <PreviewPanel config={config} sampleData={sampleData} />

              {/* Configuration */}
              <div className="cde-config">
                {/* Tabs */}
                <div className="cde-tabs">
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

                {/* Config Panel */}
                <ConfigPanel
                  activeTab={activeTab}
                  config={config}
                  onChange={handleConfigChange}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App

