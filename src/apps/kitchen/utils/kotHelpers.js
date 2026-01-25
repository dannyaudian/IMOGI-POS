/**
 * Normalize workflow state to internal state key
 * @param {string} workflowState - Workflow state from backend
 * @returns {string|null} Internal state key or null if not displayed
 */
export function normalizeWorkflowState(workflowState) {
  if (!workflowState) return 'queued'

  const stateMap = {
    'Queued': 'queued',
    'In Progress': 'preparing',
    'Ready': 'ready',
    'Served': null,  // Don't display
    'Cancelled': null  // Don't display
  }

  return stateMap[workflowState] !== undefined ? stateMap[workflowState] : 'queued'
}

/**
 * Group KOTs by their workflow state
 * @param {Array} kots - Array of KOT objects
 * @returns {Object} Grouped KOTs by state
 */
export function groupKOTsByState(kots) {
  const grouped = {
    queued: [],
    preparing: [],
    ready: []
  }

  if (!Array.isArray(kots)) return grouped

  kots.forEach(kot => {
    const state = normalizeWorkflowState(kot.workflow_state)
    if (state && grouped[state]) {
      grouped[state].push(kot)
    }
  })

  return grouped
}

/**
 * Get available stations from KOT list
 * @param {Array} kots - Array of KOT objects
 * @returns {Array} Unique station names
 */
export function getStationsFromKOTs(kots) {
  if (!Array.isArray(kots)) return []

  const stations = new Set()
  kots.forEach(kot => {
    if (kot.station) {
      stations.add(kot.station)
    }
  })

  return Array.from(stations).sort()
}
