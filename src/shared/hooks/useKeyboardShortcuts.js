import { useEffect, useCallback } from 'react'

/**
 * Global keyboard shortcut hook for cashier productivity
 * 
 * Shortcuts ignore input fields (user can type normally)
 * ESC always works to blur/exit inputs
 * 
 * Usage:
 *   useKeyboardShortcuts({
 *     'slash': () => focusSearch(),
 *     'f2': () => openPayment(),
 *     'escape': () => closeModal(),
 *     'ctrl+n': () => newOrder(),
 *   })
 * 
 * @param {Object} shortcuts - Map of shortcut keys to handler functions
 */
export function useKeyboardShortcuts(shortcuts = {}) {
  const handleKeyDown = useCallback((e) => {
    // Ignore if user is typing in input/textarea
    if (
      e.target.tagName === 'INPUT' || 
      e.target.tagName === 'TEXTAREA' ||
      e.target.isContentEditable
    ) {
      // Allow ESC to blur/exit input
      if (e.key === 'Escape') {
        e.target.blur()
      }
      return
    }
    
    const key = e.key.toLowerCase()
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const alt = e.altKey
    
    // Special key mappings
    const keyMap = {
      '/': 'slash',
      'escape': 'esc',
      'enter': 'enter',
      ' ': 'space',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right',
    }
    
    const mappedKey = keyMap[key] || key
    
    // Build full shortcut string
    let fullKey = ''
    if (ctrl) fullKey += 'ctrl+'
    if (alt) fullKey += 'alt+'
    if (shift) fullKey += 'shift+'
    fullKey += mappedKey
    
    // Execute handler if exists
    const handler = shortcuts[fullKey] || shortcuts[mappedKey]
    if (handler) {
      e.preventDefault()
      handler(e)
      
      // Debug log in development
      if (import.meta.env.DEV) {
        console.log(`[Keyboard] Shortcut triggered: ${fullKey}`)
      }
    }
  }, [shortcuts])
  
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/**
 * Hook to display keyboard shortcuts to user
 * Returns array of shortcut definitions for rendering
 */
export function useShortcutHints() {
  return [
    { key: '/', description: 'Search items' },
    { key: 'F2', description: 'Open payment' },
    { key: 'F3', description: 'Open menu' },
    { key: 'ESC', description: 'Close/Cancel' },
    { key: 'Ctrl+N', description: 'New order' },
    { key: 'Enter', description: 'Confirm' },
  ]
}
