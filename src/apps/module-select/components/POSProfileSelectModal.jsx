import React, { useEffect, useMemo, useState } from 'react'

function POSProfileSelectModal({ isOpen, moduleName, profiles = [], onClose, onConfirm }) {
  const [selectedProfile, setSelectedProfile] = useState('')

  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [profiles])

  useEffect(() => {
    if (isOpen) {
      setSelectedProfile(sortedProfiles[0]?.name || '')
    }
  }, [isOpen, sortedProfiles])

  if (!isOpen) {
    return null
  }

  const handleConfirm = () => {
    if (!selectedProfile) {
      return
    }
    onConfirm?.(selectedProfile)
  }

  return (
    <div className="pos-profile-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-profile-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pos-profile-modal-header">
          <h2>Select POS Profile</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="pos-profile-modal-body">
          <p className="pos-profile-modal-description">
            Choose a POS Profile to continue{moduleName ? ` to ${moduleName}` : ''}.
          </p>

          {sortedProfiles.length === 0 ? (
            <div className="pos-profile-empty">
              <p>No POS Profiles available. Please contact your administrator.</p>
            </div>
          ) : (
            <div className="pos-profile-selector">
              <label htmlFor="pos-profile-select">POS Profile</label>
              <select
                id="pos-profile-select"
                value={selectedProfile}
                onChange={(event) => setSelectedProfile(event.target.value)}
              >
                {sortedProfiles.map((profile) => (
                  <option key={profile.name} value={profile.name}>
                    {profile.name}
                    {profile.mode || profile.imogi_mode ? ` • ${profile.mode || profile.imogi_mode}` : ''}
                    {profile.branch || profile.imogi_branch ? ` • ${profile.branch || profile.imogi_branch}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="pos-profile-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!selectedProfile}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export default POSProfileSelectModal
