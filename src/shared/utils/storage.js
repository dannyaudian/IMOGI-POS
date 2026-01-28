/**
 * IMOGI POS - Storage Utility
 * ============================
 * 
 * Centralized wrapper for localStorage and sessionStorage operations.
 * 
 * Features:
 * - Consistent key naming (imogi_* prefix)
 * - TTL (Time To Live) support
 * - JSON serialization/deserialization
 * - Clear helpers for logout/cleanup
 * - Standard logging with [imogi][storage]
 * 
 * Usage:
 *   import { setItem, getItem, removeItem, clearAll } from '@/shared/utils/storage'
 *   
 *   // Set item with 1 hour TTL
 *   setItem('operational_context', contextData, 3600)
 *   
 *   // Get item (returns null if expired or not found)
 *   const context = getItem('operational_context')
 *   
 *   // Remove item
 *   removeItem('operational_context')
 *   
 *   // Clear all imogi_* keys
 *   clearAll()
 *   
 *   // Clear on logout (keeps persistent keys like debug_logs)
 *   clearOnLogout()
 */

import * as logger from './logger'

// Keys that should persist across logout
const PERSISTENT_KEYS = [
  'imogi_debug',
  'imogi_debug_logs'
]

/**
 * Get full storage key with imogi_ prefix
 * @param {string} key - Key without prefix
 * @returns {string} Full key with imogi_ prefix
 */
function getFullKey(key) {
  // If already has imogi_ prefix, use as-is
  if (key.startsWith('imogi_')) {
    return key
  }
  return `imogi_${key}`
}

/**
 * Get storage instance (localStorage or sessionStorage)
 * @param {boolean} useSession - Use sessionStorage if true, localStorage if false
 * @returns {Storage} Storage instance
 */
function getStorage(useSession) {
  return useSession ? sessionStorage : localStorage
}

/**
 * Check if stored data is expired (TTL check)
 * @param {Object} storedData - Data retrieved from storage
 * @returns {boolean} True if expired
 */
function isExpired(storedData) {
  if (!storedData || !storedData.ttl || !storedData.timestamp) {
    return false // No TTL set, never expires
  }
  
  const now = Date.now()
  const expiryTime = storedData.timestamp + (storedData.ttl * 1000)
  return now > expiryTime
}

/**
 * Get item from storage
 * @param {string} key - Key (without imogi_ prefix)
 * @param {boolean} useSession - Use sessionStorage if true (default: false)
 * @returns {*} Stored value or null if not found/expired
 */
export function getItem(key, useSession = false) {
  const fullKey = getFullKey(key)
  const storage = getStorage(useSession)
  
  try {
    const raw = storage.getItem(fullKey)
    if (!raw) {
      logger.debug('storage', `Get: ${fullKey} (not found)`)
      return null
    }
    
    // Try to parse as JSON
    let storedData
    try {
      storedData = JSON.parse(raw)
    } catch (e) {
      // Not JSON, return as-is
      logger.debug('storage', `Get: ${fullKey} (raw value)`)
      return raw
    }
    
    // Check if this is our TTL format
    if (storedData && typeof storedData === 'object' && storedData.hasOwnProperty('value')) {
      // Check TTL
      if (isExpired(storedData)) {
        logger.debug('storage', `Get: ${fullKey} (expired, removing)`)
        storage.removeItem(fullKey)
        return null
      }
      
      logger.debug('storage', `Get: ${fullKey} (TTL: ${storedData.ttl || 'none'})`)
      return storedData.value
    }
    
    // Return parsed JSON as-is (legacy format)
    logger.debug('storage', `Get: ${fullKey}`)
    return storedData
    
  } catch (error) {
    logger.error('storage', `Failed to get ${fullKey}`, error)
    return null
  }
}

/**
 * Set item in storage
 * @param {string} key - Key (without imogi_ prefix)
 * @param {*} value - Value to store (will be JSON stringified)
 * @param {number|null} ttl - Time to live in seconds (null = no expiry)
 * @param {boolean} useSession - Use sessionStorage if true (default: false)
 */
export function setItem(key, value, ttl = null, useSession = false) {
  const fullKey = getFullKey(key)
  const storage = getStorage(useSession)
  
  try {
    let dataToStore
    
    if (ttl !== null && ttl > 0) {
      // Store with TTL
      dataToStore = {
        value: value,
        ttl: ttl,
        timestamp: Date.now()
      }
      logger.log('storage', `Set: ${fullKey} (TTL: ${ttl}s)`)
    } else {
      // Store without TTL
      dataToStore = value
      logger.log('storage', `Set: ${fullKey}`)
    }
    
    storage.setItem(fullKey, JSON.stringify(dataToStore))
    
  } catch (error) {
    logger.error('storage', `Failed to set ${fullKey}`, error)
  }
}

