/**
 * IMOGI POS - Operational Context Resolver
 * 
 * CENTRALIZED resolver untuk pos_profile & branch.
 * JANGAN baca langsung dari localStorage atau state awal.
 * GUNAKAN resolver ini di semua tempat yang butuh context.
 * 
 * Architecture:
 * - Backend is SOURCE OF TRUTH (server authoritative)
 * - Frontend hanya consumer dan cache
 * - Strict resolution order (deterministic)
 * - No silent fallback
 * - No race condition
 */

import { apiCall } from './api'
import storage from './storage'

// Schema untuk localStorage cache
interface OperationalContextCache {
  pos_profile: string
  branch: string
  timestamp?: string
}

// CRITICAL: Cache key MUST match useOperationalContext.js hook
// storage.getItem/setItem auto-adds 'imogi_' prefix
// So 'operational_context_cache' becomes 'imogi_operational_context_cache' in localStorage
const CACHE_KEY = 'operational_context_cache'

// Schema untuk server response
interface OperationalContextResponse {
  current_pos_profile: string | null
  current_branch: string | null
  available_pos_profiles: Array<{
    name: string
    branch: string
    company: string
    mode: string
    pos_domain: string
  }>
  branches: string[]
  require_selection: boolean
  has_access: boolean
  role_class: string
  selection_method: string
  is_privileged: boolean
  context_required: boolean
  active_context?: {
    pos_profile: string
    branch: string
  }
}

// Schema untuk return value
export interface OperationalContext {
  pos_profile: string
  branch: string
  company?: string
}

// In-memory store (singleton untuk session)
let inMemoryContext: OperationalContext | null = null

// Timestamp untuk cache invalidation
let lastFetchTime = 0
const CACHE_TTL = 60 * 1000 // 1 menit

/**
 * RESOLVER UTAMA - SINGLE SOURCE OF TRUTH
 * 
 * Urutan resolusi (STRICT ORDER):
 * 1. In-memory store (React state / global store)
 * 2. localStorage: imogi_operational_context_cache
 * 3. Fetch server defaults: get_operational_context
 * 4. Auto-select jika hanya 1 POS Profile / 1 Branch
 * 5. Jika masih ambiguous → throw error (UI harus redirect ke module-select)
 * 
 * @returns {Promise<OperationalContext>} Resolved context
 * @throws {Error} Jika context tidak bisa diresolve
 */
export async function resolveOperationalContext(): Promise<OperationalContext> {
  console.log('[OperationalContext] Resolving context...')
  
  // 1. In-memory store (fastest)
  if (inMemoryContext) {
    if (isValidContext(inMemoryContext)) {
      console.log('[OperationalContext] Using in-memory context:', inMemoryContext.pos_profile)
      return inMemoryContext
    } else {
      console.warn('[OperationalContext] In-memory context invalid, clearing')
      inMemoryContext = null
    }
  }
  
  // 2. localStorage cache (dengan validasi)
  const cachedContext = storage.getItem(CACHE_KEY) as OperationalContextCache | null
  if (cachedContext && isValidContext(cachedContext)) {
    console.log('[OperationalContext] Using cached context:', cachedContext.pos_profile)
    inMemoryContext = cachedContext
    return cachedContext
  } else if (cachedContext) {
    console.warn('[OperationalContext] Cached context invalid, clearing')
    storage.removeItem(CACHE_KEY)
  }
  
  // 3. Fetch dari server (authoritative)
  const now = Date.now()
  if (now - lastFetchTime < CACHE_TTL && inMemoryContext) {
    // Type assertion needed due to TypeScript limitation with narrowing after multiple assignments
    const cachedInMemory = inMemoryContext as OperationalContext
    if (isValidContext(cachedInMemory)) {
      console.log('[OperationalContext] Using recent fetch:', cachedInMemory.pos_profile)
      return cachedInMemory
    }
  }
  
  try {
    console.log('[OperationalContext] Fetching from server...')
    const response = await apiCall(
      'imogi_pos.utils.operational_context.get_operational_context',
      {}
    ) as OperationalContextResponse
    
    lastFetchTime = now
    
    // Cek apakah ada active_context dari server
    if (response.active_context?.pos_profile) {
      const context: OperationalContext = {
        pos_profile: response.active_context.pos_profile,
        branch: response.active_context.branch
      }
      
      console.log('[OperationalContext] Server has active context:', context.pos_profile)
      
      // Simpan ke cache
      saveToCache(context)
      inMemoryContext = context
      
      return context
    }
    
    // 4. Auto-select jika current_pos_profile ada (dari server resolver)
    if (response.current_pos_profile && response.current_branch) {
      const context: OperationalContext = {
        pos_profile: response.current_pos_profile,
        branch: response.current_branch
      }
      
      console.log('[OperationalContext] Auto-resolved by server:', 
        context.pos_profile, 
        'method:', response.selection_method
      )
      
      // Set context ke server untuk persist ke session
      await setOperationalContextOnServer(context)
      
      // Simpan ke cache
      saveToCache(context)
      inMemoryContext = context
      
      return context
    }
    
    // 5. Tidak bisa resolve - throw error dengan informasi lengkap
    if (!response.has_access) {
      throw new Error(
        'CONTEXT_NO_ACCESS: No POS Profiles configured for your account. Contact administrator.'
      )
    }
    
    if (response.require_selection) {
      throw new Error(
        'CONTEXT_SELECTION_REQUIRED: Multiple POS Profiles available. Please select one from module selection page.'
      )
    }
    
    throw new Error(
      'CONTEXT_UNAVAILABLE: POS Profile required but could not be resolved.'
    )
    
  } catch (error: any) {
    console.error('[OperationalContext] Resolution failed:', error)
    
    // Re-throw with clear error message
    if (error.message?.startsWith('CONTEXT_')) {
      throw error
    }
    
    throw new Error(
      `CONTEXT_ERROR: Failed to resolve operational context: ${error.message || 'Unknown error'}`
    )
  }
}

