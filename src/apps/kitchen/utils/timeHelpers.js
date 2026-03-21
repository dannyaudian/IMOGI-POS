/**
 * Format elapsed time from creation date
 * @param {string} creationDate - ISO date string
 * @returns {string} Formatted elapsed time
 */
export function formatElapsedTime(creationDate) {
  if (!creationDate) return ''

  const now = new Date()
  const created = new Date(creationDate)
  const diffMs = now - created

  if (diffMs < 0) return '0m'

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffHours > 0) {
    const mins = diffMins % 60
    return `${diffHours}h ${mins}m`
  }

  return `${diffMins}m`
}

/**
 * Get time class for SLA indicators
 * @param {string} creationDate - ISO date string
 * @param {number} warnMinutes - Warning threshold in minutes
 * @param {number} criticalMinutes - Critical threshold in minutes
 * @returns {string} CSS class name
 */
export function getTimeClass(creationDate, warnMinutes = 15, criticalMinutes = 30) {
  if (!creationDate) return ''

  const diffMs = new Date() - new Date(creationDate)
  if (diffMs < 0) return 'time-ok'
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins >= criticalMinutes) return 'time-critical'
  if (diffMins >= warnMinutes) return 'time-warning'
  return 'time-ok'
}
