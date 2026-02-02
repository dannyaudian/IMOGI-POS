import { useState, useEffect } from 'react'

/**
 * Debounce a value - waits for user to stop typing before updating
 * 
 * Perfect for search inputs, filters, or any rapidly changing value
 * where you want to wait for user to finish before processing.
 * 
 * Example:
 *   const [searchTerm, setSearchTerm] = useState('')
 *   const debouncedSearch = useDebounce(searchTerm, 300)
 *   
 *   // Use debouncedSearch for API calls or expensive filtering
 *   useEffect(() => {
 *     if (debouncedSearch) {
 *       performSearch(debouncedSearch)
 *     }
 *   }, [debouncedSearch])
 * 
 * @param {any} value - The value to debounce
 * @param {number} delay - Delay in milliseconds (default 300ms)
 * @returns {any} Debounced value that updates after delay
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    // Set timeout to update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    // Cleanup: cancel timeout if value changes again before delay
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])
  
  return debouncedValue
}

/**
 * Hook that returns whether a debounced value is "pending"
 * Useful for showing loading indicators while debouncing
 * 
 * Example:
 *   const [search, setSearch] = useState('')
 *   const [debouncedSearch, isPending] = useDebouncedValue(search, 300)
 *   
 *   return (
 *     <>
 *       <input value={search} onChange={e => setSearch(e.target.value)} />
 *       {isPending && <Spinner />}
 *       <Results query={debouncedSearch} />
 *     </>
 *   )
 */
export function useDebouncedValue(value, delay = 300) {
  const debouncedValue = useDebounce(value, delay)
  const isPending = value !== debouncedValue
  
  return [debouncedValue, isPending]
}
