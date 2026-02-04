import { useModuleSelectContext } from '../context/ModuleSelectContext'

/**
 * ModuleSelectHeader - Top navigation bar with logo and user info
 */
export function ModuleSelectHeader({ onDebugClick }) {
  const { realtimeBanner } = useModuleSelectContext()

  return (
    <header className="module-select-header">
      {/* Realtime Banner */}
      {realtimeBanner && (
        <div className="realtime-banner">
          <i className="fa-solid fa-exclamation-triangle"></i>
          {realtimeBanner}
        </div>
      )}

      <div className="header-content">
        <div className="header-brand">
          <i className="fa-solid fa-utensils header-icon"></i>
          <h1>IMOGI POS</h1>
        </div>

        <div className="header-actions">
          <span className="user-name">
            {frappe?.session?.user_fullname || frappe?.session?.user}
          </span>
          <button onClick={onDebugClick} className="logout-btn" style={{ marginRight: '10px' }}>
            Debug Logs
          </button>
          <a href="/api/method/frappe.auth.logout" className="logout-btn">
            Logout
          </a>
        </div>
      </div>
    </header>
  )
}
