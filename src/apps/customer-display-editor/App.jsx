import React, { useState, useEffect } from 'react'
import { apiCall } from '../../shared/utils/api'
import {
  DeviceSelector,
  TemplateSelector
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
import { DisplayEditorProvider } from './context/DisplayEditorContext'
import { DisplayEditorContent } from './components/DisplayEditorContent'
import { createBlock, getBlockDefinition } from './utils/blockDefinitions'
import './styles.css'
import './visual-block-editor.css'
import 'react-grid-layout/css/styles.css'

/**
 * Customer Display Editor - Main App
 * Manages configuration of customer-facing displays
 */
function App() {
  // GUARD: No additional auth needed - www page with @require_roles decorator handles it

  // STATE: Display configuration
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [deviceType, setDeviceType] = useState('tablet')
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // API: Fetch profiles and templates
  const { data: profilesData, isLoading: loadingProfiles, error: profilesError, mutate: refreshProfiles } = useCustomerDisplayProfiles()
  const { data: templates, isLoading: loadingTemplates } = useDisplayTemplates()
  const { trigger: saveConfig, isMutating: saving } = useSaveDisplayConfig()
  const { trigger: resetConfig } = useResetDisplayConfig()
  const { trigger: testDisplay } = useTestDisplay()
  const { trigger: duplicateProfile } = useDuplicateProfile()
  const { trigger: createProfile, isMutating: creating } = useCreateProfile()

  // EFFECT: Load device config when device selected
  useEffect(() => {
    if (selectedDevice && profilesData?.devices) {
      const device = profilesData.devices.find(p => p.name === selectedDevice)
      if (device && device.config) {
        const loadedBlocks = device.config.blocks || []
        setBlocks(loadedBlocks)
        setDeviceType(device.config.device_type || 'tablet')
        setHasChanges(false)
      }
    }
  }, [selectedDevice, profilesData])

  // HANDLER: Template selection and profile creation
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

  // HANDLER: Block operations
  const handleAddBlock = (blockType) => {
    const newBlock = createBlock(blockType)
    setBlocks(prev => [...prev, newBlock])
    setHasChanges(true)
  }

  const handleLayoutChange = (newLayout) => {
    setBlocks(prev =>
      prev.map(block => {
        const layoutUpdate = newLayout.find(l => l.i === block.id)
        if (layoutUpdate) {
          return {
            ...block,
            layout: {
              x: layoutUpdate.x,
              y: layoutUpdate.y,
              w: layoutUpdate.w,
              h: layoutUpdate.h
            }
          }
        }
        return block
      })
    )
    setHasChanges(true)
  }

  const handleBlockUpdate = (blockId, updates) => {
    setBlocks(prev =>
      prev.map(block =>
        block.id === blockId ? { ...block, ...updates } : block
      )
    )
    setHasChanges(true)
  }

  const handleBlockRemove = (blockId) => {
    setBlocks(prev => prev.filter(block => block.id !== blockId))
    if (selectedBlock?.id === blockId) {
      setSelectedBlock(null)
    }
    setHasChanges(true)
  }

  const handleBlockSelect = (block) => {
    setSelectedBlock(block)
  }

  // HANDLER: Save configuration
  const handleSave = async () => {
    if (!selectedDevice) return

    const config = {
      blocks: blocks,
      device_type: deviceType,
      version: '2.0'
    }

    try {
      const result = await saveConfig({
        device: selectedDevice,
        config: config
      })

      if (result && result.success) {
        frappe.show_alert({
          message: result.message || 'Configuration saved successfully',
          indicator: 'green'
        })
        setHasChanges(false)
        await refreshProfiles()
      } else {
        frappe.show_alert({
          message: result?.message || 'Failed to save configuration',
          indicator: 'red'
        })
      }
    } catch (error) {
      frappe.show_alert({
        message: error.message || 'Failed to save configuration',
        indicator: 'red'
      })
      console.error('Save error:', error)
    }
  }

  // HANDLER: Reset configuration
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

  // HANDLER: Test display
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

  // HANDLER: Duplicate profile
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

  // HANDLER: Create new profile
  const handleCreateNew = () => {
    setShowTemplateSelector(true)
  }

  // Extract profiles array from API response
  const profiles = Array.isArray(profilesData?.devices) ? profilesData.devices : []

  // RENDER: Main container with provider and sidebar
  return (
    <div className="cde-container">
      <DeviceSelector
        devices={profiles}
        selectedDevice={selectedDevice}
        onDeviceSelect={setSelectedDevice}
        onCreateNew={handleCreateNew}
      />

      <DisplayEditorProvider
        selectedDevice={selectedDevice}
        setSelectedDevice={setSelectedDevice}
        blocks={blocks}
        setBlocks={setBlocks}
        selectedBlock={selectedBlock}
        setSelectedBlock={setSelectedBlock}
        deviceType={deviceType}
        setDeviceType={setDeviceType}
        showTemplateSelector={showTemplateSelector}
        setShowTemplateSelector={setShowTemplateSelector}
        hasChanges={hasChanges}
        setHasChanges={setHasChanges}
        profiles={profiles}
        saving={saving}
        creating={creating}
        profilesError={profilesError}
        loadingProfiles={loadingProfiles}
        loadingTemplates={loadingTemplates}
        templates={templates}
        onTemplateSelect={handleTemplateSelect}
        onAddBlock={handleAddBlock}
        onLayoutChange={handleLayoutChange}
        onBlockUpdate={handleBlockUpdate}
        onBlockRemove={handleBlockRemove}
        onBlockSelect={handleBlockSelect}
        onSave={handleSave}
        onReset={handleReset}
        onTest={handleTest}
        onDuplicate={handleDuplicate}
        onCreateNew={handleCreateNew}
      >
        <DisplayEditorContent />
      </DisplayEditorProvider>
    </div>
  )
}

export default App

