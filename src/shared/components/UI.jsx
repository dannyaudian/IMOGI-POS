/**
 * Shared UI Components untuk semua IMOGI POS apps
 */

export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="imogi-loading">
      <div className="spinner"></div>
      <p>{message}</p>
    </div>
  )
}

export function ErrorMessage({ error, onRetry }) {
  return (
    <div className="imogi-error">
      <h3>⚠️ Error</h3>
      <p>{error?.message || String(error)}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-retry">
          Retry
        </button>
      )}
    </div>
  )
}

export function NavBar({ title, user, showBackButton = true }) {
  const handleBack = () => {
    window.location.href = '/app/imogi-pos'
  }

  const handleLogout = () => {
    window.location.href = '/api/method/logout'
  }

  return (
    <nav className="imogi-navbar">
      <div className="navbar-content">
        <div className="navbar-left">
          {showBackButton && (
            <button onClick={handleBack} className="btn-back" title="Back to IMOGI POS Workspace">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
          )}
          <h1 className="navbar-title">{title}</h1>
        </div>
        <div className="navbar-right">
          <span className="navbar-user">👤 {user}</span>
          <button onClick={handleLogout} className="btn-logout" title="Logout">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M7 16H3C2.73478 16 2.48043 15.8946 2.29289 15.7071C2.10536 15.5196 2 15.2652 2 15V3C2 2.73478 2.10536 2.48043 2.29289 2.29289C2.48043 2.10536 2.73478 2 3 2H7M12 13L16 9M16 9L12 5M16 9H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}

export function AppHeader({ title, user, onLogout }) {
  return (
    <header className="imogi-header">
      <div className="header-content">
        <h1>{title}</h1>
        <div className="header-user">
          <span>👤 {user}</span>
          {onLogout && (
            <button onClick={onLogout} className="btn-logout">
              Logout
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export function Card({ title, children, className = '' }) {
  return (
    <div className={`imogi-card ${className}`}>
      {title && <h3 className="card-title">{title}</h3>}
      <div className="card-content">{children}</div>
    </div>
  )
}
