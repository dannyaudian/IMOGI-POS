import { useDisplayEditorContext } from '../context/DisplayEditorContext'

export function DisplayCanvasArea() {
  const {
    blocks,
    selectedBlock,
    deviceType,
    setDeviceType,
    onLayoutChange,
    onBlockSelect,
    onBlockRemove
  } = useDisplayEditorContext()

  // Import required components from existing structure
  const { VisualLayoutCanvas } = require('./index')

  return (
    <div className="cde-canvas-area">
      <div className="cde-canvas-header">
        <h3>Visual Layout Editor</h3>
        <div className="cde-device-selector">
          <button
            className={`cde-device-btn ${deviceType === 'phone' ? 'active' : ''}`}
            onClick={() => setDeviceType('phone')}
            title="Phone"
          >
            📱
          </button>
          <button
            className={`cde-device-btn ${deviceType === 'tablet' ? 'active' : ''}`}
            onClick={() => setDeviceType('tablet')}
            title="Tablet"
          >
            📱
          </button>
          <button
            className={`cde-device-btn ${deviceType === 'monitor' ? 'active' : ''}`}
            onClick={() => setDeviceType('monitor')}
            title="Monitor"
          >
            🖥️
          </button>
        </div>
      </div>

      <VisualLayoutCanvas
        blocks={blocks}
        onLayoutChange={onLayoutChange}
        onBlockClick={onBlockSelect}
        onRemoveBlock={onBlockRemove}
        selectedBlockId={selectedBlock?.id}
      />
    </div>
  )
}
