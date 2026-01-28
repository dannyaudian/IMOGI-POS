/**
 * IMOGI POS - Admin Access Verification Script
 * ============================================
 * 
 * Script untuk verify bahwa user dengan System Manager role punya full access.
 * 
 * USAGE:
 * 1. Login sebagai danny.a.pratama@cao-group.co.id
 * 2. Buka browser console di halaman IMOGI POS
 * 3. Copy-paste seluruh script ini
 * 4. Run: await verifyAdminAccess()
 * 
 * EXPECTED RESULT:
 * - User info: danny.a.pratama@cao-group.co.id
 * - is_admin: true
 * - System Manager: true
 * - All 6 modules visible
 * - All 6 page routes accessible (200 OK)
 */

async function verifyAdminAccess() {
  console.log('🔍 IMOGI POS - Admin Access Verification');
  console.log('========================================\n');

  const results = {
    user: null,
    roleContext: null,
    modules: null,
    pageAccess: [],
    summary: {
      pass: 0,
      fail: 0,
      total: 0
    }
  };

  // Helper: Call Frappe API
  async function api(method, args = {}) {
    try {
      const url = `/api/method/${method}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': frappe.csrf_token
        },
        credentials: 'include',
        body: JSON.stringify(args)
      });

      if (!response.ok) {
        return {
          success: false,
          httpStatus: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json();
      return {
        success: true,
        httpStatus: response.status,
        data: data.message || data
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Helper: Check page access
  async function checkPage(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      });
      return {
        url,
        status: response.status,
        ok: response.ok
      };
    } catch (err) {
      return {
        url,
        status: 0,
        ok: false,
        error: err.message
      };
    }
  }

  // ============================================
  // TEST 1: Get Current User
  // ============================================
  console.log('📋 TEST 1: Get Current User');
  console.log('---------------------------');
  
  try {
    const currentUser = frappe.session.user;
    results.user = currentUser;
    
    console.log(`✅ Current User: ${currentUser}`);
    
    if (currentUser === 'Guest') {
      console.error('❌ FAIL: User is Guest - please login first!');
      return results;
    }
    
    results.summary.pass++;
  } catch (err) {
    console.error(`❌ FAIL: ${err.message}`);
    results.summary.fail++;
  }
  results.summary.total++;
  console.log('');

  // ============================================
  // TEST 2: Get User Role Context
  // ============================================
  console.log('📋 TEST 2: Get User Role Context');
  console.log('--------------------------------');
  
  const roleContextResult = await api('imogi_pos.utils.auth_helpers.get_user_role_context');
  
  if (roleContextResult.success) {
    const ctx = roleContextResult.data;
    results.roleContext = ctx;
    
    console.log(`User: ${ctx.user}`);
    console.log(`Full Name: ${ctx.full_name}`);
    console.log(`Roles: ${ctx.roles.join(', ')}`);
    console.log(`is_admin: ${ctx.is_admin}`);
    console.log(`is_guest: ${ctx.is_guest}`);
    console.log(`is_branch_manager: ${ctx.is_branch_manager}`);
    console.log(`is_cashier: ${ctx.is_cashier}`);
    console.log(`is_waiter: ${ctx.is_waiter}`);
    console.log(`is_kitchen_staff: ${ctx.is_kitchen_staff}`);
    
    // Verify admin access
    const hasSystemManager = ctx.roles.includes('System Manager');
    const isAdministrator = ctx.user === 'Administrator';
    const isAdmin = ctx.is_admin;
    
    if (hasSystemManager && isAdmin) {
      console.log('✅ PASS: User has System Manager role AND is_admin is TRUE');
      results.summary.pass++;
    } else if (isAdministrator && isAdmin) {
      console.log('✅ PASS: User is Administrator AND is_admin is TRUE');
      results.summary.pass++;
    } else {
      console.error('❌ FAIL: User should have is_admin = true');
      console.error(`   - System Manager: ${hasSystemManager}`);
      console.error(`   - is_admin: ${isAdmin}`);
      results.summary.fail++;
    }
  } else {
    console.error(`❌ FAIL: ${roleContextResult.error}`);
    results.summary.fail++;
  }
  results.summary.total++;
  console.log('');

  // ============================================
  // TEST 3: Get Available Modules
  // ============================================
  console.log('📋 TEST 3: Get Available Modules');
  console.log('--------------------------------');
  
  const modulesResult = await api('imogi_pos.api.module_select.get_available_modules');
  
  if (modulesResult.success) {
    const data = modulesResult.data;
    results.modules = data;
    
    console.log(`User: ${data.user}`);
    console.log(`Roles: ${data.roles.join(', ')}`);
    console.log(`Modules Count: ${data.modules.length}`);
    console.log('\nAvailable Modules:');
    
    data.modules.forEach((module, idx) => {
      console.log(`  ${idx + 1}. ${module.name} - ${module.url}`);
    });
    
    // Expected modules for System Manager
    const expectedModules = [
      'Counter POS',
      'Cashier Payment',
      'Kitchen Display',
      'Waiter Order',
      'Customer Display Editor',
      'Table Layout Editor'
    ];
    
    const moduleNames = data.modules.map(m => m.name);
    const hasAllModules = expectedModules.every(expected => 
      moduleNames.includes(expected)
    );
    
    if (hasAllModules && data.modules.length >= 6) {
      console.log('\n✅ PASS: User can see all expected modules (6+)');
      results.summary.pass++;
    } else {
      console.error('\n❌ FAIL: User should see all modules');
      console.error(`   Expected: ${expectedModules.join(', ')}`);
      console.error(`   Got: ${moduleNames.join(', ')}`);
      results.summary.fail++;
    }
  } else {
    console.error(`❌ FAIL: ${modulesResult.error}`);
    results.summary.fail++;
  }
  results.summary.total++;
  console.log('');

  // ============================================
  // TEST 4: Page Route Access
  // ============================================
  console.log('📋 TEST 4: Page Route Access');
  console.log('----------------------------');
  
  const pagesToTest = [
    { name: 'Module Select', url: '/app/imogi-module-select' },
    { name: 'Counter POS', url: '/counter/pos' },
    { name: 'Kitchen Display', url: '/restaurant/kitchen' },
    { name: 'Waiter Order', url: '/restaurant/waiter' },
    { name: 'Customer Display Editor', url: '/customer_display_editor' },
    { name: 'Table Layout Editor', url: '/table_layout_editor' }
  ];
  
  for (const page of pagesToTest) {
    const result = await checkPage(page.url);
    results.pageAccess.push(result);
    
    if (result.ok && result.status === 200) {
      console.log(`✅ ${page.name}: 200 OK`);
      results.summary.pass++;
    } else {
      console.error(`❌ ${page.name}: ${result.status} ${result.error || ''}`);
      results.summary.fail++;
    }
    results.summary.total++;
  }
  console.log('');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('========================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('========================================');
  console.log(`Total Tests: ${results.summary.total}`);
  console.log(`✅ Pass: ${results.summary.pass}`);
  console.log(`❌ Fail: ${results.summary.fail}`);
  
  const passRate = ((results.summary.pass / results.summary.total) * 100).toFixed(1);
  console.log(`Pass Rate: ${passRate}%`);
  
  if (results.summary.fail === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Admin access is working correctly.');
  } else {
    console.error('\n⚠️  SOME TESTS FAILED! Please review the issues above.');
  }
  console.log('');

  // Store results globally
  window.adminAccessResults = results;
  console.log('💾 Full results stored in: window.adminAccessResults');
  
  return results;
}

// Auto-run if script is pasted directly
console.log('✨ Admin Access Verification Script Loaded');
console.log('📝 To run: await verifyAdminAccess()');
console.log('');
