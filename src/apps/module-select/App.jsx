import React, { useState, useEffect } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import './styles.css'
import { POSProfileSwitcher } from '../../shared/components/POSProfileSwitcher'
import { POSOpeningModal } from '../../shared/components/POSOpeningModal'
import { usePOSProfile } from '../../shared/hooks/usePOSProfile'
import POSInfoCard from './components/POSInfoCard'
import ModuleCard from './components/ModuleCard'

function App() {
  // Use POS Profile as primary selection (not branch)
  const { 
    currentProfile, 
    profileData, 
    availableProfiles, 
    branch: selectedBranch,
    isLoading: profileLoading,
    setProfile,
    isPrivileged
  } = usePOSProfile()
  
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // POS Opening Modal state
  const [showOpeningModal, setShowOpeningModal] = useState(false)
  const [pendingModule, setPendingModule] = useState(null)

  // Fetch available modules based on POS Profile (with branch fallback for compatibility)
  const { data: moduleData, isLoading: modulesLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_available_modules',
    { pos_profile: currentProfile, branch: selectedBranch }
  )

  // Fetch current POS opening entry - now uses pos_profile as primary
  const { data: posData, isLoading: posLoading, mutate: refetchPosData } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_active_pos_opening',
    { pos_profile: currentProfile },
    currentProfile ? undefined : false
  )

  // Fetch all POS opening entries for today (for session selector)
  const { data: posSessionsData, isLoading: posSessionsLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_pos_sessions_today',
    { pos_profile: currentProfile, branch: selectedBranch },
    currentProfile ? undefined : false
  )

  useEffect(() => {
    if (!modulesLoading && moduleData) {
      setModules(moduleData.modules || [])
      setLoading(false)
    }
  }, [moduleData, modulesLoading])
  
  // Listen for POS session opened events (from POSOpeningModal)
  useEffect(() => {
    const handleSessionOpened = (event) => {
      // Refresh POS data
      refetchPosData()
      
      // If there was a pending module, navigate to it
      if (pendingModule) {
        navigateToModule(pendingModule, event.detail)
        setPendingModule(null)
      }
    }
    
    window.addEventListener('posSessionOpened', handleSessionOpened)
    return () => window.removeEventListener('posSessionOpened', handleSessionOpened)
  }, [pendingModule, refetchPosData])

  // Calculate POS opening status
  const posOpeningStatus = {
    hasOpening: !!(posData && posData.pos_opening_entry),
    posOpeningEntry: posData?.pos_opening_entry,
    user: posData?.user,
    openingBalance: posData?.opening_balance
  }
  
  // Navigate to module with proper query params
  const navigateToModule = (module, posSessionData = null) => {
    let url = module.base_url || module.url
    const params = new URLSearchParams()
    
    // Add pos_profile to query params
    if (currentProfile) {
      params.set('pos_profile', currentProfile)
    }
    
    // Add pos_opening_entry if available
    const openingEntry = posSessionData?.pos_opening_entry || posData?.pos_opening_entry
    if (openingEntry && module.requires_opening) {
      params.set('pos_opening_entry', openingEntry)
    }
    
    // Build final URL
    const queryString = params.toString()
    if (queryString) {
      url = `${url}${url.includes('?') ? '&' : '?'}${queryString}`
    }
    
    window.location.href = url
  }

  const handleModuleClick = async (module) => {
    // Store current selection in localStorage (now POS Profile based)
    if (currentProfile) {
      localStorage.setItem('imogi_selected_pos_profile', currentProfile)
      localStorage.setItem('imogi_active_pos_profile', currentProfile)
    }
    if (selectedBranch) {
      localStorage.setItem('imogi_selected_branch', selectedBranch)
    }
    localStorage.setItem('imogi_selected_module', module.type)
    
    // Check if module requires active cashier (for Waiter, Kiosk, Self-Order)
    if (module.requires_active_cashier) {
      try {
        const response = await frappe.call({
          method: 'imogi_pos.api.module_select.check_active_cashiers',
          args: { pos_profile: currentProfile, branch: selectedBranch }
        })
        
        if (!response.message.has_active_cashier) {
          frappe.msgprint({
            title: 'No Active Cashier',
            message: response.message.message || 'No active cashier sessions found. Please ask a cashier to open a POS session first.',
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
      // Check if POS opening exists
      if (!posData || !posData.pos_opening_entry) {
        // No POS opening entry - show modal to create one
        setPendingModule(module)
        setShowOpeningModal(true)
        return
      }
    }
    
    // Navigate to module
    navigateToModule(module)
  }
  
  // Handle POS Opening Modal success
  const handleOpeningSuccess = (result) => {
    setShowOpeningModal(false)
    
    // Navigate to pending module if any
    if (pendingModule) {
      navigateToModule(pendingModule, result)
      setPendingModule(null)
    }
  }
  
  // Handle POS Opening Modal close
  const handleOpeningClose = () => {
    setShowOpeningModal(false)
    setPendingModule(null)
  }

  if (loading || profileLoading) {
    return (
      <div className="module-select-loading">
        <div className="spinner"></div>
        <p>Loading modules...</p>
      </div>
    )
  }

  if (error || (availableProfiles.length === 0 && !profileLoading)) {
    return (
      <div className="module-select-error">
        <div className="error-icon">⚠️</div>
        <h2>Setup Required</h2>
        <p>{error || 'No POS Profile configured for your account.'}</p>
        {isPrivileged ? (
          <div style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>
            <p>As a System Manager, please:</p>
            <ul style={{ textAlign: 'left', display: 'inline-block', marginTop: '0.5rem' }}>
              <li>Create a <a href="/app/pos-profile" style={{ color: '#667eea' }}>POS Profile</a></li>
              <li>Add yourself to the POS Profile's "Applicable For Users" table</li>
              <li>Optionally create a <a href="/app/branch" style={{ color: '#667eea' }}>Branch</a> and link it to the POS Profile</li>
              <li>Then refresh this page</li>
            </ul>
          </div>
        ) : (
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>
            Please contact your system administrator.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="module-select-container">
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
                syncOnChange={true}
              />
            </div>

            {/* POS Session Selector */}
            {posSessionsData && posSessionsData.sessions && posSessionsData.sessions.length > 0 && (
              <div className="header-selector">
                <label className="header-label">POS Session:</label>
                <select 
                  className="header-select"
                  value={posData?.pos_opening_entry || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      // Switch to selected POS session
                      window.location.href = `/app/pos-opening-entry/${e.target.value}`
                    }
                  }}
                >
                  {posSessionsData.sessions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.user} - {session.period_start_date ? new Date(session.period_start_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      {session.name === posData?.pos_opening_entry ? ' (Active)' : ''}
                    </option>
                  ))}
                  <option value="">-- View All Sessions --</option>
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
              <p className="profile-name">{currentProfile || 'Not Selected'}</p>
              {selectedBranch && <p className="profile-branch">Branch: {selectedBranch}</p>}
              {profileData?.domain && <p className="profile-domain">Domain: {profileData.domain}</p>}
              {profileData?.mode && <p className="profile-mode">Mode: {profileData.mode}</p>}
            </div>
          </div>

          {/* POS Opening Info */}
          {posData && (
            <div className="sidebar-section pos-info-section">
              <h3>Active POS</h3>
              <POSInfoCard 
                posData={posData}
                isLoading={posLoading}
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
            
            {/* POS Sessions Overview */}
            {posSessionsData && posSessionsData.sessions && posSessionsData.sessions.length > 0 && (
              <div className="pos-sessions-overview">
                <h3>Active POS Sessions Today ({posSessionsData.sessions.length})</h3>
                <div className="sessions-list">
                  {posSessionsData.sessions.map((session) => (
                    <div 
                      key={session.name} 
                      className={`session-chip ${session.name === posData?.pos_opening_entry ? 'active' : ''}`}
                      onClick={() => window.location.href = `/app/pos-opening-entry/${session.name}`}
                      title={`View ${session.user}'s session`}
                    >
                      <i className="fa-solid fa-user-circle"></i>
                      <span className="session-user">{session.user.split('@')[0]}</span>
                      <span className="session-time">
                        {new Date(session.period_start_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {session.name === posData?.pos_opening_entry && (
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
                <p>No modules available for your role</p>
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
        posProfile={currentProfile}
        required={false}
      />
    </div>
  )
}

export default App
