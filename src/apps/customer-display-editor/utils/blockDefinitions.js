/**
 * Block type definitions for Customer Display Editor
 */

export const BLOCK_TYPES = {
  LOGO: 'logo',
  ORDER_ITEMS: 'order_items',
  SUBTOTAL: 'subtotal',
  TOTAL: 'total',
  QR_CODE: 'qr_code',
  PROMO_BANNER: 'promo_banner',
  CUSTOM_TEXT: 'custom_text',
  IMAGE: 'image',
  DIVIDER: 'divider',
  SPACER: 'spacer'
}

export const BLOCK_DEFINITIONS = {
  [BLOCK_TYPES.LOGO]: {
    id: BLOCK_TYPES.LOGO,
    label: 'Brand Logo',
    icon: '🏪',
    description: 'Display brand logo',
    defaultProps: {
      size: 'medium',
      alignment: 'center',
      showName: true
    },
    defaultLayout: { w: 12, h: 3, minW: 4, minH: 2 }
  },
  
  [BLOCK_TYPES.ORDER_ITEMS]: {
    id: BLOCK_TYPES.ORDER_ITEMS,
    label: 'Order Items',
    icon: '📋',
    description: 'List of ordered items',
    defaultProps: {
      showImages: true,
      showQuantity: true,
      showPrice: true,
      showModifiers: true,
      fontSize: 'medium'
    },
    defaultLayout: { w: 12, h: 8, minW: 8, minH: 4 }
  },
  
  [BLOCK_TYPES.SUBTOTAL]: {
    id: BLOCK_TYPES.SUBTOTAL,
    label: 'Subtotal',
    icon: '💰',
    description: 'Order subtotal',
    defaultProps: {
      label: 'Subtotal',
      alignment: 'right',
      fontSize: 'medium'
    },
    defaultLayout: { w: 12, h: 2, minW: 6, minH: 1 }
  },
  
  [BLOCK_TYPES.TOTAL]: {
    id: BLOCK_TYPES.TOTAL,
    label: 'Total',
    icon: '💳',
    description: 'Order grand total',
    defaultProps: {
      label: 'Total',
      alignment: 'right',
      fontSize: 'large',
      highlight: true
    },
    defaultLayout: { w: 12, h: 3, minW: 6, minH: 2 }
  },
  
  [BLOCK_TYPES.QR_CODE]: {
    id: BLOCK_TYPES.QR_CODE,
    label: 'QR Code',
    icon: '📱',
    description: 'QR code for payment/feedback',
    defaultProps: {
      content: 'order_url',
      size: 'medium',
      alignment: 'center',
      showLabel: true,
      label: 'Scan to Pay'
    },
    defaultLayout: { w: 6, h: 6, minW: 4, minH: 4 }
  },
  
  [BLOCK_TYPES.PROMO_BANNER]: {
    id: BLOCK_TYPES.PROMO_BANNER,
    label: 'Promo Banner',
    icon: '🎉',
    description: 'Promotional message banner',
    defaultProps: {
      text: 'Thank you for your order!',
      backgroundColor: '#4CAF50',
      textColor: '#ffffff',
      fontSize: 'large',
      alignment: 'center',
      animation: 'none'
    },
    defaultLayout: { w: 12, h: 3, minW: 8, minH: 2 }
  },
  
  [BLOCK_TYPES.CUSTOM_TEXT]: {
    id: BLOCK_TYPES.CUSTOM_TEXT,
    label: 'Custom Text',
    icon: '📝',
    description: 'Custom text block',
    defaultProps: {
      text: 'Enter your text here',
      fontSize: 'medium',
      fontWeight: 'normal',
      alignment: 'left',
      color: '#000000'
    },
    defaultLayout: { w: 12, h: 2, minW: 4, minH: 1 }
  },
  
  [BLOCK_TYPES.IMAGE]: {
    id: BLOCK_TYPES.IMAGE,
    label: 'Image',
    icon: '🖼️',
    description: 'Custom image',
    defaultProps: {
      imageUrl: '',
      fit: 'contain',
      alignment: 'center'
    },
    defaultLayout: { w: 12, h: 6, minW: 4, minH: 3 }
  },
  
  [BLOCK_TYPES.DIVIDER]: {
    id: BLOCK_TYPES.DIVIDER,
    label: 'Divider',
    icon: '➖',
    description: 'Horizontal line divider',
    defaultProps: {
      style: 'solid',
      color: '#e0e0e0',
      thickness: 1
    },
    defaultLayout: { w: 12, h: 1, minW: 4, minH: 1, maxH: 1 }
  },
  
  [BLOCK_TYPES.SPACER]: {
    id: BLOCK_TYPES.SPACER,
    label: 'Spacer',
    icon: '⬜',
    description: 'Empty space',
    defaultProps: {
      height: 'medium'
    },
    defaultLayout: { w: 12, h: 2, minW: 4, minH: 1 }
  }
}

export const createBlock = (type, overrides = {}) => {
  const definition = BLOCK_DEFINITIONS[type]
  if (!definition) {
    throw new Error(`Unknown block type: ${type}`)
  }
  
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    props: { ...definition.defaultProps, ...overrides.props },
    layout: { ...definition.defaultLayout, ...overrides.layout }
  }
}

export const getBlockDefinition = (type) => BLOCK_DEFINITIONS[type]
