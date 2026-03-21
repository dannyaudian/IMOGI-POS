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

  // HANDLER: Save layout — mutate after save to sync latest, show single alert with count
  const handleSaveLayout = useCallback((response) => {
    mutate()
    const count = response?.tables_positioned ?? null
    if (count === 0) {
      window.frappe?.show_alert?.({
        message: '⚠️ Layout saved but no tables linked. Link each node to a Restaurant Table in the Properties Panel.',
        indicator: 'orange'
      })
    } else {
      window.frappe?.show_alert?.({
        message: count != null
          ? `✅ Layout saved — ${count} table${count !== 1 ? 's' : ''} positioned.`
          : '✅ Layout saved successfully!',
        indicator: 'green'
      })
    }
  }, [mutate])

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
      >
        <main className="imogi-main" style={{ padding: '1.5rem' }}>
          <TableManagementHeader />
          {activeTab === 'layout' && <LayoutEditorPanel />}
          {activeTab === 'display' && <DisplaySettingsPanel />}
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
