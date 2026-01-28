import React from 'react'

function BranchSelector({ currentBranch, branches, onBranchChange }) {
  const handleChange = (e) => {
    const branch = e.target.value
    onBranchChange(branch)
    // Store in localStorage
    localStorage.setItem('imogi_selected_branch', branch)
    
    // Update user preference in backend
    frappe.call({
      method: 'imogi_pos.api.public.set_user_branch',
      args: { branch },
      callback: (r) => {
        if (r.message && r.message.success) {
          // Trigger parent component to refetch data (no reload)
          // Parent component should handle this via callback
          console.log('Branch updated successfully:', branch)
        }
      },
      error: (err) => {
        console.error('Failed to update branch:', err)
        frappe.msgprint({
          title: 'Error',
          message: 'Failed to update branch. Please try again.',
          indicator: 'red'
        })
      }
    })
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
