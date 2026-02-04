import { useDisplayEditorContext } from '../context/DisplayEditorContext'

export function DisplayEditorHeader() {
  const {
    selectedDevice,
    profiles,
    hasChanges,
    saving,
    showTemplateSelector,
    setShowTemplateSelector,
    onDuplicate,
    onTest,
    onReset,
    onSave
  } = useDisplayEditorContext()

  return (
    <header className="cde-header">
      <div className="cde-header-left">
        <h1>Customer Display Editor</h1>
        <span className="cde-header-device">
          {profiles?.find(p => p.name === selectedDevice)?.profile_name || selectedDevice}
        </span>
      </div>
      <div className="cde-header-right">
        <button
          className="cde-btn-secondary"
          onClick={() => setShowTemplateSelector(true)}
        >
          Templates
        </button>
        <button className="cde-btn-secondary" onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="cde-btn-secondary" onClick={onTest}>
          Test
        </button>
        <button className="cde-btn-secondary" onClick={onReset}>
          Reset
        </button>
        <button
          className="cde-btn-primary"
          onClick={onSave}
          disabled={!hasChanges || saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </header>
  )
}
