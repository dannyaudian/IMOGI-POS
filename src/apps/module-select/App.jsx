import React, { useState, useEffect } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import './styles.css'
import BranchSelector from './components/BranchSelector'
import POSInfoCard from './components/POSInfoCard'
import ModuleCard from './components/ModuleCard'

function App() {
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch available modules based on user permissions
  const { data: moduleData, isLoading: modulesLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_available_modules',
    { branch: selectedBranch }
  )

  // Fetch branch info
  const { data: branchData, isLoading: branchLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_user_branch_info'
  )

  // Fetch current POS opening entry
  const { data: posData, isLoading: posLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_active_pos_opening',
    { branch: selectedBranch }
  )

  // Fetch all POS opening entries for today (for session selector)
  const { data: posSessionsData, isLoading: posSessionsLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_pos_sessions_today',
    { branch: selectedBranch },
    selectedBranch ? undefined : false
  )

  useEffect(() => {
    if (!modulesLoading && moduleData) {
      setModules(moduleData.modules || [])
      setLoading(false)
    }
  }, [moduleData, modulesLoading])

  useEffect(() => {
    if (branchData && !selectedBranch) {
      setSelectedBranch(branchData.current_branch)
    }
  }, [branchData])

  // Calculate POS opening status
  const posOpeningStatus = {
    hasOpening: !!(posData && posData.pos_opening_entry),
    posOpeningEntry: posData?.pos_opening_entry,
    user: posData?.user,
    openingBalance: posData?.opening_balance
  }

  const handleModuleClick = async (module) => {
    // Store current selection in localStorage
    localStorage.setItem('imogi_selected_branch', selectedBranch)
    localStorage.setItem('imogi_selected_module', module.type)
    
    // Check if module requires active cashier (for Waiter, Kiosk, Self-Order)
    if (module.requires_active_cashier) {
      try {
        const response = await frappe.call({
          method: 'imogi_pos.api.module_select.check_active_cashiers',
          args: { branch: selectedBranch }
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
        // No POS opening entry - redirect to create one
        const posProfile = posData?.pos_profile_name || 'default'
        frappe.msgprint({
          title: 'POS Opening Required',
          message: 'Please open a POS session before accessing this module.',
          indicator: 'orange',
          primary_action: {
            label: 'Open POS Session',
            action: function() {
              window.location.href = `/app/pos-opening-entry/new?pos_profile=${posProfile}`
            }
          }
        })
        return
      }
    }
    
    // Navigate to module
    window.location.href = module.url
  }

  if (loading || branchLoading) {
    return (
      <div className="module-select-loading">
        <div className="spinner"></div>
        <p>Loading modules...</p>
      </div>
    )
  }

  if (error || (branchData && !branchData.current_branch)) {
    return (
      <div className="module-select-error">
        <div className="error-icon">⚠️</div>
        <h2>Setup Required</h2>
        <p>{error || 'No branch configured for your account.'}</p>
        {frappe?.session?.user === 'Administrator' || (moduleData?.roles && moduleData.roles.includes('System Manager')) ? (
          <div style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>
            <p>As a System Manager, you can:</p>
            <ul style={{ textAlign: 'left', display: 'inline-block', marginTop: '0.5rem' }}>
              <li>Create a <a href="/app/company" style={{ color: '#667eea' }}>Company</a></li>
              <li>Or create a custom <a href="/app/branch" style={{ color: '#667eea' }}>Branch</a> (if Branch DocType exists)</li>
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
            {/* Branch Selector */}
            <div className="header-selector">
              <label className="header-label">Branch:</label>
              <select 
                className="header-select"
                value={selectedBranch || ''}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                {branchData?.available_branches?.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.branch || branch.name}
                  </option>
                ))}
              </select>
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
        {/* Left Sidebar - Branch & POS Info */}
        <aside className="module-select-sidebar">
          {/* Branch Selector */}
          <div className="sidebar-section">
            <h3>Branch</h3>
            <BranchSelector 
              currentBranch={selectedBranch}
              branches={branchData?.available_branches || []}
              onBranchChange={setSelectedBranch}
            />
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
    </div>
  )
}

export default App
