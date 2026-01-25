import React from 'react'

function BranchSelector({ currentBranch, branches, onBranchChange }) {
  const handleChange = (e) => {
    const branch = e.target.value
    onBranchChange(branch)
    // Store in localStorage and frappe session
    localStorage.setItem('imogi_selected_branch', branch)
    frappe.call({
      method: 'imogi_pos.api.public.set_user_branch',
      args: { branch },
      callback: () => {
        window.location.reload()
      }
    })
  }

  return (
    <div className="branch-selector">
      <select 
        value={currentBranch || ''} 
        onChange={handleChange}
        className="branch-dropdown"
      >
        <option value="">Select Branch...</option>
        {branches && branches.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.name}
          </option>
        ))}
      </select>
      <p className="branch-note">Current: <strong>{currentBranch}</strong></p>
    </div>
  )
}

export default BranchSelector
