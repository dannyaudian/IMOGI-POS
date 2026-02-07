import { useModuleSelectContext } from '../context/ModuleSelectContext'
import { useState } from 'react'
import PropTypes from 'prop-types'
import { LINKS } from '@/shared/api/constants'

/**
 * ModuleSelectHeader - Top navigation bar with logo and user info
 */
export function ModuleSelectHeader({ onDebugClick }) {
  const { realtimeBanner } = useModuleSelectContext()
  const [showMenu, setShowMenu] = useState(false)

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      window.location.href = LINKS.LOGOUT_URL
    }
  }

  const handleHelp = () => {
    window.open(LINKS.HELP_DOCS, '_blank')
  }

  return (
    <header className="module-select-header" role="banner">
      {/* Realtime Banner */}
      {realtimeBanner && (
        <div 
          className="realtime-banner" 
          role="alert" 
          aria-live="polite"
        >
          <i className="fa-solid fa-exclamation-triangle" aria-hidden="true"></i>
          {realtimeBanner}
        </div>
      )}

      <div className="header-content">
        <div className="header-brand">
          <i className="fa-solid fa-utensils header-icon" aria-hidden="true"></i>
          <h1>IMOGI POS</h1>
        </div>

        <div className="header-actions">
          <span className="user-name" aria-label={`Logged in as ${frappe?.session?.user_fullname || frappe?.session?.user}`}>
            {frappe?.session?.user_fullname || frappe?.session?.user}
          </span>
          
          {/* Debug Button (conditional - only for developers) */}
          {frappe?.boot?.developer_mode && (
            <button 
              onClick={onDebugClick} 
              className="header-btn header-btn-secondary"
              aria-label="Show debug logs"
              title="Debug Logs"
            >
              <i className="fa-solid fa-bug" aria-hidden="true"></i>
            </button>
          )}

          {/* Help Button */}
          <button 
            onClick={handleHelp}
            className="header-btn header-btn-secondary"
            aria-label="Open help documentation"
            title="Help"
          >
            <i className="fa-solid fa-question-circle" aria-hidden="true"></i>
          </button>

          {/* Menu Dropdown */}
          <div className="header-menu">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="header-btn header-btn-menu"
              aria-label="Open user menu"
              aria-expanded={showMenu}
              aria-haspopup="true"
            >
              <i className="fa-solid fa-bars" aria-hidden="true"></i>
            </button>

            {showMenu && (
              <>
                <div 
                  className="header-menu-overlay" 
                  onClick={() => setShowMenu(false)}
                  aria-hidden="true"
                ></div>
                <div className="header-menu-dropdown" role="menu">
                  <button 
                    className="header-menu-item"
                    onClick={() => {
                      setShowMenu(false)
                      window.location.href = LINKS.USER_PROFILE_URL
                    }}
                    role="menuitem"
                  >
                    <i className="fa-solid fa-user"></i>
                    Profile
                  </button>
                  <button 
                    className="header-menu-item"
                    onClick={() => {
                      setShowMenu(false)
                      window.location.href = LINKS.DESK_HOME_URL
                    }}
                    role="menuitem"
                  >
                    <i className="fa-solid fa-home"></i>
                    Desk Home
                  </button>
                  <div className="header-menu-divider"></div>
                  <button 
                    className="header-menu-item header-menu-item-danger"
                    onClick={() => {
                      setShowMenu(false)
                      handleLogout()
                    }}
                    role="menuitem"
                  >
                    <i className="fa-solid fa-sign-out-alt"></i>
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

ModuleSelectHeader.propTypes = {
  onDebugClick: PropTypes.func.isRequired,
}
