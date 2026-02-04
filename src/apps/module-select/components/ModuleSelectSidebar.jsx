import { useModuleSelectContext } from '../context/ModuleSelectContext'
import POSInfoCard from './POSInfoCard'

/**
 * ModuleSelectSidebar - Left sidebar with profile info, POS opening, and user details
 */
export function ModuleSelectSidebar() {
  const { contextData, activeOpening } = useModuleSelectContext()

  return (
    <aside className="module-select-sidebar">
      {/* POS Profile Info */}
      <div className="sidebar-section">
        <h3>POS Profile</h3>
        <div className="profile-info-card">
          <p className="profile-name">
            {(() => {
              const profile = contextData.pos_profile
              if (!profile) return 'Not Selected'
              if (typeof profile === 'string') return profile
              return profile.name || 'Not Selected'
            })()}
          </p>
          {contextData.branch && (
            <p className="profile-branch">Branch: {contextData.branch}</p>
          )}
        </div>
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
