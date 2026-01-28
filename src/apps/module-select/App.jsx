import React, { useState, useEffect, useMemo, useContext } from 'react'
import { FrappeContext, useFrappeGetCall } from 'frappe-react-sdk'
import { useOperationalContext } from '../../shared/hooks/useOperationalContext'
import './styles.css'
import { POSProfileSwitcher } from '../../shared/components/POSProfileSwitcher'
import { POSOpeningModal } from '../../shared/components/POSOpeningModal'
import POSInfoCard from './components/POSInfoCard'
import ModuleCard from './components/ModuleCard'
import POSProfileSelectModal from './components/POSProfileSelectModal'
import { deskNavigate } from '../../shared/utils/deskNavigate'

function App() {
  // Use operational context hook to manage POS Profile
  const {
    pos_profile: contextPosProfile,
    branch: contextBranch,
    available_profiles: contextAvailableProfiles,
    setContext: setContextOnServer,
    isLoading: contextLoading
  } = useOperationalContext()
  
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
  
  // Navigation lock to prevent duplicate clicks and route bounces
  const [navigationLock, setNavigationLock] = useState(false)
  const [navigatingToModule, setNavigatingToModule] = useState(null)

  // Check for reason and target parameters from URL (redirected from gated modules)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const reason = urlParams.get('reason')
    const target = urlParams.get('target')
    
    if (reason === 'missing_pos_profile' && target && modules.length > 0) {
      // Find the target module
      const targetModule = modules.find(m => m.type === target.replace('imogi-', ''))
      if (targetModule && targetModule.requires_pos_profile && contextState.available_pos_profiles.length > 0) {
        // Auto-open profile selection modal
        console.log('[Module Select] Auto-opening profile modal for:', target)
        setPendingProfileModule(targetModule)
        setShowProfileModal(true)
        
        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [modules, contextState.available_pos_profiles])

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

  const { data: moduleData, isLoading: modulesLoading, error: moduleError, mutate: refetchModuleData } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_available_modules',
    undefined,
    undefined,
    {
      errorRetryCount: 1,
      shouldRetryOnError: true,
      onError: (error) => {
        console.error('[module-select] API call failed:', error)
        // Let Frappe handle session errors - we're a Desk Page
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
        // Data loaded successfully
      }
    }
  )

  useEffect(() => {
    if (!modulesLoading && moduleData) {
      // Frappe API wraps response in .message key
      const payload = moduleData?.message ?? moduleData ?? {}
      
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
      console.error('[module-select] Cannot navigate: no URL provided', module)
      return
    }
    
    // Check navigation lock
    if (navigationLock) {
      console.warn('[module-select] Navigation already in progress, ignoring duplicate request')
      return
    }

    // Normalize to path + search (handle both relative and absolute URLs)
    const url = new URL(base, window.location.origin)
    
    // Acquire navigation lock
    console.log('🔒 [NAVIGATION LOCK] Acquired for', module.name)
    setNavigationLock(true)
    setNavigatingToModule(module.type)
    
    // Phase 5: Route transition instrumentation with byApp counting
    const scripts = [...document.querySelectorAll('script[data-imogi-app]')]
    const byApp = scripts.reduce((acc, s) => {
      const app = s.dataset.imogiApp
      acc[app] = (acc[app] || 0) + 1
      return acc
    }, {})
    
    // Log before navigation
    console.log('🚀 [ROUTE TRANSITION START] Module-select → ' + module.name, {
      from_route: window.location.pathname,
      to_route: url.pathname,
      module_type: module.type,
      module_name: module.name,
      scripts_by_app: byApp,
      scripts_total: scripts.length,
      frappe_current_route: frappe.get_route_str(),
      navigation_lock: true,
      timestamp: new Date().toISOString()
    })
    
    // Use deskNavigate for SPA transition (preserves module-select state)
    deskNavigate(url.pathname + url.search, {
      logPrefix: `[module-select → ${module.type}]`
    })
    
    // Log after navigation call
    console.log('🚀 [ROUTE TRANSITION END] deskNavigate called', {
      to_route: url.pathname,
      frappe_current_route_after: frappe.get_route_str(),
      timestamp: new Date().toISOString()
    })
    
    // Release lock after delay (in case navigation fails)
    setTimeout(() => {
      console.log('🔓 [NAVIGATION LOCK] Released after timeout')
      setNavigationLock(false)
      setNavigatingToModule(null)
    }, 3000)
  }

  const setOperationalContext = async (posProfile, branchOverride) => {
    if (!posProfile) {
      return null
    }

    try {
      // Use frappe.call directly (includes CSRF token automatically)
      const response = await new Promise((resolve, reject) => {
        frappe.call({
          method: 'imogi_pos.utils.operational_context.set_operational_context',
          args: {
            pos_profile: posProfile,
            branch: branchOverride || null
          },
          callback: (r) => {
            // Frappe sometimes sends exceptions in r.exc (status 200 but failed)
            if (r.exc) {
              reject(new Error(r.exc || 'Server error'))
            } else {
              resolve(r)
            }
          },
          error: (err) => {
            reject(err)
          }
        })
      })

      // frappe-react-sdk might wrap response in .message
      const actualResponse = response?.message || response

      if (actualResponse?.success) {
        setContextState((prev) => ({
          ...prev,
          pos_profile: actualResponse.context?.pos_profile || posProfile,
          branch: actualResponse.context?.branch || null,
          require_selection: false
        }))
        return actualResponse
      } else {
        return actualResponse
      }
    } catch (error) {
      throw error
    }
  }

  const proceedToModule = async (module, refreshedData = null) => {
    // Store critical info for debugging if needed
    const logEvent = (message, data = {}) => {
      // Only store in localStorage for debugging, no console spam
      try {
        const logs = JSON.parse(localStorage.getItem('imogi_debug_logs') || '[]')
        logs.push(logEntry)
        // Keep only last 50 logs
        if (logs.length > 50) logs.shift()
        localStorage.setItem('imogi_debug_logs', JSON.stringify(logs))
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    logEvent('Proceeding to module', {
      module_name: module.name,
      requires_pos_profile: module.requires_pos_profile,
      current_pos_profile: contextData.pos_profile,
      url: module.url
    })
    
    // WAJIB: Set context on server if module requires POS Profile
    if (module.requires_pos_profile) {
      if (!contextData.pos_profile) {
        logEvent('ERROR: No POS Profile', { module: module.name })
        frappe.msgprint({
          title: 'POS Profile Required',
          message: 'Please select a POS Profile first.',
          indicator: 'orange'
        })
        return // HARD STOP
      }

      try {
        logEvent('Setting operational context...', { 
          pos_profile: contextData.pos_profile,
          branch: contextData.branch,
          module: module.name
        })
        
        console.log('⚙️  [CONTEXT SET START]', {
          pos_profile: contextData.pos_profile,
          branch: contextData.branch,
          module: module.name,
          timestamp: new Date().toISOString()
        })
        
        const response = await setOperationalContext(contextData.pos_profile, contextData.branch)
        
        console.log('⚙️  [CONTEXT SET END]', {
          success: response?.success,
          has_context: !!response?.context,
          timestamp: new Date().toISOString()
        })
        
        logEvent('setOperationalContext response received', {
          has_success: !!response?.success,
          success: response?.success,
          has_context: !!response?.context,
          response_type: typeof response
        })
        
        if (!response?.success) {
          logEvent('ERROR: Context setting failed', { 
            response: JSON.stringify(response)
          })
          
          console.error('❌ [CONTEXT SET FAILED]', response)
          
          frappe.msgprint({
            title: 'Error',
            message: response?.message || 'Failed to set POS context. Please try again.',
            indicator: 'red'
          })
          return // HARD STOP - don't navigate if context failed
        }
        
        logEvent('Context set successfully', { context: response.context })
        
        console.log('✅ [CONTEXT SET SUCCESS]', { context: response.context })
        
        // Give server MORE time to persist the session (increased from 100ms)
        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (error) {
        logEvent('ERROR: Exception setting context', { 
          error: error.message,
          stack: error.stack
        })
        
        console.error('❌ [CONTEXT SET EXCEPTION]', {
          error: error.message,
          stack: error.stack
        })
        
        frappe.msgprint({
          title: 'Error',
          message: `Failed to set POS context: ${error.message || 'Unknown error'}. Please try again.`,
          indicator: 'red'
        })
        return // HARD STOP - don't navigate if exception occurred
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
    // Prevent duplicate clicks during navigation
    if (navigationLock) {
      console.warn('[module-select] Navigation in progress, ignoring click')
      return
    }
    
    console.log('🖱️  [MODULE CLICK]', module.name, {
      requires_pos_profile: module.requires_pos_profile,
      current_pos_profile: contextData.pos_profile,
      navigation_lock: navigationLock
    })
    
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

  const showDebugLogs = () => {
    try {
      const logs = JSON.parse(localStorage.getItem('imogi_debug_logs') || '[]')
      console.log('=== DEBUG LOGS ===')
      logs.forEach(log => {
        console.log(`[${log.timestamp}] ${log.message}`, log)
      })
      alert(`Found ${logs.length} debug logs. Check browser console (F12) for details.`)
    } catch (e) {
      alert('No debug logs found')
    }
  }

  const clearDebugLogs = () => {
    localStorage.removeItem('imogi_debug_logs')
    alert('Debug logs cleared')
  }

  const handleProfileSelection = async (profileName) => {
    if (!profileName || !pendingProfileModule) {
      handleProfileModalClose()
      return
    }

    try {
      // CRITICAL: Await context setting and validate success
      console.log('[Module Select] Setting context for profile:', profileName)
      const response = await setOperationalContext(profileName)
      
      if (!response?.success) {
        throw new Error(response?.message || 'Failed to set operational context')
      }
      
      console.log('[Module Select] Context set successfully, refreshing module data...')
      const refreshed = await refetchModuleData()
      
      setShowProfileModal(false)
      const moduleToOpen = pendingProfileModule
      setPendingProfileModule(null)
      
      await proceedToModule(moduleToOpen, refreshed)
    } catch (error) {
      console.error('[Module Select] Error setting operational context:', error)
      frappe.msgprint({
        title: 'Error',
        message: error.message || 'Failed to set POS Profile. Please try again.',
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
            <button onClick={showDebugLogs} className="logout-btn" style={{ marginRight: '10px' }}>Debug Logs</button>
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