/**
 * Set context ke server (untuk persist ke session)
 * JANGAN panggil langsung - gunakan resolveOperationalContext()
 */
async function setOperationalContextOnServer(context: OperationalContext): Promise<void> {
  try {
    await apiCall('imogi_pos.utils.operational_context.set_operational_context', {
      pos_profile: context.pos_profile,
      branch: context.branch
    })
    
    console.log('[OperationalContext] Context persisted to server session')
  } catch (error) {
    console.error('[OperationalContext] Failed to persist to server:', error)
    // Non-critical error - context sudah ter-resolve
  }
}

/**
 * Validasi apakah context valid
 */
function isValidContext(context: any): context is OperationalContext {
  return (
    context !== null &&
    typeof context === 'object' &&
    typeof context.pos_profile === 'string' &&
    context.pos_profile.length > 0 &&
    typeof context.branch === 'string' &&
    context.branch.length > 0
  )
}

/**
 * Simpan context ke localStorage cache
 */
function saveToCache(context: OperationalContext): void {
  const cacheData: OperationalContextCache = {
    pos_profile: context.pos_profile,
    branch: context.branch,
    timestamp: new Date().toISOString()
  }
  
  storage.setItem(CACHE_KEY, cacheData)
  console.log('[OperationalContext] Saved to cache:', context.pos_profile)
}

/**
 * Clear context (untuk logout atau switch user)
 */
export function clearOperationalContext(): void {
  inMemoryContext = null
  storage.removeItem(CACHE_KEY)
  lastFetchTime = 0
  console.log('[OperationalContext] Context cleared')
}

/**
 * Force refresh context dari server (invalidate cache)
 */
export async function refreshOperationalContext(): Promise<OperationalContext> {
  console.log('[OperationalContext] Force refresh requested')
  inMemoryContext = null
  storage.removeItem(CACHE_KEY)
  lastFetchTime = 0
  return resolveOperationalContext()
}

/**
 * Get context synchronously dari in-memory atau cache
 * HANYA untuk display purpose - JANGAN gunakan untuk API calls
 * Untuk API calls, HARUS pakai resolveOperationalContext() async
 */
export function getOperationalContextSync(): OperationalContext | null {
  if (inMemoryContext && isValidContext(inMemoryContext)) {
    return inMemoryContext
  }
  
  const cached = storage.getItem(CACHE_KEY) as OperationalContextCache | null
  if (cached && isValidContext(cached)) {
    return cached
  }
  
  return null
}

/**
 * Set context secara manual (dari module-select UI)
 * Ini akan langsung persist ke server dan update semua cache
 */
export async function setOperationalContext(
  posProfile: string,
  branch: string
): Promise<OperationalContext> {
  console.log('[OperationalContext] Setting context:', posProfile, branch)
  
  if (!posProfile || !branch) {
    throw new Error('pos_profile and branch are required')
  }
  
  const context: OperationalContext = {
    pos_profile: posProfile,
    branch: branch
  }
  
  // Validasi
  if (!isValidContext(context)) {
    throw new Error('Invalid context: pos_profile and branch must be non-empty strings')
  }
  
  try {
    // Set ke server (authoritative)
    await apiCall('imogi_pos.utils.operational_context.set_operational_context', {
      pos_profile: posProfile,
      branch: branch
    })
    
    // Update in-memory dan cache
    inMemoryContext = context
    saveToCache(context)
    lastFetchTime = Date.now()
    
    // Dispatch event untuk notify components lain
    window.dispatchEvent(new CustomEvent('operationalContextChanged', {
      detail: context
    }))
    
    console.log('[OperationalContext] Context set successfully:', posProfile)
    
    return context
    
  } catch (error: any) {
    console.error('[OperationalContext] Failed to set context:', error)
    throw new Error(
      `Failed to set operational context: ${error.message || 'Unknown error'}`
    )
  }
}
