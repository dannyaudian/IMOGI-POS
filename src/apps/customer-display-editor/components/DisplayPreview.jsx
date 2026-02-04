import { useDisplayEditorContext } from '../context/DisplayEditorContext'

export function DisplayPreview() {
  const { blocks, deviceType } = useDisplayEditorContext()

  // Import from existing components
  const { PreviewPanel } = require('./index')

  return (
    <PreviewPanel blocks={blocks} deviceType={deviceType} />
  )
}
