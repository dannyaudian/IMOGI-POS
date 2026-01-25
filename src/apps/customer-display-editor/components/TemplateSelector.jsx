import React from 'react'

/**
 * TemplateSelector Component
 * Select from predefined display templates
 */
export function TemplateSelector({ templates, onTemplateSelect }) {
  if (!templates || templates.length === 0) {
    return (
      <div className="cde-template-selector">
        <p>Loading templates...</p>
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
        {templates.map(template => (
          <button
            key={template.id}
            className="cde-template-card"
            onClick={() => onTemplateSelect(template)}
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
        <button className="cde-btn-secondary" onClick={() => onTemplateSelect(null)}>
          Start from Scratch
        </button>
      </div>
    </div>
  )
}
