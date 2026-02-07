/**
 * Browser Console Test for POSProfileGuard Fix
 * 
 * Run this in browser console after opening /app/imogi-cashier
 * to verify the guard behavior after localStorage clear
 * 
 * Usage:
 * 1. Open /app/imogi-cashier in browser
 * 2. Open Developer Console (F12)
 * 3. Copy-paste this entire script
 * 4. Run: testPOSProfileGuard()
 */

async function testPOSProfileGuard() {
  console.log('🧪 Testing POSProfileGuard behavior...\n')
  
  // Test 1: Clear storage and reload
  console.log('Test 1: Clear localStorage and verify fallback')
  console.log('📋 Before clear:')
  console.log('- localStorage items:', Object.keys(localStorage).length)
  console.log('- POS Profile from cache:', localStorage.getItem('imogi_operational_context_cache'))
  
  localStorage.clear()
  sessionStorage.clear()
  
  console.log('\n✅ Storage cleared')
  console.log('⏳ Reloading page in 2 seconds...')
  console.log('Expected: Should auto-select profile or show selector (NOT stuck at "missing")\n')
  
  setTimeout(() => {
    location.reload()
  }, 2000)
}

async function checkPOSProfileSettings(profileName) {
  console.log(`\n🔍 Checking POS Profile settings for: ${profileName}`)
  
  try {
    const result = await frappe.call({
      method: 'frappe.client.get_value',
      args: {
        doctype: 'POS Profile',
        filters: { name: profileName },
        fieldname: ['imogi_require_pos_session', 'imogi_enforce_session_on_cashier']
      }
    })
    
    if (result.message) {
      const requiresSession = !!result.message.imogi_require_pos_session
      const enforcesOnCashier = !!result.message.imogi_enforce_session_on_cashier
      
      console.log('Settings:')
      console.log(`  - imogi_require_pos_session: ${result.message.imogi_require_pos_session} (${requiresSession ? 'YES' : 'NO'})`)
      console.log(`  - imogi_enforce_session_on_cashier: ${result.message.imogi_enforce_session_on_cashier} (${enforcesOnCashier ? 'YES' : 'NO'})`)
      
      if (!requiresSession || !enforcesOnCashier) {
        console.log('✅ This profile ALLOWS operation WITHOUT opening')
      } else {
        console.log('⚠️  This profile REQUIRES opening to operate')
      }
    }
  } catch (err) {
    console.error('❌ Error fetching profile settings:', err)
  }
}

async function checkActiveOpening() {
  console.log('\n🔍 Checking active POS opening...')
  
  try {
    const result = await frappe.call({
      method: 'imogi_pos.api.module_select.get_active_pos_opening'
    })
    
    if (result.message) {
      const opening = result.message
      
      if (opening.pos_opening_entry) {
        console.log('✅ Opening found:', opening.pos_opening_entry)
        console.log('  - POS Profile:', opening.pos_profile_name)
        console.log('  - Balance:', opening.opening_balance)
        console.log('  - Status:', opening.status)
      } else if (opening.error_code === 'no_active_opening') {
        console.log('⚠️  No active opening (but this might be OK depending on profile settings)')
        console.log('  - Error Code:', opening.error_code)
        console.log('  - Message:', opening.error_message || 'No message')
      } else {
        console.log('ℹ️  Opening response:', opening)
      }
    }
  } catch (err) {
    console.error('❌ Error fetching opening:', err)
  }
}

async function testCurrentState() {
  console.log('\n📊 Current Guard State Check\n')
  
  // Check operational context
  try {
    const context = await frappe.call({
      method: 'imogi_pos.utils.operational_context.get_operational_context'
    })
    
    if (context.message) {
      console.log('Operational Context:')
      console.log('  - POS Profile:', context.message.current_pos_profile || 'NOT SET')
      console.log('  - Branch:', context.message.current_branch || 'NOT SET')
      console.log('  - Available Profiles:', context.message.available_profiles?.length || 0)
      
      const profile = context.message.current_pos_profile
      if (profile) {
        await checkPOSProfileSettings(profile)
        await checkActiveOpening()
      } else {
        console.log('\n⚠️  No POS Profile selected')
        if (context.message.available_profiles?.length === 1) {
          console.log('💡 TIP: Only 1 profile available, guard should auto-select it')
        } else if (context.message.available_profiles?.length > 1) {
          console.log('💡 TIP: Multiple profiles available, user needs to select')
        } else {
          console.log('❌ No profiles available for this user')
        }
      }
    }
  } catch (err) {
    console.error('❌ Error fetching context:', err)
  }
}

// Auto-run current state check
console.log('🚀 POSProfileGuard Test Script Loaded')
console.log('\nAvailable commands:')
console.log('  - testPOSProfileGuard()     : Clear storage and reload')
console.log('  - testCurrentState()        : Check current guard state')
console.log('  - checkPOSProfileSettings("ProfileName") : Check specific profile')
console.log('  - checkActiveOpening()      : Check if opening exists')
console.log('\n')

// Run current state check automatically
testCurrentState()
