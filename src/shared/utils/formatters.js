/**
 * Formatting utilities for consistent data display across IMOGI POS apps
 */

/**
 * Format amount as Indonesian Rupiah currency
 * 
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "Rp 150.000")
 * 
 * @example
 *   formatCurrency(150000) // "Rp 150.000"
 *   formatCurrency(0) // "Rp 0"
 *   formatCurrency(null) // "Rp 0"
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount || 0)
}

/**
 * Format date to Indonesian locale format
 * 
 * @param {string|Date} date - Date string or Date object
 * @returns {string} Formatted date (e.g., "04/02/2026")
 */
export function formatDate(date) {
  if (!date) return '-'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleDateString('id-ID')
}

/**
 * Format date and time to Indonesian locale format
 * 
 * @param {string|Date} date - Date string or Date object
 * @returns {string} Formatted date and time (e.g., "04/02/2026 14:30:45")
 */
export function formatDateTime(date) {
  if (!date) return '-'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleString('id-ID')
}

/**
 * Format time to HH:MM format
 * 
 * @param {string|Date} date - Date string or Date object
 * @returns {string} Formatted time (e.g., "14:30")
 */
export function formatTime(date) {
  if (!date) return '-'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return dateObj.toLocaleTimeString('id-ID', { 
    hour: '2-digit', 
    minute: '2-digit'
  })
}

/**
 * Format percentage
 * 
 * @param {number} value - The value (0-100)
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage (e.g., "15.50%")
 */
export function formatPercentage(value, decimals = 2) {
  return (value || 0).toFixed(decimals) + '%'
}

/**
 * Format quantity with units
 * 
 * @param {number} qty - Quantity
 * @param {string} uom - Unit of Measure (e.g., "pcs", "kg")
 * @returns {string} Formatted quantity (e.g., "10 pcs")
 */
export function formatQuantity(qty, uom = 'pcs') {
  return `${qty || 0} ${uom}`
}

/**
 * Capitalize first letter of string
 * 
 * @param {string} str - The string to capitalize
 * @returns {string} Capitalized string
 */
export function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Format status badge text
 * 
 * @param {string} status - The status (e.g., "draft", "submitted")
 * @returns {string} Formatted status for display
 */
export function formatStatus(status) {
  if (!status) return '-'
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
