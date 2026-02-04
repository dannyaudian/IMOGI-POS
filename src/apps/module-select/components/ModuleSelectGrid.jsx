import { useModuleSelectContext } from '../context/ModuleSelectContext'
import ModuleCard from './ModuleCard'

/**
 * ModuleSelectGrid - Main content area with modules grid and sessions overview
 */
export function ModuleSelectGrid({ onModuleClick }) {
  const { 
    visibleModules, 
    sessionsToday, 
    activeOpening, 
    debugInfo,
    navigationLock,
    navigatingToModule,
    posOpeningStatus
  } = useModuleSelectContext()

  return (
    <section className="module-select-content">
      <div className="modules-header">
        <h2>Available Modules</h2>
        <p>Select a module to get started</p>
        
        {/* POS Openings Overview */}
        {sessionsToday?.sessions && sessionsToday.sessions.length > 0 && (
          <div className="pos-sessions-overview">
            <h3>Active POS Openings Today ({sessionsToday.sessions.length})</h3>
            <div className="sessions-list">
              {sessionsToday.sessions.map((session) => (
                <div 
                  key={session.name} 
                  className={`session-chip ${session.name === activeOpening?.pos_opening_entry ? 'active' : ''}`}
                  onClick={() => window.location.href = `/app/pos-opening-entry/${session.name}`}
                  title={`View ${session.user}'s session`}
                >
                  <i className="fa-solid fa-user-circle"></i>
                  <span className="session-user">{session.user.split('@')[0]}</span>
                  <span className="session-time">
                    {new Date(session.period_start_date).toLocaleTimeString('id-ID', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                  {session.name === activeOpening?.pos_opening_entry && (
                    <span className="session-badge-active">You</span>
                  )}
                </div>
              ))}
            </div>
            <p className="sessions-note">
              <i className="fa-solid fa-info-circle"></i>
              Modules marked "Session Active" use your current session. 
              Modules marked "Always Available" work independently.
            </p>
          </div>
        )}
      </div>

      <div className="modules-grid">
        {visibleModules.length > 0 ? (
          visibleModules.map((module) => (
            <ModuleCard
              key={module.type}
              module={module}
              onClick={() => onModuleClick(module)}
              posOpeningStatus={posOpeningStatus}
              isNavigating={navigationLock}
              isLoading={navigatingToModule === module.type}
            />
          ))
        ) : (
          <div className="no-modules">
            <p className="no-modules-title">No modules available for your role</p>
            {debugInfo && (
              <div className="debug-info">
                <p><strong>Debug Information:</strong></p>
                <ul>
                  <li>User: {frappe?.session?.user}</li>
                  <li>Your Roles: {debugInfo.user_roles?.join(', ') || 'None'}</li>
                  <li>Is Admin: {debugInfo.is_admin ? 'Yes' : 'No'}</li>
                  <li>Total Modules Configured: {debugInfo.total_modules_configured}</li>
                  <li>Modules Available: {debugInfo.modules_available}</li>
                  <li>Visible After Filtering: {visibleModules.length}</li>
                </ul>
                <p className="help-text">
                  <i className="fa-solid fa-info-circle"></i>
                  Please contact your administrator to assign appropriate roles. 
                  Required roles: Cashier, Waiter, Kitchen Staff, Branch Manager, Area Manager, or System Manager.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
