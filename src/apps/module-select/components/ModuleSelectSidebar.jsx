import { useModuleSelectContext } from '../context/ModuleSelectContext'
import POSInfoCard from './POSInfoCard'
import { POSProfileSwitcher } from '../../../shared/components/POSProfileSwitcher'

/**
 * ModuleSelectSidebar - Left sidebar with profile info, POS opening, and user details
 */
export function ModuleSelectSidebar() {
  const { contextData, activeOpening, onProfileChange } = useModuleSelectContext()

  return (
    <aside className="module-select-sidebar">
      {/* POS Profile Info */}
      <div className="sidebar-section">
        <h3>POS Profile</h3>
        <POSProfileSwitcher
          currentProfile={contextData.pos_profile}
          availableProfiles={contextData.available_pos_profiles || []}
          branch={contextData.branch}
          showBranch={true}
          compact={true}
          onProfileChange={onProfileChange}
        />
      </div>

      {/* POS Opening Info */}
      {activeOpening && (
        <div className="sidebar-section pos-info-section">
          <h3>Active POS</h3>
          <POSInfoCard posData={activeOpening} />
        </div>
      )}

      {/* User Info Card */}
      <div className="sidebar-section user-section">
        <h3>Account</h3>
        <div className="user-card">
          <div className="user-avatar">
            {(frappe?.session?.user_fullname || frappe?.session?.user)?.[0]?.toUpperCase()}
          </div>
          <div className="user-details">
            <p className="user-name-card">
              {frappe?.session?.user_fullname || frappe?.session?.user}
            </p>
            <p className="user-email">{frappe?.session?.user}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
