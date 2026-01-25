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
  useDuplicateProfile,
  useCreateProfile
} from '../../shared/api/imogi-api'
import { useAuth } from '../../shared/hooks/useAuth'
import { LoadingSpinner, ErrorMessage } from '../../shared/components/UI'
import './styles.css'

/**
 * Customer Display Editor - Main App
 * Manages configuration of customer-facing displays
 */
function App() {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Branch Manager', 'System Manager'])
  // State
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [config, setConfig] = useState({})
  const [activeTab, setActiveTab] = useState('layout')
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [sampleData, setSampleData] = useState(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Check authentication
  if (authLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Authenticating...</div>
  }

  if (authError || !hasAccess) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>{authError || 'Access denied - Manager role required'}</div>
  }

  // API Hooks
  const { data: profilesData, isLoading: loadingProfiles, mutate: refreshProfiles } = useCustomerDisplayProfiles()
  const { data: templates, isLoading: loadingTemplates } = useDisplayTemplates()
  const { trigger: saveConfig, isMutating: saving } = useSaveDisplayConfig()
  const { trigger: resetConfig } = useResetDisplayConfig()
  const { trigger: testDisplay } = useTestDisplay()
  const { trigger: duplicateProfile } = useDuplicateProfile()
  const { trigger: createProfile, isMutating: creating } = useCreateProfile()
  
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
  const handleTemplateSelect = async (data) => {
    if (!data) {
      setShowTemplateSelector(false)
      return
    }

    const { template, profile_name, branch } = data

    try {
      const result = await createProfile({
        profile_name,
        branch,
        template_id: template?.id,
        config: template?.config
      })

      if (result.success) {
        frappe.show_alert({
          message: 'Profile created successfully',
          indicator: 'green'
        })
        
        // Refresh profiles and select the new one
        await refreshProfiles()
        setSelectedDevice(result.profile.name)
        setShowTemplateSelector(false)
      }
    } catch (error) {
      frappe.show_alert({
        message: error.message || 'Failed to create profile',
        indicator: 'red'
      })
    }
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
          templates={templates?.templates || []}
          onTemplateSelect={handleTemplateSelect}
          onCancel={() => setShowTemplateSelector(false)}
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
            <div className="cde-empty-illustration">
              <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="100" cy="100" r="80" fill="#EEF2FF" />
                <rect x="60" y="40" width="80" height="120" rx="8" fill="white" stroke="#6366f1" strokeWidth="3" />
                <rect x="70" y="55" width="60" height="40" rx="4" fill="#6366f1" fillOpacity="0.1" />
                <rect x="70" y="100" width="60" height="6" rx="3" fill="#6366f1" fillOpacity="0.3" />
                <rect x="70" y="112" width="40" height="6" rx="3" fill="#6366f1" fillOpacity="0.2" />
                <circle cx="100" cy="145" r="3" fill="#6366f1" />
              </svg>
            </div>
            <h2>Welcome to Customer Display Editor</h2>
            <p className="cde-empty-subtitle">Configure and manage your customer-facing displays</p>
            <p className="cde-empty-description">
              Select a profile from the sidebar or create a new one to start customizing your display settings
            </p>
            <button className="cde-btn-primary cde-btn-large" onClick={handleCreateNew}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
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

