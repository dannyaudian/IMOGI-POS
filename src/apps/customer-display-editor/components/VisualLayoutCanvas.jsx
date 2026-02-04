import { useState, useCallback } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { BlockRenderer } from './BlockRenderer'

export function VisualLayoutCanvas({ blocks, onBlocksChange, onBlockSelect, selectedBlockId, sampleData }) {
  const handleLayoutChange = useCallback((newLayout) => {
    const updatedBlocks = blocks.map(block => {
      const layoutItem = newLayout.find(item => item.i === block.id)
      if (layoutItem) {
        return {
          ...block,
          layout: {
            x: layoutItem.x,
            y: layoutItem.y,
            w: layoutItem.w,
            h: layoutItem.h
          }
        }
      }
      return block
    })
    onBlocksChange(updatedBlocks)
  }, [blocks, onBlocksChange])

  const handleBlockClick = (blockId) => {
    onBlockSelect(blockId)
  }

  const handleRemoveBlock = (blockId) => {
    const updatedBlocks = blocks.filter(b => b.id !== blockId)
    onBlocksChange(updatedBlocks)
    if (selectedBlockId === blockId) {
      onBlockSelect(null)
    }
  }

  // Convert blocks to react-grid-layout format
  const layout = blocks.map(block => ({
    i: block.id,
    x: block.layout?.x || 0,
    y: block.layout?.y || 0,
    w: block.layout?.w || 6,
    h: block.layout?.h || 4,
    minW: block.layout?.minW || 2,
    minH: block.layout?.minH || 2,
    maxH: block.layout?.maxH
  }))

  return (
    <div className="cde-visual-canvas">
      <div className="cde-canvas-header">
        <h3>📱 Display Layout</h3>
        <div className="cde-canvas-info">
          {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
        </div>
      </div>

      <div className="cde-canvas-wrapper">
        <div className="cde-canvas-grid-container">
          {blocks.length === 0 ? (
            <div className="cde-canvas-empty">
              <div className="cde-empty-icon">📦</div>
              <h4>No blocks yet</h4>
              <p>Drag blocks from the library to get started</p>
            </div>
          ) : (
            <GridLayout
              className="cde-layout-grid"
              layout={layout}
              cols={12}
              rowHeight={30}
              width={800}
              onLayoutChange={handleLayoutChange}
              isDraggable={true}
              isResizable={true}
              compactType="vertical"
              preventCollision={false}
              margin={[10, 10]}
              containerPadding={[20, 20]}
            >
              {blocks.map(block => (
                <div
                  key={block.id}
                  className={`cde-grid-item ${selectedBlockId === block.id ? 'selected' : ''}`}
                  onClick={() => handleBlockClick(block.id)}
                >
                  <div className="cde-block-container">
                    <div className="cde-block-header">
                      <span className="cde-block-type">{block.type}</span>
                      <button
                        className="cde-block-remove"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveBlock(block.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="cde-block-content">
                      <BlockRenderer
                        block={block}
                        sampleData={sampleData}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>

      <div className="cde-canvas-footer">
        <div className="cde-canvas-tip">
          💡 <strong>Tip:</strong> Drag to move, resize from corners, click to edit properties
        </div>
      </div>
    </div>
  )
}
