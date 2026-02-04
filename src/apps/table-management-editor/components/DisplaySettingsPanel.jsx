import { useTableManagementContext } from '../context/TableManagementContext'
import { DisplayConfigTab } from './DisplayConfigTab'

export function DisplaySettingsPanel() {
  const { activeTab } = useTableManagementContext()

  if (activeTab !== 'display') {
    return null
  }

  return <DisplayConfigTab />
}
