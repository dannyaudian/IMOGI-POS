import { useDisplayEditorContext } from '../context/DisplayEditorContext'
import { PreviewPanel } from './PreviewPanel'

export function DisplayPreview() {
  const { blocks, deviceType } = useDisplayEditorContext()

  return (
    <PreviewPanel blocks={blocks} deviceType={deviceType} />
  )
}
