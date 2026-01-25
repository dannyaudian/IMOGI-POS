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
    'imogi_pos.api.public.get_available_modules',
    { branch: selectedBranch }
  )

  // Fetch branch info
  const { data: branchData, isLoading: branchLoading } = useFrappeGetCall(
    'imogi_pos.api.public.get_user_branch_info'
  )

  // Fetch current POS opening entry
  const { data: posData, isLoading: posLoading } = useFrappeGetCall(
    'imogi_pos.api.public.get_active_pos_opening',
    { branch: selectedBranch }
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

  const handleModuleClick = (module) => {
    // Store current selection in localStorage
    localStorage.setItem('imogi_selected_branch', selectedBranch)
    localStorage.setItem('imogi_selected_module', module.type)
    
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
        <p>{error || 'No branch configured for your account. Please contact administrator.'}</p>
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
          </div>

          <div className="modules-grid">
            {modules.length > 0 ? (
              modules.map((module) => (
                <ModuleCard
                  key={module.type}
                  module={module}
                  onClick={() => handleModuleClick(module)}
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
