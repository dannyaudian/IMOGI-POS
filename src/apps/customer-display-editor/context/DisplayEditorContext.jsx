import React, { createContext, useContext, useMemo } from 'react'

const DisplayEditorContext = createContext()

export function DisplayEditorProvider({
  selectedDevice,
  setSelectedDevice,
  blocks,
  setBlocks,
  selectedBlock,
  setSelectedBlock,
  deviceType,
  setDeviceType,
  showTemplateSelector,
  setShowTemplateSelector,
  hasChanges,
  setHasChanges,
  profiles,
  saving,
  creating,
  profilesError,
  loadingProfiles,
  loadingTemplates,
  templates,
  // Handlers
  onTemplateSelect,
  onAddBlock,
  onLayoutChange,
  onBlockUpdate,
  onBlockRemove,
  onBlockSelect,
  onSave,
  onReset,
  onTest,
  onDuplicate,
  onCreateNew,
  children
}) {
  const contextValue = useMemo(() => ({
    // STATE
    selectedDevice,
    setSelectedDevice,
    blocks,
    setBlocks,
    selectedBlock,
    setSelectedBlock,
    deviceType,
    setDeviceType,
    showTemplateSelector,
    setShowTemplateSelector,
    hasChanges,
    setHasChanges,
    // DATA
    profiles,
    saving,
    creating,
    profilesError,
    loadingProfiles,
    loadingTemplates,
    templates,
    // HANDLERS
    onTemplateSelect,
    onAddBlock,
    onLayoutChange,
    onBlockUpdate,
    onBlockRemove,
    onBlockSelect,
    onSave,
    onReset,
    onTest,
    onDuplicate,
    onCreateNew
  }), [
    selectedDevice, setSelectedDevice,
    blocks, setBlocks,
    selectedBlock, setSelectedBlock,
    deviceType, setDeviceType,
    showTemplateSelector, setShowTemplateSelector,
    hasChanges, setHasChanges,
    profiles, saving, creating,
    profilesError, loadingProfiles, loadingTemplates, templates,
    onTemplateSelect, onAddBlock, onLayoutChange,
    onBlockUpdate, onBlockRemove, onBlockSelect,
    onSave, onReset, onTest, onDuplicate, onCreateNew
  ])

  return (
    <DisplayEditorContext.Provider value={contextValue}>
      {children}
    </DisplayEditorContext.Provider>
  )
}

export function useDisplayEditorContext() {
  const context = useContext(DisplayEditorContext)
  if (!context) {
    throw new Error('useDisplayEditorContext must be used within DisplayEditorProvider')
  }
  return context
}
