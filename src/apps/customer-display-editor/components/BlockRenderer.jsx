import { BLOCK_TYPES } from '../utils/blockDefinitions'

export function BlockRenderer({ block, sampleData }) {
  const { type, props } = block

  switch (type) {
    case BLOCK_TYPES.LOGO:
      return (
        <div className="cde-block-logo" style={{ textAlign: props.alignment }}>
          <div className="cde-logo-icon" style={{ fontSize: props.size === 'large' ? '3rem' : props.size === 'small' ? '1.5rem' : '2rem' }}>
            🏪
          </div>
          {props.showName && <div className="cde-logo-name">Brand Name</div>}
        </div>
      )

    case BLOCK_TYPES.ORDER_ITEMS:
      const items = sampleData?.items || [
        { name: 'Burger Deluxe', qty: 1, price: 15.99 },
        { name: 'French Fries', qty: 2, price: 4.99 },
        { name: 'Coke', qty: 1, price: 2.99 }
      ]
      return (
        <div className="cde-block-items">
          {items.map((item, idx) => (
            <div key={idx} className="cde-item-row">
              {props.showQuantity && <span className="cde-item-qty">{item.qty}x</span>}
              <span className="cde-item-name">{item.name}</span>
              {props.showPrice && <span className="cde-item-price">${item.price.toFixed(2)}</span>}
            </div>
          ))}
        </div>
      )

    case BLOCK_TYPES.SUBTOTAL:
      return (
        <div className="cde-block-subtotal" style={{ textAlign: props.alignment }}>
          <span className="cde-label">{props.label}:</span>
          <span className="cde-amount">$23.97</span>
        </div>
      )

    case BLOCK_TYPES.TOTAL:
      return (
        <div
          className="cde-block-total"
          style={{
            textAlign: props.alignment,
            fontSize: props.fontSize === 'large' ? '1.5rem' : '1.2rem',
            fontWeight: props.highlight ? 'bold' : 'normal',
            background: props.highlight ? '#4CAF50' : 'transparent',
            color: props.highlight ? 'white' : 'inherit',
            padding: props.highlight ? '0.5rem' : '0',
            borderRadius: props.highlight ? '8px' : '0'
          }}
        >
          <span className="cde-label">{props.label}:</span>
          <span className="cde-amount">$25.96</span>
        </div>
      )

    case BLOCK_TYPES.QR_CODE:
      return (
        <div className="cde-block-qr" style={{ textAlign: props.alignment }}>
          <div className="cde-qr-placeholder" style={{ width: '100px', height: '100px', margin: '0 auto' }}>
            <svg viewBox="0 0 100 100" fill="currentColor">
              <rect x="0" y="0" width="40" height="40" />
              <rect x="60" y="0" width="40" height="40" />
              <rect x="0" y="60" width="40" height="40" />
              <rect x="50" y="50" width="20" height="20" />
            </svg>
          </div>
          {props.showLabel && <div className="cde-qr-label">{props.label}</div>}
        </div>
      )

    case BLOCK_TYPES.PROMO_BANNER:
      return (
        <div
          className="cde-block-promo"
          style={{
            backgroundColor: props.backgroundColor,
            color: props.textColor,
            textAlign: props.alignment,
            fontSize: props.fontSize === 'large' ? '1.5rem' : '1rem',
            padding: '1rem',
            borderRadius: '8px'
          }}
        >
          {props.text}
        </div>
      )

    case BLOCK_TYPES.CUSTOM_TEXT:
      return (
        <div
          className="cde-block-text"
          style={{
            fontSize: props.fontSize === 'large' ? '1.5rem' : props.fontSize === 'small' ? '0.875rem' : '1rem',
            fontWeight: props.fontWeight,
            textAlign: props.alignment,
            color: props.color
          }}
        >
          {props.text}
        </div>
      )

    case BLOCK_TYPES.IMAGE:
      return (
        <div className="cde-block-image" style={{ textAlign: props.alignment }}>
          {props.imageUrl ? (
            <img
              src={props.imageUrl}
              alt="Custom"
              style={{ maxWidth: '100%', objectFit: props.fit }}
            />
          ) : (
            <div className="cde-image-placeholder">🖼️ Image</div>
          )}
        </div>
      )

    case BLOCK_TYPES.DIVIDER:
      return (
        <div className="cde-block-divider">
          <hr
            style={{
              borderStyle: props.style,
              borderColor: props.color,
              borderWidth: `${props.thickness}px 0 0 0`,
              margin: 0
            }}
          />
        </div>
      )

    case BLOCK_TYPES.SPACER:
      return <div className="cde-block-spacer" style={{ height: '100%' }}></div>

    default:
      return <div className="cde-block-unknown">Unknown block type: {type}</div>
  }
}
