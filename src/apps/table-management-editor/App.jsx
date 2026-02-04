import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { AppHeader } from '@/shared/components/UI'
import { useState, useCallback } from 'react'
import { useLayoutData } from './hooks/useLayoutData'
import { TableManagementProvider } from './context/TableManagementContext'
import { TableManagementHeader, LayoutEditorPanel, DisplaySettingsPanel } from './components'

function TableManagementEditorContent({ initialState }) {
  // SETUP: Initial state
  const branch = initialState.branch || 'Default'
  const user = window.frappe?.session?.user || 'Guest'

  // STATE: Tab and floor selection
  const [activeTab, setActiveTab] = useState('layout')
  const [selectedFloor, setSelectedFloor] = useState(null)

  // API: Fetch layout data
  const { data: layoutData, error: layoutError, isLoading: layoutLoading, mutate } = useLayoutData(selectedFloor)

  // HANDLER: Save layout
  const handleSaveLayout = useCallback(() => {
    mutate()
    window.frappe?.show_alert?.({
      message: '✅ Layout saved successfully!',
      indicator: 'green'
    })
  }, [mutate])

  // HANDLER: Add node
  const handleAddNode = useCallback((node) => {
    console.log('[imogi][layout] Adding node:', node)
  }, [])

  // RENDER: Main app with provider
  return (
    <div className="imogi-app">
      <AppHeader title="Restaurant Table Management" user={user} />

      <TableManagementProvider
        branch={branch}
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedFloor={selectedFloor}
        setSelectedFloor={setSelectedFloor}
        layoutData={layoutData}
        layoutError={layoutError}
        layoutLoading={layoutLoading}
        onSaveLayout={handleSaveLayout}
        onAddNode={handleAddNode}
      >
        <main className="imogi-main" style={{ padding: '1.5rem' }}>
          <TableManagementHeader />
          <LayoutEditorPanel />
          <DisplaySettingsPanel />
        </main>
      </TableManagementProvider>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <TableManagementEditorContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
