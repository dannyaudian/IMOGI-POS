import { useDisplayEditorContext } from '../context/DisplayEditorContext'
import { LoadingSpinner, ErrorMessage } from '@/shared/components/UI'
import { DisplayEditorHeader } from './DisplayEditorHeader'
import { DisplayCanvasArea } from './DisplayCanvasArea'
import { DisplayBlockPanel } from './DisplayBlockPanel'
import { DisplayPreview } from './DisplayPreview'

export function DisplayEditorContent() {
  const {
    selectedDevice,
    setSelectedDevice,
    profiles,
    loadingProfiles,
    profilesError,
    onCreateNew,
    showTemplateSelector,
    setShowTemplateSelector,
    templates
  } = useDisplayEditorContext()

  // Import TemplateSelector from existing components
  const { TemplateSelector } = require('./index')

  // RENDER: Template selector modal
  if (showTemplateSelector) {
    return (
      <div className="cde-container">
        <TemplateSelector
          templates={templates?.templates || []}
          onTemplateSelect={(data) => {
            // Handle in App level
          }}
          onCancel={() => setShowTemplateSelector(false)}
        />
      </div>
    )
  }

  // RENDER: Error state
  if (profilesError) {
    return (
      <div className="cde-error" style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>Failed to Load Profiles</h3>
        <p style={{ color: '#d32f2f' }}>
          {profilesError.message || 'Unable to fetch Customer Display Profiles'}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  // RENDER: Loading state
  if (loadingProfiles) {
    return (
      <div className="cde-loading">
        <div className="cde-spinner"></div>
        <p>Loading profiles...</p>
      </div>
    )
  }

  // RENDER: Empty state
  if (!loadingProfiles && profiles.length === 0) {
    return (
      <div className="cde-empty" style={{ padding: '2rem', textAlign: 'center' }}>
        <h3>No Display Profiles</h3>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          Create your first Customer Display Profile to get started.
        </p>
        <button
          onClick={onCreateNew}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          Create New Profile
        </button>
      </div>
    )
  }

  // RENDER: No device selected
  if (!selectedDevice) {
    return (
      <main className="cde-main">
        <div className="cde-empty-content">
          <div className="cde-empty-illustration">
            <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="80" fill="#EEF2FF" />
              <rect x="60" y="40" width="80" height="120" rx="8" fill="white" stroke="#6366f1" strokeWidth="3" />
              <rect x="70" y="55" width="60" height="40" rx="4" fill="#6366f1" fillOpacity="0.1" />
              <rect x="70" y="100" width="60" height="6" rx="3" fill="#6366f1" fillOpacity="0.3" />
              <rect x="70" y="112" width="40" height="6" rx="3" fill="#6366f1" fillOpacity="0.2" />
              <circle cx="100" cy="145" r="3" fill="#6366f1" />
            </svg>
          </div>
          <h2>Welcome to Customer Display Editor</h2>
          <p className="cde-empty-subtitle">Configure and manage your customer-facing displays</p>
          <p className="cde-empty-description">
            Select a profile from the sidebar or create a new one to start customizing your display settings
          </p>
          <button className="cde-btn-primary cde-btn-large" onClick={onCreateNew}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create New Profile
          </button>
        </div>
      </main>
    )
  }

  // RENDER: Full editor view
  return (
    <main className="cde-main">
      <DisplayEditorHeader />

      <div className="cde-content">
        <DisplayBlockPanel />
        <DisplayCanvasArea />
        <DisplayPreview />
      </div>
    </main>
  )
}