/**
 * Remove item from storage
 * @param {string} key - Key (without imogi_ prefix)
 * @param {boolean} useSession - Use sessionStorage if true (default: false)
 */
export function removeItem(key, useSession = false) {
  const fullKey = getFullKey(key)
  const storage = getStorage(useSession)
  
  try {
    storage.removeItem(fullKey)
    logger.log('storage', `Remove: ${fullKey}`)
  } catch (error) {
    logger.error('storage', `Failed to remove ${fullKey}`, error)
  }
}

/**
 * Clear all imogi_* keys from storage
 * @param {boolean} useSession - Clear sessionStorage if true (default: false)
 */
export function clearAll(useSession = false) {
  const storage = getStorage(useSession)
  const storageType = useSession ? 'sessionStorage' : 'localStorage'
  
  try {
    const keys = Object.keys(storage)
    const imogiKeys = keys.filter(k => k.startsWith('imogi_'))
    
    logger.log('storage', `Clearing all imogi_* keys from ${storageType} (${imogiKeys.length} keys)`)
    
    imogiKeys.forEach(key => {
      storage.removeItem(key)
      logger.debug('storage', `Removed: ${key}`)
    })
    
    logger.success('storage', `Cleared ${imogiKeys.length} keys from ${storageType}`)
    
  } catch (error) {
    logger.error('storage', `Failed to clear ${storageType}`, error)
  }
}

/**
 * Clear all imogi_* keys except persistent ones (for logout)
 * Clears both localStorage and sessionStorage
 */
export function clearOnLogout() {
  logger.log('storage', 'Clearing non-persistent keys on logout...')
  
  try {
    // Clear sessionStorage completely (nothing should persist)
    sessionStorage.clear()
    logger.debug('storage', 'Cleared all sessionStorage')
    
    // Clear localStorage except persistent keys
    const keys = Object.keys(localStorage)
    const imogiKeys = keys.filter(k => k.startsWith('imogi_'))
    let cleared = 0
    
    imogiKeys.forEach(key => {
      if (!PERSISTENT_KEYS.includes(key)) {
        localStorage.removeItem(key)
        logger.debug('storage', `Removed: ${key}`)
        cleared++
      } else {
        logger.debug('storage', `Kept persistent: ${key}`)
      }
    })
    
    logger.success('storage', `Logout cleanup complete (${cleared} keys cleared, ${PERSISTENT_KEYS.length} kept)`)
    
  } catch (error) {
    logger.error('storage', 'Failed to clear on logout', error)
  }
}

/**
 * Check if key exists in storage
 * @param {string} key - Key (without imogi_ prefix)
 * @param {boolean} useSession - Check sessionStorage if true (default: false)
 * @returns {boolean} True if key exists and not expired
 */
export function hasItem(key, useSession = false) {
  const value = getItem(key, useSession)
  return value !== null
}

/**
 * Get all imogi_* keys from storage
 * @param {boolean} useSession - Get from sessionStorage if true (default: false)
 * @returns {string[]} Array of keys (without imogi_ prefix)
 */
export function getAllKeys(useSession = false) {
  const storage = getStorage(useSession)
  
  try {
    const keys = Object.keys(storage)
    const imogiKeys = keys.filter(k => k.startsWith('imogi_'))
    
    // Return keys without imogi_ prefix
    return imogiKeys.map(k => k.replace('imogi_', ''))
    
  } catch (error) {
    logger.error('storage', 'Failed to get all keys', error)
    return []
  }
}

/**
 * Export all storage data (for debugging)
 * @returns {Object} All imogi_* data from localStorage and sessionStorage
 */
export function exportAll() {
  try {
    const data = {
      localStorage: {},
      sessionStorage: {}
    }
    
    // Export localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('imogi_')) {
        try {
          data.localStorage[key] = JSON.parse(localStorage.getItem(key))
        } catch (e) {
          data.localStorage[key] = localStorage.getItem(key)
        }
      }
    })
    
    // Export sessionStorage
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('imogi_')) {
        try {
          data.sessionStorage[key] = JSON.parse(sessionStorage.getItem(key))
        } catch (e) {
          data.sessionStorage[key] = sessionStorage.getItem(key)
        }
      }
    })
    
    logger.log('storage', 'Exported all storage data', data)
    return data
    
  } catch (error) {
    logger.error('storage', 'Failed to export storage', error)
    return null
  }
}

// Export as default for convenience
export default {
  getItem,
  setItem,
  removeItem,
  clearAll,
  clearOnLogout,
  hasItem,
  getAllKeys,
  exportAll
}
