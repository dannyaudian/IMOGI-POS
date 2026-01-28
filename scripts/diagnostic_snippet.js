/**
 * IMOGI POS - Diagnostic Snippet for Debugging Auth & Context Issues
 * 
 * USAGE:
 * 1. Open browser DevTools (F12 or Cmd+Option+I)
 * 2. Go to Console tab
 * 3. Copy and paste this entire file
 * 4. Press Enter to run
 * 
 * WHAT IT DOES:
 * - Checks Frappe session state
 * - Validates cookies (sid)
 * - Tests operational context API
 * - Lists loaded React scripts
 * - Checks for 417 errors in network log
 * 
 * WHEN TO USE:
 * - After clearing cache and seeing errors
 * - When Cashier Console shows "POS Profile required"
 * - When redirected to /shared/login unexpectedly
 * - When getting 417 Expectation Failed errors
 */

(async function() {
  console.log('%c=== IMOGI POS DIAGNOSTIC REPORT ===', 'background: #1e3a8a; color: white; font-size: 16px; padding: 8px;')
  console.log('Running at:', new Date().toLocaleString())
  console.log('')

  // Section 1: Frappe Session State
  console.log('%c[1/6] Frappe Session State', 'background: #3b82f6; color: white; font-size: 14px; padding: 4px;')
  try {
    if (typeof frappe !== 'undefined') {
      console.log('✓ Frappe object available')
      console.log('  User:', frappe.session?.user || 'Unknown')
      console.log('  User roles:', frappe.session?.user_roles || 'Unknown')
      console.log('  CSRF Token:', frappe.csrf_token ? '✓ Present' : '✗ Missing')
      console.log('  Boot info:', frappe.boot ? '✓ Loaded' : '✗ Not loaded')
    } else {
      console.error('✗ Frappe object NOT available - this is a critical issue')
    }
  } catch (error) {
    console.error('✗ Error checking Frappe session:', error.message)
  }
  console.log('')

  // Section 2: Cookies Check
  console.log('%c[2/6] Cookie Validation', 'background: #3b82f6; color: white; font-size: 14px; padding: 4px;')
  try {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      acc[key] = value
      return acc
    }, {})
    
    const hasSid = cookies.sid && cookies.sid !== 'Guest'
    const hasUserName = cookies.user_name
    
    console.log('  sid cookie:', hasSid ? '✓ Present' : '✗ Missing or Guest')
    console.log('  user_name cookie:', hasUserName ? `✓ ${decodeURIComponent(hasUserName)}` : '✗ Missing')
    console.log('  full_name cookie:', cookies.full_name ? `✓ ${decodeURIComponent(cookies.full_name)}` : '✗ Missing')
    
    if (!hasSid) {
      console.warn('⚠ No valid sid cookie - user may be logged out')
    }
  } catch (error) {
    console.error('✗ Error checking cookies:', error.message)
  }
  console.log('')

  // Section 3: Operational Context API Test
  console.log('%c[3/6] Operational Context API', 'background: #3b82f6; color: white; font-size: 14px; padding: 4px;')
  try {
    const response = await fetch('/api/method/imogi_pos.utils.operational_context.get_operational_context', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Frappe-CSRF-Token': frappe.csrf_token || ''
      },
      credentials: 'include'
    })
    
    console.log('  API Response Status:', response.status, response.statusText)
    
    if (response.ok) {
      const data = await response.json()
      console.log('  ✓ API call successful')
      console.log('  Current POS Profile:', data.message?.current_pos_profile || 'None')
      console.log('  Current Branch:', data.message?.current_branch || 'None')
      console.log('  Available Profiles:', data.message?.available_pos_profiles?.length || 0)
      console.log('  Require Selection:', data.message?.require_selection || false)
      console.log('  Has Access:', data.message?.has_access !== false)
      console.log('  Role Class:', data.message?.role_class || 'Unknown')
      console.log('  Context Required:', data.message?.context_required !== false)
      
      if (data.message?.require_selection) {
        console.warn('⚠ POS Profile selection required - user should visit /app/imogi-module-select')
      }
    } else {
      console.error(`✗ API call failed with status ${response.status}`)
      const text = await response.text()
      console.error('  Response:', text.substring(0, 200))
      
      if (response.status === 417) {
        console.error('⚠ ERROR 417 - This is the bug! Context not set before API call.')
      }
      if (response.status === 401 || response.status === 403) {
        console.error('⚠ Authentication/Authorization error - user may be logged out')
      }
    }
  } catch (error) {
    console.error('✗ Error calling operational context API:', error.message)
  }
  console.log('')

  // Section 4: React Scripts Check
  console.log('%c[4/6] Loaded React Scripts', 'background: #3b82f6; color: white; font-size: 14px; padding: 4px;')
  try {
    const scripts = Array.from(document.querySelectorAll('script[src*="/react/"]'))
    if (scripts.length > 0) {
      console.log(`  ✓ Found ${scripts.length} React scripts:`)
      scripts.forEach(script => {
        const src = script.src
        const appName = src.match(/\/react\/([^\/]+)\//)?.[1] || 'unknown'
        console.log(`    - ${appName}: ${src}`)
      })
    } else {
      console.warn('  ⚠ No React scripts found - this may be expected on non-React pages')
    }
  } catch (error) {
    console.error('✗ Error checking React scripts:', error.message)
  }
  console.log('')

  // Section 5: Network Errors Check
  console.log('%c[5/6] Recent Network Errors', 'background: #3b82f6; color: white; font-size: 14px; padding: 4px;')
  console.log('  Note: Check Network tab in DevTools for 417 errors')
  console.log('  Look for: /api/method/imogi_pos.api.billing.list_orders_for_cashier')
  console.log('  If you see 417 errors, operational context was NOT set before API call')
  console.log('')

  // Section 6: sessionStorage Check
  console.log('%c[6/6] Session Storage', 'background: #3b82f6; color: white; font-size: 14px; padding: 4px;')
  try {
    const contextCache = sessionStorage.getItem('imogi_operational_context_cache')
    if (contextCache) {
      console.log('  ✓ Operational context cache found:')
      const parsed = JSON.parse(contextCache)
      console.log('    POS Profile:', parsed.pos_profile || 'None')
      console.log('    Branch:', parsed.branch || 'None')
    } else {
      console.log('  ⚠ No operational context cache in sessionStorage')
    }
    
    // Check for other IMOGI POS keys
    const allKeys = Object.keys(sessionStorage).filter(key => key.includes('imogi') || key.includes('pos'))
    if (allKeys.length > 0) {
      console.log('  Other POS-related keys:', allKeys)
    }
  } catch (error) {
    console.error('✗ Error checking sessionStorage:', error.message)
  }
  console.log('')

  // Summary
  console.log('%c=== DIAGNOSTIC SUMMARY ===', 'background: #1e3a8a; color: white; font-size: 16px; padding: 8px;')
  
  const isLoggedIn = typeof frappe !== 'undefined' && frappe.session?.user && frappe.session.user !== 'Guest'
  const hasCookies = document.cookie.includes('sid=') && !document.cookie.includes('sid=Guest')
  
  if (isLoggedIn && hasCookies) {
    console.log('%c✓ User appears to be logged in', 'color: green; font-weight: bold;')
    console.log('%cNext step: Check if operational context API returned POS Profile', 'color: blue;')
    console.log('%cIf no POS Profile: Visit /app/imogi-module-select to select one', 'color: blue;')
  } else {
    console.log('%c✗ User may NOT be logged in', 'color: red; font-weight: bold;')
    console.log('%cRecommendation: Login at /login', 'color: orange;')
  }
  
  console.log('')
  console.log('%cFor support, share this output with the development team.', 'color: gray; font-style: italic;')
  console.log('%c=== END OF DIAGNOSTIC REPORT ===', 'background: #1e3a8a; color: white; font-size: 16px; padding: 8px;')
})()
