import React from 'react'

/**
 * ConfigPanel Component
 * Configuration forms for layout, theme, and advanced settings
 */
export function ConfigPanel({ activeTab, config, onChange }) {
  return (
    <div className="cde-config-panel">
      {activeTab === 'layout' && <LayoutTab config={config} onChange={onChange} />}
      {activeTab === 'theme' && <ThemeTab config={config} onChange={onChange} />}
      {activeTab === 'advanced' && <AdvancedTab config={config} onChange={onChange} />}
    </div>
  )
}

function LayoutTab({ config, onChange }) {
  return (
    <div className="cde-config-section">
      <h3>Layout Settings</h3>

      <div className="cde-form-row">
        <div className="cde-form-field">
          <label>Layout Type</label>
          <select
            value={config.layout_type || config.layoutType || 'List'}
            onChange={(e) => {
              onChange('layout_type', e.target.value)
              onChange('layoutType', e.target.value)
            }}
          >
            <option value="List">List View</option>
            <option value="Grid">Grid View</option>
            <option value="Compact">Compact View</option>
          </select>
        </div>

        {(config.layout_type === 'Grid' || config.layoutType === 'Grid') && (
          <>
            <div className="cde-form-field">
              <label>Grid Columns</label>
              <input
                type="number"
                min="1"
                max="6"
                value={config.grid_columns || 3}
                onChange={(e) => onChange('grid_columns', parseInt(e.target.value))}
              />
            </div>

            <div className="cde-form-field">
              <label>Grid Rows</label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.grid_rows || 2}
                onChange={(e) => onChange('grid_rows', parseInt(e.target.value))}
              />
            </div>
          </>
        )}
      </div>

      <div className="cde-form-group">
        <h4>Display Options</h4>

        <div className="cde-checkbox-group">
          <label className="cde-checkbox">
            <input
              type="checkbox"
              checked={config.showLogo || false}
              onChange={(e) => onChange('showLogo', e.target.checked)}
            />
            <span>Show Brand Logo</span>
          </label>

          <label className="cde-checkbox">
            <input
              type="checkbox"
              checked={config.showImages || false}
              onChange={(e) => onChange('showImages', e.target.checked)}
            />
            <span>Show Item Images</span>
          </label>

          <label className="cde-checkbox">
            <input
              type="checkbox"
              checked={config.showDescription || false}
              onChange={(e) => onChange('showDescription', e.target.checked)}
            />
            <span>Show Item Description</span>
          </label>

          <label className="cde-checkbox">
            <input
              type="checkbox"
              checked={config.showSubtotal || false}
              onChange={(e) => onChange('showSubtotal', e.target.checked)}
            />
            <span>Show Subtotal</span>
          </label>

          <label className="cde-checkbox">
            <input
              type="checkbox"
              checked={config.showTaxes || false}
              onChange={(e) => onChange('showTaxes', e.target.checked)}
            />
            <span>Show Taxes</span>
          </label>
        </div>
      </div>

      <div className="cde-form-group">
        <h4>Animation</h4>

        <label className="cde-checkbox">
          <input
            type="checkbox"
            checked={config.autoScroll || false}
            onChange={(e) => onChange('autoScroll', e.target.checked)}
          />
          <span>Auto-scroll Items</span>
        </label>

        {config.autoScroll && (
          <div className="cde-form-field">
            <label>Scroll Speed (seconds)</label>
            <input
              type="number"
              min="1"
              max="10"
              step="0.5"
              value={config.scrollSpeed || 3}
              onChange={(e) => onChange('scrollSpeed', parseFloat(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="cde-form-field">
        <label>Font Size</label>
        <div className="cde-button-group">
          <button
            className={`cde-size-btn ${config.fontSize === '0.875rem' ? 'active' : ''}`}
            onClick={() => onChange('fontSize', '0.875rem')}
          >
            Small
          </button>
          <button
            className={`cde-size-btn ${config.fontSize === '1rem' || !config.fontSize ? 'active' : ''}`}
            onClick={() => onChange('fontSize', '1rem')}
          >
            Medium
          </button>
          <button
            className={`cde-size-btn ${config.fontSize === '1.25rem' ? 'active' : ''}`}
            onClick={() => onChange('fontSize', '1.25rem')}
          >
            Large
          </button>
          <button
            className={`cde-size-btn ${config.fontSize === '1.5rem' ? 'active' : ''}`}
            onClick={() => onChange('fontSize', '1.5rem')}
          >
            XL
          </button>
        </div>
      </div>
    </div>
  )
}

function ThemeTab({ config, onChange }) {
  const presets = [
    { id: 'dark', name: 'Dark', bg: '#1f2937', text: '#ffffff', accent: '#3b82f6', price: '#10b981' },
    { id: 'light', name: 'Light', bg: '#ffffff', text: '#1f2937', accent: '#3b82f6', price: '#059669' },
    { id: 'colorful', name: 'Colorful', bg: '#ec4899', text: '#ffffff', accent: '#fbbf24', price: '#ffffff' },
    { id: 'elegant', name: 'Elegant', bg: '#0f172a', text: '#f1f5f9', accent: '#f59e0b', price: '#fbbf24' }
  ]

  const applyPreset = (preset) => {
    onChange('backgroundColor', preset.bg)
    onChange('textColor', preset.text)
    onChange('accentColor', preset.accent)
    onChange('priceColor', preset.price)
    onChange('themePreset', preset.id)
  }

  // Ensure presets is always an array
  const presetList = Array.isArray(presets) ? presets : []

  return (
    <div className="cde-config-section">
      <h3>Theme Settings</h3>

      <div className="cde-form-group">
        <h4>Quick Presets</h4>
        <div className="cde-preset-grid">
          {presetList.map(preset => (
            <button
              key={preset.id}
              className={`cde-preset-btn ${config.themePreset === preset.id ? 'active' : ''}`}
              onClick={() => applyPreset(preset)}
              style={{
                background: preset.bg,
                color: preset.text,
                borderColor: preset.accent
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="cde-form-group">
        <h4>Custom Colors</h4>

        <div className="cde-color-picker">
          <label>Background Color</label>
          <div className="cde-color-input">
            <input
              type="color"
              value={config.backgroundColor || '#1f2937'}
              onChange={(e) => onChange('backgroundColor', e.target.value)}
            />
            <input
              type="text"
              value={config.backgroundColor || '#1f2937'}
              onChange={(e) => onChange('backgroundColor', e.target.value)}
              placeholder="#1f2937"
            />
          </div>
        </div>

        <div className="cde-color-picker">
          <label>Text Color</label>
          <div className="cde-color-input">
            <input
              type="color"
              value={config.textColor || '#ffffff'}
              onChange={(e) => onChange('textColor', e.target.value)}
            />
            <input
              type="text"
              value={config.textColor || '#ffffff'}
              onChange={(e) => onChange('textColor', e.target.value)}
              placeholder="#ffffff"
            />
          </div>
        </div>

        <div className="cde-color-picker">
          <label>Accent Color</label>
          <div className="cde-color-input">
            <input
              type="color"
              value={config.accentColor || '#3b82f6'}
              onChange={(e) => onChange('accentColor', e.target.value)}
            />
            <input
              type="text"
              value={config.accentColor || '#3b82f6'}
              onChange={(e) => onChange('accentColor', e.target.value)}
              placeholder="#3b82f6"
            />
          </div>
        </div>

        <div className="cde-color-picker">
          <label>Price Color</label>
          <div className="cde-color-input">
            <input
              type="color"
              value={config.priceColor || '#10b981'}
              onChange={(e) => onChange('priceColor', e.target.value)}
            />
            <input
              type="text"
              value={config.priceColor || '#10b981'}
              onChange={(e) => onChange('priceColor', e.target.value)}
              placeholder="#10b981"
            />
          </div>
        </div>
      </div>

      <div className="cde-form-group">
        <h4>Branding</h4>

        <div className="cde-form-field">
          <label>Brand Name</label>
          <input
            type="text"
            placeholder="Enter brand name"
            value={config.brand_name || ''}
            onChange={(e) => onChange('brand_name', e.target.value)}
          />
        </div>

        <div className="cde-form-field">
          <label>Brand Logo URL</label>
          <input
            type="text"
            placeholder="https://example.com/logo.png"
            value={config.brand_logo || ''}
            onChange={(e) => onChange('brand_logo', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

function AdvancedTab({ config, onChange }) {
  return (
    <div className="cde-config-section">
      <h3>Advanced Settings</h3>

      <div className="cde-form-group">
        <h4>Display Behavior</h4>

        <div className="cde-form-field">
          <label>Display Timeout (seconds)</label>
          <input
            type="number"
            min="5"
            max="300"
            step="5"
            value={config.displayTimeout || 30}
            onChange={(e) => onChange('displayTimeout', parseInt(e.target.value))}
          />
          <small>How long to keep order visible after completion</small>
        </div>

        <div className="cde-form-field">
          <label>Refresh Interval (seconds)</label>
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            value={config.refreshInterval || 5}
            onChange={(e) => onChange('refreshInterval', parseInt(e.target.value))}
          />
          <small>How often to check for new orders</small>
        </div>
      </div>

      <div className="cde-form-group">
        <h4>Developer Options</h4>

        <label className="cde-checkbox">
          <input
            type="checkbox"
            checked={config.debugMode || false}
            onChange={(e) => onChange('debugMode', e.target.checked)}
          />
          <span>Enable Debug Mode</span>
        </label>

        <div className="cde-form-field">
          <label>Custom CSS</label>
          <textarea
            rows="5"
            placeholder="/* Enter custom CSS here */"
            value={config.customCSS || ''}
            onChange={(e) => onChange('customCSS', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
