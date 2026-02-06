/**
 * Debounce Hook
 * Delays updating a value until user stops typing/changing it
 * 
 * Example:
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 300)
 * 
 * // API call only happens 300ms after user stops typing
 * useEffect(() => {
 *   searchAPI(debouncedSearch)
 * }, [debouncedSearch])
 */

import { useState, useEffect } from 'react'

export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    // Set timeout to update debounced value
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Clear timeout if value changes before delay completes
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
