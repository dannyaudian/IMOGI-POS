import React, { useState, useEffect, useMemo, useContext } from 'react'
import { FrappeContext, useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import './styles.css'
import { POSProfileSwitcher } from '../../shared/components/POSProfileSwitcher'
import { POSOpeningModal } from '../../shared/components/POSOpeningModal'
import POSInfoCard from './components/POSInfoCard'
import ModuleCard from './components/ModuleCard'
import POSProfileSelectModal from './components/POSProfileSelectModal'

function App() {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeOpening, setActiveOpening] = useState(null)
  const [sessionsToday, setSessionsToday] = useState({ sessions: [], total: 0 })
  const [realtimeBanner, setRealtimeBanner] = useState(null)
  const [debugInfo, setDebugInfo] = useState(null)
  const [contextState, setContextState] = useState({
    pos_profile: null,
    branch: null,
    require_selection: false,
    available_pos_profiles: [],
    is_privileged: false
  })
  
  // POS Opening Modal state
  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [pendingModule, setPendingModule] = useState(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [pendingProfileModule, setPendingProfileModule] = useState(null)

  // Fetch available modules - no parameters needed
  const frappeContext = useContext(FrappeContext)
  const realtimeSocket = frappeContext?.socket
  const debugRealtime = Boolean(frappe?.boot?.sysdefaults?.imogi_pos_debug_realtime)
  const maskUser = (user) => {
    if (!user) return 'unknown'
    const parts = user.split('@')
    const name = parts[0]
    const maskedName = name.length > 1 ? `${name[0]}***${name.slice(-1)}` : `${name[0]}***`
    return parts.length > 1 ? `${maskedName}@${parts[1]}` : maskedName
  }
  const maskSid = (sid) => {
    if (!sid) return 'unknown'
    if (sid.length <= 8) return `${sid.slice(0, 2)}***${sid.slice(-2)}`
    return `${sid.slice(0, 4)}***${sid.slice(-4)}`
  }
  const isSessionError = (error) => {
    if (!error) return false
    const status = error?.httpStatus || error?.status || error?.response?.status
    if (status === 401 || status === 403 || status === 417) return true
    const message = error?.message || error?.response?.data?.message
    return typeof message === 'string' && message.toLowerCase().includes('session stopped')
  }

  const { data: moduleData, isLoading: modulesLoading, error: moduleError, mutate: refetchModuleData } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_available_modules',
    undefined,
    undefined,
    {
      errorRetryCount: 1,
      shouldRetryOnError: (error) => !isSessionError(error),
      onError: (error) => {
        console.error('[module-select] API call failed:', error)
        if (isSessionError(error)) {
          setRealtimeBanner('Realtime disconnected, continuing without realtime')
        }
        if (debugRealtime) {
          console.warn('[module-select] module fetch error', {
            status: error?.httpStatus || error?.status || error?.response?.status,
            message: error?.message || error?.response?.data?.message,
            user: maskUser(frappe?.session?.user),
            sid: maskSid(frappe?.session?.sid)
          })
        }
      },
      onSuccess: (data) => {
        const payload = data?.message ?? data ?? {}
        console.log('[module-select] API call successful', {
          has_modules: !!payload.modules,
          modules_count: payload.modules?.length || 0,
          has_context: !!payload.context,
          pos_profile: payload.context?.current_pos_profile,
          branch: payload.context?.current_branch
        })
      }
    }
  )

  const { call: setContextOnServer } = useFrappePostCall(
    'imogi_pos.utils.operational_context.set_operational_context'
  )

  useEffect(() => {
    if (!modulesLoading && moduleData) {
      console.log('[module-select] Raw API response:', moduleData)
      
      // Frappe API wraps response in .message key
      const payload = moduleData?.message ?? moduleData ?? {}
      
      console.log('[module-select] Normalized payload:', payload)
      console.log('[module-select] Modules count:', payload.modules?.length || 0)
      console.log('[module-select] Current POS Profile:', payload.context?.current_pos_profile)
      console.log('[module-select] Context:', payload.context)
      
      setModules(payload.modules || [])
      setActiveOpening(payload.active_opening || null)
      setSessionsToday(payload.sessions_today || { sessions: [], total: 0 })
      setDebugInfo(payload.debug_info || null)
      setLoading(false)
    }
  }, [moduleData, modulesLoading])

  useEffect(() => {
    if (!realtimeSocket) {
      return
    }

    const logRealtime = (message, detail) => {
      if (!debugRealtime) return
      console.warn('[module-select][realtime]', message, {
        ...detail,
        user: maskUser(frappe?.session?.user),
        sid: maskSid(frappe?.session?.sid)
      })
    }

    const handleConnect = () => {
      setRealtimeBanner(null)
      logRealtime('connected')
    }

    const handleDisconnect = (reason) => {
      setRealtimeBanner('Realtime disconnected, continuing without realtime')
      logRealtime('disconnected', { reason })
    }

    const handleConnectError = (error) => {
      setRealtimeBanner('Realtime disconnected, continuing without realtime')
      logRealtime('connect_error', { error: error?.message || error })
    }

    const handleReconnectFailed = () => {
      setRealtimeBanner('Realtime disconnected, continuing without realtime')
      logRealtime('reconnect_failed')
      try {
        realtimeSocket.io?.reconnection(false)
      } catch (error) {
        logRealtime('reconnection_disable_failed', { error: error?.message || error })
      }
    }

    try {
      realtimeSocket.io?.reconnectionAttempts?.(1)
      realtimeSocket.io?.reconnectionDelay?.(1000)
      realtimeSocket.io?.reconnectionDelayMax?.(3000)
      realtimeSocket.on('connect', handleConnect)
      realtimeSocket.on('disconnect', handleDisconnect)
      realtimeSocket.on('connect_error', handleConnectError)
      realtimeSocket.io?.on?.('reconnect_failed', handleReconnectFailed)
    } catch (error) {
      logRealtime('init_failed', { error: error?.message || error })
    }

    return () => {
      realtimeSocket.off('connect', handleConnect)
      realtimeSocket.off('disconnect', handleDisconnect)
      realtimeSocket.off('connect_error', handleConnectError)
      realtimeSocket.io?.off?.('reconnect_failed', handleReconnectFailed)
    }
  }, [realtimeSocket, debugRealtime])

  useEffect(() => {
    const payload = moduleData?.message ?? moduleData ?? {}
    const ctx = payload.context
    
    if (ctx) {
      console.log('[module-select] Setting context state:', {
        pos_profile: ctx.current_pos_profile,
        branch: ctx.current_branch,
        available_profiles_count: ctx.available_pos_profiles?.length || 0
      })
      
      setContextState({
        pos_profile: ctx.current_pos_profile || null,
        branch: ctx.current_branch || null,
        require_selection: ctx.require_selection || false,
        available_pos_profiles: ctx.available_pos_profiles || [],
        is_privileged: ctx.is_privileged || false
      })
    }
  }, [moduleData])

  const contextData = useMemo(() => ({
    pos_profile: contextState.pos_profile,
    branch: contextState.branch,
    require_selection: contextState.require_selection,
    available_pos_profiles: contextState.available_pos_profiles,
    is_privileged: contextState.is_privileged
  }), [contextState])
  
  // Listen for POS opening events (from POSOpeningModal)
  useEffect(() => {
    const handleSessionOpened = (event) => {
      // Refresh module data (includes active opening + sessions today)
      refetchModuleData()
      
      // If there was a pending module, navigate to it
      if (pendingModule) {
        void navigateToModule(pendingModule)
        setPendingModule(null)
      }
    }
    
    window.addEventListener('posSessionOpened', handleSessionOpened)
    return () => window.removeEventListener('posSessionOpened', handleSessionOpened)
  }, [pendingModule, refetchModuleData])

  // Calculate POS opening status
  const posOpeningStatus = {
    hasOpening: !!(activeOpening && activeOpening.pos_opening_entry),
    posOpeningEntry: activeOpening?.pos_opening_entry,
    user: activeOpening?.user,
    openingBalance: activeOpening?.opening_balance
  }
  
  const navigateToModule = (module) => {
    const base = module?.base_url || module?.url || ''
    if (!base) {
      return
    }

    const url = new URL(base, window.location.origin)
    window.location.href = url.pathname
  }

  const setOperationalContext = async (posProfile, branchOverride) => {
    if (!posProfile) {
      return null
    }

    const response = await setContextOnServer({
      pos_profile: posProfile,
      branch: branchOverride || null
    })

    if (response?.success) {
      setContextState((prev) => ({
        ...prev,
        pos_profile: response.context?.pos_profile || posProfile,
        branch: response.context?.branch || null,
        require_selection: false
      }))
    }

    return response
  }

  const proceedToModule = async (module, refreshedData = null) => {
    // Set context on server (replaces localStorage)
    if (contextData.pos_profile) {
      try {
        await setOperationalContext(contextData.pos_profile, contextData.branch)
      } catch (error) {
        console.error('Error setting operational context:', error)
      }
    }
    
    // Check if module requires active cashier (for Waiter, Kiosk, Self-Order)
    if (module.requires_active_cashier) {
      try {
        const response = await frappe.call({
          method: 'imogi_pos.api.module_select.check_active_cashiers'
        })
        
        if (!response.message.has_active_cashier) {
          frappe.msgprint({
            title: 'No Active Cashier',
            message: response.message.message || 'No active cashier sessions found. Please ask a cashier to open a POS opening first.',
            indicator: 'orange'
          })
          return
        }
      } catch (err) {
        console.error('Error checking active cashiers:', err)
        frappe.msgprint({
          title: 'Error',
          message: 'Could not verify cashier sessions. Please try again.',
          indicator: 'red'
        })
        return
      }
    }

    // Check if module requires POS opening entry
    if (module.requires_opening) {
      // Normalize refreshedData payload (handle .message wrapper)
      const refreshedPayload = refreshedData?.message ?? refreshedData ?? null
      const openingData = refreshedPayload?.active_opening || activeOpening

      // Check if POS opening exists
      if (!openingData || !openingData.pos_opening_entry) {
        // No POS opening entry - show modal to create one
        setPendingModule(module)
        setShowOpeningModal(true)
        return
      }
    }
    
    // Navigate to module
    navigateToModule(module)
  }

  const handleModuleClick = async (module) => {
    if (module.requires_pos_profile && !contextData.pos_profile) {
      if (contextData.available_pos_profiles.length === 0) {
        frappe.msgprint({
          title: 'POS Profile Required',
          message: 'No POS Profiles are available for selection. Please contact administrator.',
          indicator: 'orange'
        })
        return
      }
      setPendingProfileModule(module)
      setShowProfileModal(true)
      return
    }

    await proceedToModule(module)
  }
  
  // Handle POS Opening Modal success
  const handleOpeningSuccess = (result) => {
    setShowOpeningModal(false)
    
    // Navigate to pending module if any
    if (pendingModule) {
      void navigateToModule(pendingModule)
      setPendingModule(null)
    }
  }
  
  // Handle POS Opening Modal close
  const handleOpeningClose = () => {
    setShowOpeningModal(false)
    setPendingModule(null)
  }

  const handleProfileModalClose = () => {
    setShowProfileModal(false)
    setPendingProfileModule(null)
  }

  const handleProfileSelection = async (profileName) => {
    if (!profileName || !pendingProfileModule) {
      handleProfileModalClose()
      return
    }

    try {
      await setOperationalContext(profileName)
      const refreshed = await refetchModuleData()
      setShowProfileModal(false)
      const moduleToOpen = pendingProfileModule
      setPendingProfileModule(null)
      await proceedToModule(moduleToOpen, refreshed)
    } catch (error) {
      console.error('Error setting operational context:', error)
      frappe.msgprint({
        title: 'Error',
        message: 'Failed to set POS Profile. Please try again.',
        indicator: 'red'
      })
    }
  }

  // Show loading while profile is being fetched
  if (modulesLoading) {
    return (
      <div className="module-select-loading">
        <div className="spinner"></div>
        <p>Loading module data...</p>
      </div>
    )
  }

  // Show loading while modules are being fetched (after profile is ready)
  if (loading) {
    return (
      <div className="module-select-loading">
        <div className="spinner"></div>
        <p>Loading modules...</p>
      </div>
    )
  }

  return (
    <div className="module-select-container">
      {realtimeBanner && (
        <div className="realtime-banner" role="status" aria-live="polite">
          <span className="realtime-banner-icon">⚠️</span>
          <span>{realtimeBanner}</span>
        </div>
      )}
      {/* Header */}
      <header className="module-select-header">
        <div className="header-content">
          <div className="logo-section">
            <img src="/assets/imogi_pos/images/imogi2.png" alt="IMOGI Logo" className="header-logo" />
            <div className="header-title">
              <h1>IMOGI POS</h1>
              <p>Module Selection</p>
            </div>
          </div>
          
          <div className="header-info">
            {/* POS Profile Selector (replaces Branch Selector) */}
            <div className="header-selector">
              <label className="header-label">POS Profile:</label>
              <POSProfileSwitcher 
                showBranch={true}
                currentProfile={contextData.pos_profile}
                availableProfiles={contextData.available_pos_profiles}
                branch={contextData.branch}
                isLoading={modulesLoading}
                onProfileChange={async (profileName) => {
                  try {
                    const response = await setContextOnServer({
                      pos_profile: profileName
                    })
                    if (response?.success) {
                      setContextState((prev) => ({
                        ...prev,
                        pos_profile: response.context?.pos_profile || profileName,
                        branch: response.context?.branch || null,
                        require_selection: false
                      }))
                    }
                  } catch (err) {
                    console.error('Error setting operational context:', err)
                  }
                }}
              />
            </div>

            {/* POS Opening Selector */}
            {sessionsToday && sessionsToday.sessions && sessionsToday.sessions.length > 0 && (
              <div className="header-selector">
                <label className="header-label">POS Opening:</label>
                <select 
                  className="header-select"
                  value={activeOpening?.pos_opening_entry || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      // Switch to selected POS opening
                      window.location.href = `/app/pos-opening-entry/${e.target.value}`
                    }
                  }}
                >
                  {sessionsToday.sessions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.user} - {session.period_start_date ? new Date(session.period_start_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      {session.name === activeOpening?.pos_opening_entry ? ' (Active)' : ''}
                    </option>
                  ))}
                  <option value="">-- View All Openings --</option>
                </select>
              </div>
            )}
            
            <span className="user-name">{frappe?.session?.user_fullname || frappe?.session?.user}</span>
            <a href="/api/method/frappe.auth.logout" className="logout-btn">Logout</a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="module-select-main">
        {/* Left Sidebar - POS Profile & POS Info */}
        <aside className="module-select-sidebar">
          {/* POS Profile Info */}
          <div className="sidebar-section">
            <h3>POS Profile</h3>
            <div className="profile-info-card">
              <p className="profile-name">
                {(() => {
                  // Handle both string and object types for backward compatibility
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
              <POSInfoCard 
                posData={activeOpening}
                isLoading={modulesLoading}
              />
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
                <p className="user-name-card">{frappe?.session?.user_fullname || frappe?.session?.user}</p>
                <p className="user-email">{frappe?.session?.user}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Content - Modules */}
        <section className="module-select-content">
          <div className="modules-header">
            <h2>Available Modules</h2>
            <p>Select a module to get started</p>
            
            {/* POS Openings Overview */}
            {sessionsToday && sessionsToday.sessions && sessionsToday.sessions.length > 0 && (
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
                        {new Date(session.period_start_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
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
            {modules.length > 0 ? (
              modules.map((module) => (
                <ModuleCard
                  key={module.type}
                  module={module}
                  onClick={() => handleModuleClick(module)}
                  posOpeningStatus={posOpeningStatus}
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
      </main>

      {/* Footer */}
      <footer className="module-select-footer">
        <p>&copy; 2025 IMOGI Restaurant POS. All rights reserved.</p>
      </footer>
      
      {/* POS Opening Modal */}
      <POSOpeningModal
        isOpen={showOpeningModal}
        onClose={handleOpeningClose}
        onSuccess={handleOpeningSuccess}
        posProfile={contextData.pos_profile}
        required={false}
      />

      <POSProfileSelectModal
        isOpen={showProfileModal}
        moduleName={pendingProfileModule?.name}
        profiles={contextData.available_pos_profiles}
        onClose={handleProfileModalClose}
        onConfirm={handleProfileSelection}
      />
    </div>
  )
}

export default App
