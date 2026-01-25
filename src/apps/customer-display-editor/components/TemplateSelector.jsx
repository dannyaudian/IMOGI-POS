import React, { useState } from 'react'

/**
 * TemplateSelector Component
 * Select from predefined display templates
 */
export function TemplateSelector({ templates, onTemplateSelect, onCancel }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    profile_name: '',
    branch: ''
  })
  
  // Ensure templates is an array
  const templateList = Array.isArray(templates) ? templates : []
  
  const handleTemplateClick = (template) => {
    setSelectedTemplate(template)
    setShowForm(true)
  }
  
  const handleStartFromScratch = () => {
    setSelectedTemplate(null)
    setShowForm(true)
  }
  
  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.profile_name && formData.branch) {
      onTemplateSelect({
        template: selectedTemplate,
        profile_name: formData.profile_name,
        branch: formData.branch
      })
    }
  }
  
  const handleCancel = () => {
    if (showForm) {
      setShowForm(false)
      setSelectedTemplate(null)
      setFormData({ profile_name: '', branch: '' })
    } else {
      onCancel()
    }
  }
  
  if (templateList.length === 0) {
    return (
      <div className="cde-template-selector">
        <p>Loading templates...</p>
      </div>
    )
  }
  
  if (showForm) {
    return (
      <div className="cde-template-selector">
        <div className="cde-form-container">
          <h3>Create New Display Profile</h3>
          {selectedTemplate && (
            <div className="cde-selected-template">
              <p><strong>Template:</strong> {selectedTemplate.name}</p>
              <p className="cde-template-desc">{selectedTemplate.description}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="cde-profile-form">
            <div className="cde-form-field">
              <label htmlFor="profile_name">Profile Name *</label>
              <input
                type="text"
                id="profile_name"
                value={formData.profile_name}
                onChange={(e) => setFormData({ ...formData, profile_name: e.target.value })}
                placeholder="e.g., Display 1, Main Counter, etc."
                required
                autoFocus
              />
            </div>
            
            <div className="cde-form-field">
              <label htmlFor="branch">Branch *</label>
              <input
                type="text"
                id="branch"
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                placeholder="e.g., Main Branch, Outlet 1, etc."
                required
              />
              <small>Branch name where this display will be used</small>
            </div>
            
            <div className="cde-form-actions">
              <button type="button" className="cde-btn-secondary" onClick={handleCancel}>
                Back
              </button>
              <button type="submit" className="cde-btn-primary">
                Create Profile
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="cde-template-selector">
      <h3>Choose a Template</h3>
      <p className="cde-template-description">
        Start with a pre-designed template and customize it to your needs
      </p>

      <div className="cde-template-grid">
        {templateList.map(template => (
          <button
            key={template.id}
            className="cde-template-card"
            onClick={() => handleTemplateClick(template)}
          >
            <div className="cde-template-preview">
              {template.preview_image ? (
                <img src={template.preview_image} alt={template.name} />
              ) : (
                <div className="cde-template-preview-placeholder">
                  <span>📱</span>
                </div>
              )}
            </div>
            <div className="cde-template-info">
              <h4>{template.name}</h4>
              <p>{template.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="cde-template-footer">
        <button className="cde-btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
        <button className="cde-btn-primary" onClick={handleStartFromScratch}>
          Start from Scratch
        </button>
      </div>
    </div>
  )
}
