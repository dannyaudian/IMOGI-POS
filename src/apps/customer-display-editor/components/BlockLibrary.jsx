import { BLOCK_DEFINITIONS, createBlock } from '../utils/blockDefinitions'

export function BlockLibrary({ onAddBlock }) {
  const blockCategories = {
    'Essential': ['logo', 'order_items', 'total'],
    'Financial': ['subtotal', 'total'],
    'Interactive': ['qr_code', 'promo_banner'],
    'Content': ['custom_text', 'image'],
    'Layout': ['divider', 'spacer']
  }

  const handleAddBlock = (blockType) => {
    const newBlock = createBlock(blockType)
    onAddBlock(newBlock)
    
    // Visual feedback
    if (window.frappe?.show_alert) {
      window.frappe.show_alert({
        message: `Added ${BLOCK_DEFINITIONS[blockType].label}`,
        indicator: 'green'
      })
    }
  }

  return (
    <div className="cde-block-library">
      <div className="cde-library-header">
        <h3>📦 Block Library</h3>
        <p className="cde-library-subtitle">Drag or click to add blocks</p>
      </div>

      <div className="cde-library-content">
        {Object.entries(blockCategories).map(([category, blockTypes]) => (
          <div key={category} className="cde-library-category">
            <h4 className="cde-category-title">{category}</h4>
            <div className="cde-library-blocks">
              {blockTypes.map(blockType => {
                const definition = BLOCK_DEFINITIONS[blockType]
                if (!definition) return null

                return (
                  <button
                    key={blockType}
                    className="cde-library-block"
                    onClick={() => handleAddBlock(blockType)}
                    title={definition.description}
                  >
                    <div className="cde-block-icon">{definition.icon}</div>
                    <div className="cde-block-label">{definition.label}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="cde-library-footer">
        <div className="cde-library-tip">
          <strong>💡 Quick Tip:</strong> Start with Logo → Order Items → Total for a basic layout
        </div>
      </div>
    </div>
  )
}
