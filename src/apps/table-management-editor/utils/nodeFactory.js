/**
 * Factory for creating new table nodes
 */

let nodeIdCounter = 1

export function createTableNode(shape = 'rectangle', options = {}) {
  const id = `table-${Date.now()}-${nodeIdCounter++}`
  
  const defaults = {
    label: `Table ${nodeIdCounter}`,
    capacity: 4,
    width: 100,
    height: 100,
    backgroundColor: '#ffffff',
    status: 'Available',
    rotation: 0
  }

  // Shape-specific defaults
  const shapeDefaults = {
    round: { width: 100, height: 100 },
    rectangle: { width: 120, height: 80 },
    booth: { width: 150, height: 100 },
    square: { width: 100, height: 100 }
  }

  return {
    id,
    type: 'table',
    position: options.position || { x: 100, y: 100 },
    data: {
      ...defaults,
      ...shapeDefaults[shape],
      ...options,
      shape,
      table: null // Will be assigned when saved to backend
    }
  }
}

export function createDecorativeNode(type = 'text', options = {}) {
  const id = `deco-${Date.now()}-${nodeIdCounter++}`
  
  return {
    id,
    type: 'decorative',
    position: options.position || { x: 100, y: 100 },
    data: {
      decorativeType: type,
      label: options.label || 'Label',
      ...options
    }
  }
}

export function duplicateNode(node) {
  const id = `table-${Date.now()}-${nodeIdCounter++}`
  
  return {
    ...node,
    id,
    position: {
      x: node.position.x + 50,
      y: node.position.y + 50
    },
    data: {
      ...node.data,
      label: `${node.data.label} (Copy)`,
      table: null // Don't copy table reference
    }
  }
}
