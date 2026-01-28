import React from 'react'
import { apiCall } from '@/shared/utils/api'
import { setItem } from '@/shared/utils/storage'

function BranchSelector({ currentBranch, branches, onBranchChange }) {
  const handleChange = async (e) => {
    const branch = e.target.value
    onBranchChange(branch)
    // Store in storage
    setItem('selected_branch', branch)
    
    // Update user preference in backend
    try {
      const result = await apiCall('imogi_pos.api.public.set_user_branch', { branch })
      if (result && result.success) {
        console.log('[imogi][branch] Branch updated successfully:', branch)
      }
    } catch (error) {
      console.error('[imogi][branch] Failed to update branch:', error)
      if (window.frappe && window.frappe.msgprint) {
        frappe.msgprint({
          title: 'Error',
          message: 'Failed to update branch. Please try again.',
          indicator: 'red'
        })
      }
    }
  }

  // Get display name for current branch
  const getCurrentBranchDisplay = () => {
    if (!currentBranch || !branches) return currentBranch
    const branch = branches.find(b => b.name === currentBranch)
    return branch ? (branch.branch || branch.name) : currentBranch
  }

  return (
    <div className="branch-selector">
      <select 
        value={currentBranch || ''} 
        onChange={handleChange}
        className="branch-dropdown"
      >
        {(!currentBranch || currentBranch === '') && (
          <option value="">Select Branch...</option>
        )}
        {branches && branches.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.branch || branch.name}
          </option>
        ))}
      </select>
      {currentBranch && (
        <p className="branch-note">
          Current: <strong>{getCurrentBranchDisplay()}</strong>
        </p>
      )}
    </div>
  )
}

export default BranchSelector
