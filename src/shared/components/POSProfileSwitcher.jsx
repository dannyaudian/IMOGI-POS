/**
 * IMOGI POS - POS Profile Switcher Component
 * 
 * Reusable component for switching between POS Profiles.
 * Can be used in header/navbar of any module.
 */

import React, { useState, useRef, useEffect } from 'react'
import { usePOSProfile } from '../hooks/usePOSProfile'
import './POSProfileSwitcher.css'

/**
 * Dropdown switcher for POS Profile selection
 * @param {Object} props
 * @param {boolean} props.showBranch - Show branch name alongside profile
 * @param {boolean} props.compact - Compact mode for smaller headers
 * @param {boolean} props.syncOnChange - Sync to server when profile changes
 * @param {Function} props.onProfileChange - Callback when profile changes
 */
export function POSProfileSwitcher({ 
  showBranch = true, 
  compact = false,
  syncOnChange = false,
  onProfileChange 
}) {
  const {
    currentProfile,
    profileData,
    availableProfiles,
    isLoading,
    setProfile,
    branch
  } = usePOSProfile()
  
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Handle profile selection
  const handleSelect = async (profileName) => {
    setIsOpen(false)
    
    if (profileName === currentProfile) return
    
    await setProfile(profileName, { syncToServer: syncOnChange })
    
    if (onProfileChange) {
      onProfileChange(profileName)
    }
  }
  
  // Group profiles by branch for display
  const profilesByBranch = availableProfiles.reduce((acc, profile) => {
    const branchName = profile.imogi_branch || 'No Branch'
    if (!acc[branchName]) {
      acc[branchName] = []
    }
    acc[branchName].push(profile)
    return acc
  }, {})
  
  // Don't show switcher if only one profile
  if (availableProfiles.length <= 1 && !isLoading) {
    return (
      <div className={`pos-profile-display ${compact ? 'compact' : ''}`}>
        <span className="profile-name">{currentProfile || 'No Profile'}</span>
        {showBranch && branch && (
          <span className="profile-branch">@ {branch}</span>
        )}
      </div>
    )
  }
  
  if (isLoading) {
    return (
      <div className="pos-profile-switcher loading">
        <span className="loading-text">Loading...</span>
      </div>
    )
  }
  
  return (
    <div 
      className={`pos-profile-switcher ${compact ? 'compact' : ''} ${isOpen ? 'open' : ''}`}
      ref={dropdownRef}
    >
      <button 
        className="switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="trigger-content">
          <span className="profile-icon">📍</span>
          <div className="profile-info">
            <span className="profile-name">{currentProfile || 'Select Profile'}</span>
            {showBranch && branch && (
              <span className="profile-branch">{branch}</span>
            )}
          </div>
          <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </button>
      
      {isOpen && (
        <div className="switcher-dropdown" role="listbox">
          {Object.keys(profilesByBranch).length > 1 ? (
            // Grouped by branch
            Object.entries(profilesByBranch).map(([branchName, profiles]) => (
              <div key={branchName} className="profile-group">
                <div className="group-header">{branchName}</div>
                {profiles.map((profile) => (
                  <button
                    key={profile.name}
                    className={`profile-option ${profile.name === currentProfile ? 'selected' : ''}`}
                    onClick={() => handleSelect(profile.name)}
                    role="option"
                    aria-selected={profile.name === currentProfile}
                  >
                    <span className="option-name">{profile.name}</span>
                    <span className="option-mode">{profile.imogi_mode}</span>
                    {profile.name === currentProfile && (
                      <span className="check-icon">✓</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          ) : (
            // Flat list
            availableProfiles.map((profile) => (
              <button
                key={profile.name}
                className={`profile-option ${profile.name === currentProfile ? 'selected' : ''}`}
                onClick={() => handleSelect(profile.name)}
                role="option"
                aria-selected={profile.name === currentProfile}
              >
                <div className="option-info">
                  <span className="option-name">{profile.name}</span>
                  <span className="option-meta">
                    {profile.imogi_mode}
                    {profile.imogi_branch && ` • ${profile.imogi_branch}`}
                  </span>
                </div>
                {profile.name === currentProfile && (
                  <span className="check-icon">✓</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Inline profile display (non-interactive)
 */
export function POSProfileBadge({ showBranch = true }) {
  const { currentProfile, branch, domain, mode } = usePOSProfile()
  
  if (!currentProfile) return null
  
  return (
    <div className="pos-profile-badge">
      <span className="badge-profile">{currentProfile}</span>
      {showBranch && branch && (
        <span className="badge-branch">@ {branch}</span>
      )}
      {mode && (
        <span className="badge-mode">{mode}</span>
      )}
    </div>
  )
}

export default POSProfileSwitcher
