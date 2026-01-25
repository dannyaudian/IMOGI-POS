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
