/**
 * Convert between React Flow format and backend API format
 */

/**
 * Convert backend table data to React Flow nodes
 */
export function convertToReactFlowNodes(tables) {
  if (!tables || !Array.isArray(tables)) {
    return []
  }

  return tables.map((table, index) => ({
    id: table.name || `table-${index}`,
    type: 'table',
    position: {
      x: table.position_x || (index % 5) * 150 + 50,
      y: table.position_y || Math.floor(index / 5) * 150 + 50
    },
    data: {
      table: table.name,
      label: table.table_number || table.name,
      capacity: table.no_of_seats || table.seating_capacity || 4,
      width: table.width || 100,
      height: table.height || 100,
      shape: table.shape || 'rectangle',
      status: table.status || 'Available',
      backgroundColor: table.backgroundColor || '#ffffff',
      rotation: table.rotation || 0,
      currentOrder: table.current_order || null
    }
  }))
}

/**
 * Convert React Flow nodes to backend format
 */
export function convertToBackendFormat(nodes, floor) {
  if (!nodes || !Array.isArray(nodes)) {
    return { floor, nodes: [] }
  }

  const tableNodes = nodes.filter(node => node.type === 'table')

  return {
    floor,
    nodes: tableNodes.map(node => ({
      id: node.id,
      table: node.data.table || null,
      label: node.data.label,
      position_x: Math.round(node.position.x),
      position_y: Math.round(node.position.y),
      width: node.data.width || 100,
      height: node.data.height || 100,
      shape: node.data.shape || 'rectangle',
      rotation: node.data.rotation || 0,
      // Additional metadata
      capacity: node.data.capacity,
      backgroundColor: node.data.backgroundColor,
      status: node.data.status
    }))
  }
}

/**
 * Validate layout data
 */
export function validateLayoutData(layoutData) {
  const errors = []

  if (!layoutData.floor) {
    errors.push('Floor is required')
  }

  if (!layoutData.nodes || !Array.isArray(layoutData.nodes)) {
    errors.push('Nodes must be an array')
  }

  layoutData.nodes?.forEach((node, index) => {
    if (typeof node.position_x !== 'number') {
      errors.push(`Node ${index}: position_x must be a number`)
    }
    if (typeof node.position_y !== 'number') {
      errors.push(`Node ${index}: position_y must be a number`)
    }
    if (!node.label) {
      errors.push(`Node ${index}: label is required`)
    }
  })

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Export layout to JSON file
 */
export function exportLayoutToJSON(nodes, floor, metadata = {}) {
  const layoutData = convertToBackendFormat(nodes, floor)
  
  const exportData = {
    ...layoutData,
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      ...metadata
    }
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
    type: 'application/json' 
  })
  
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `table-layout-${floor}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Import layout from JSON file
 */
export function importLayoutFromJSON(file, callback) {
  const reader = new FileReader()
  
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      const nodes = convertToReactFlowNodes(data.nodes || data.tables || [])
      callback(null, nodes, data)
    } catch (error) {
      callback(error, null, null)
    }
  }
  
  reader.onerror = () => {
    callback(new Error('Failed to read file'), null, null)
  }
  
  reader.readAsText(file)
}
