import { useDisplayEditorContext } from '../context/DisplayEditorContext'

export function DisplayBlockPanel() {
  const {
    onAddBlock,
    selectedBlock,
    onBlockUpdate,
    setSelectedBlock
  } = useDisplayEditorContext()

  // Import from existing components
  const { BlockLibrary, BlockEditor } = require('./index')

  return (
    <div className="cde-sidebar-right">
      <BlockLibrary onAddBlock={onAddBlock} />

      <div className="cde-block-editor-panel">
        <BlockEditor
          block={selectedBlock}
          onUpdate={onBlockUpdate}
          onClose={() => setSelectedBlock(null)}
        />
      </div>
    </div>
  )
}
