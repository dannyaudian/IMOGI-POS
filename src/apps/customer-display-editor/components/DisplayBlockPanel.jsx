import { useDisplayEditorContext } from '../context/DisplayEditorContext'
import { BlockLibrary } from './BlockLibrary'
import { BlockEditor } from './BlockEditor'

export function DisplayBlockPanel() {
  const {
    onAddBlock,
    selectedBlock,
    onBlockUpdate,
    setSelectedBlock
  } = useDisplayEditorContext()

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
