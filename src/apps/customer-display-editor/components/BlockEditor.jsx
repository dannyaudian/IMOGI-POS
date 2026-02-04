import { useState, useEffect } from 'react'
import { SketchPicker } from 'react-color'
import { BLOCK_TYPES, getBlockDefinition } from '../utils/blockDefinitions'

export function BlockEditor({ block, onUpdate, onClose }) {
  const [props, setProps] = useState(block?.props || {})
  const [showColorPicker, setShowColorPicker] = useState(null)

  useEffect(() => {
    if (block) {
      setProps(block.props || {})
    }
  }, [block])

  if (!block) {
    return (
      <div className="cde-block-editor-empty">
        <div className="cde-empty-icon">👆</div>
        <p>Select a block to edit its properties</p>
      </div>
    )
  }

  const definition = getBlockDefinition(block.type)

  const handleChange = (key, value) => {
    const newProps = { ...props, [key]: value }
    setProps(newProps)
  }

  const handleApply = () => {
    onUpdate(block.id, { props })
    if (window.frappe?.show_alert) {
      window.frappe.show_alert({
        message: 'Block updated!',
        indicator: 'green'
      })
    }
  }

  const renderColorField = (label, key) => (
    <div className="cde-form-field">
      <label>{label}</label>
      <div className="cde-color-input">
        <input
          type="text"
          value={props[key] || '#000000'}
          onChange={(e) => handleChange(key, e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          className="cde-color-swatch"
          style={{ backgroundColor: props[key] || '#000000' }}
          onClick={() => setShowColorPicker(showColorPicker === key ? null : key)}
        />
      </div>
      {showColorPicker === key && (
        <div className="cde-color-picker-popover">
          <div className="cde-color-picker-cover" onClick={() => setShowColorPicker(null)} />
          <SketchPicker
            color={props[key] || '#000000'}
            onChange={(color) => handleChange(key, color.hex)}
          />
        </div>
      )}
    </div>
  )

  const renderPropertiesFor = (type) => {
    switch (type) {
      case BLOCK_TYPES.LOGO:
        return (
          <>
            <div className="cde-form-field">
              <label>Size</label>
              <select value={props.size || 'medium'} onChange={(e) => handleChange('size', e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label>Alignment</label>
              <select value={props.alignment || 'center'} onChange={(e) => handleChange('alignment', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label className="cde-checkbox">
                <input
                  type="checkbox"
                  checked={props.showName || false}
                  onChange={(e) => handleChange('showName', e.target.checked)}
                />
                <span>Show Brand Name</span>
              </label>
            </div>
          </>
        )

      case BLOCK_TYPES.ORDER_ITEMS:
        return (
          <>
            <div className="cde-form-field">
              <label>Font Size</label>
              <select value={props.fontSize || 'medium'} onChange={(e) => handleChange('fontSize', e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label className="cde-checkbox">
                <input type="checkbox" checked={props.showImages || false} onChange={(e) => handleChange('showImages', e.target.checked)} />
                <span>Show Item Images</span>
              </label>
            </div>
            <div className="cde-form-field">
              <label className="cde-checkbox">
                <input type="checkbox" checked={props.showQuantity || true} onChange={(e) => handleChange('showQuantity', e.target.checked)} />
                <span>Show Quantity</span>
              </label>
            </div>
            <div className="cde-form-field">
              <label className="cde-checkbox">
                <input type="checkbox" checked={props.showPrice || true} onChange={(e) => handleChange('showPrice', e.target.checked)} />
                <span>Show Price</span>
              </label>
            </div>
            <div className="cde-form-field">
              <label className="cde-checkbox">
                <input type="checkbox" checked={props.showModifiers || false} onChange={(e) => handleChange('showModifiers', e.target.checked)} />
                <span>Show Modifiers</span>
              </label>
            </div>
          </>
        )

      case BLOCK_TYPES.SUBTOTAL:
      case BLOCK_TYPES.TOTAL:
        return (
          <>
            <div className="cde-form-field">
              <label>Label</label>
              <input type="text" value={props.label || ''} onChange={(e) => handleChange('label', e.target.value)} />
            </div>
            <div className="cde-form-field">
              <label>Alignment</label>
              <select value={props.alignment || 'right'} onChange={(e) => handleChange('alignment', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label>Font Size</label>
              <select value={props.fontSize || 'medium'} onChange={(e) => handleChange('fontSize', e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            {type === BLOCK_TYPES.TOTAL && (
              <div className="cde-form-field">
                <label className="cde-checkbox">
                  <input type="checkbox" checked={props.highlight || false} onChange={(e) => handleChange('highlight', e.target.checked)} />
                  <span>Highlight</span>
                </label>
              </div>
            )}
          </>
        )

      case BLOCK_TYPES.QR_CODE:
        return (
          <>
            <div className="cde-form-field">
              <label>Content</label>
              <select value={props.content || 'order_url'} onChange={(e) => handleChange('content', e.target.value)}>
                <option value="order_url">Order URL</option>
                <option value="payment_url">Payment URL</option>
                <option value="feedback_url">Feedback URL</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {props.content === 'custom' && (
              <div className="cde-form-field">
                <label>Custom URL</label>
                <input type="text" value={props.customUrl || ''} onChange={(e) => handleChange('customUrl', e.target.value)} />
              </div>
            )}
            <div className="cde-form-field">
              <label>Size</label>
              <select value={props.size || 'medium'} onChange={(e) => handleChange('size', e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label className="cde-checkbox">
                <input type="checkbox" checked={props.showLabel || false} onChange={(e) => handleChange('showLabel', e.target.checked)} />
                <span>Show Label</span>
              </label>
            </div>
            {props.showLabel && (
              <div className="cde-form-field">
                <label>Label Text</label>
                <input type="text" value={props.label || ''} onChange={(e) => handleChange('label', e.target.value)} />
              </div>
            )}
          </>
        )

      case BLOCK_TYPES.PROMO_BANNER:
        return (
          <>
            <div className="cde-form-field">
              <label>Text</label>
              <textarea value={props.text || ''} onChange={(e) => handleChange('text', e.target.value)} rows={3} />
            </div>
            {renderColorField('Background Color', 'backgroundColor')}
            {renderColorField('Text Color', 'textColor')}
            <div className="cde-form-field">
              <label>Font Size</label>
              <select value={props.fontSize || 'medium'} onChange={(e) => handleChange('fontSize', e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label>Alignment</label>
              <select value={props.alignment || 'center'} onChange={(e) => handleChange('alignment', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </>
        )

      case BLOCK_TYPES.CUSTOM_TEXT:
        return (
          <>
            <div className="cde-form-field">
              <label>Text</label>
              <textarea value={props.text || ''} onChange={(e) => handleChange('text', e.target.value)} rows={3} />
            </div>
            <div className="cde-form-field">
              <label>Font Size</label>
              <select value={props.fontSize || 'medium'} onChange={(e) => handleChange('fontSize', e.target.value)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label>Font Weight</label>
              <select value={props.fontWeight || 'normal'} onChange={(e) => handleChange('fontWeight', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label>Alignment</label>
              <select value={props.alignment || 'left'} onChange={(e) => handleChange('alignment', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            {renderColorField('Text Color', 'color')}
          </>
        )

      case BLOCK_TYPES.IMAGE:
        return (
          <>
            <div className="cde-form-field">
              <label>Image URL</label>
              <input type="text" value={props.imageUrl || ''} onChange={(e) => handleChange('imageUrl', e.target.value)} placeholder="https://..." />
            </div>
            <div className="cde-form-field">
              <label>Fit</label>
              <select value={props.fit || 'contain'} onChange={(e) => handleChange('fit', e.target.value)}>
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
              </select>
            </div>
            <div className="cde-form-field">
              <label>Alignment</label>
              <select value={props.alignment || 'center'} onChange={(e) => handleChange('alignment', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </>
        )

      case BLOCK_TYPES.DIVIDER:
        return (
          <>
            <div className="cde-form-field">
              <label>Style</label>
              <select value={props.style || 'solid'} onChange={(e) => handleChange('style', e.target.value)}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            {renderColorField('Color', 'color')}
            <div className="cde-form-field">
              <label>Thickness (px)</label>
              <input type="number" min="1" max="10" value={props.thickness || 1} onChange={(e) => handleChange('thickness', parseInt(e.target.value))} />
            </div>
          </>
        )

      case BLOCK_TYPES.SPACER:
        return (
          <div className="cde-form-field">
            <label>Height</label>
            <select value={props.height || 'medium'} onChange={(e) => handleChange('height', e.target.value)}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        )

      default:
        return <p>No properties available for this block type.</p>
    }
  }

  return (
    <div className="cde-block-editor">
      <div className="cde-editor-header">
        <div>
          <h3>{definition?.icon} {definition?.label}</h3>
          <p className="cde-editor-subtitle">{definition?.description}</p>
        </div>
        <button className="cde-close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="cde-editor-body">
        {renderPropertiesFor(block.type)}
      </div>

      <div className="cde-editor-footer">
        <button className="cde-btn-primary" onClick={handleApply}>Apply Changes</button>
      </div>
    </div>
  )
}
