/**
 * Quick Branch Configuration Verification
 * ========================================
 * 
 * Test untuk verify "No branch configured" error sudah fixed.
 * 
 * USAGE:
 * 1. Login ke ERPNext Desk
 * 2. Buka browser console (F12)
 * 3. Copy-paste script ini
 * 4. Run: await verifyBranchConfig()
 * 
 * EXPECTED RESULT:
 * - ✅ User has imogi_default_branch set
 * - ✅ Branch list is accessible (ignore_permissions=True)
 * - ✅ get_user_branch_info returns current_branch
 * - ✅ Module select loads without "No branch configured" error
 */

async function verifyBranchConfig() {
  console.log('🔍 Branch Configuration Verification');
  console.log('=====================================\n');

  const results = {
    userBranch: null,
    branchList: null,
    branchInfo: null,
    modules: null,
    errors: []
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

      const data = await response.json();
      
      if (!response.ok || data.exc) {
        return {
          success: false,
          httpStatus: response.status,
          error: data.exception || data._server_messages || `HTTP ${response.status}`,
          data: null
        };
      }

      return {
        success: true,
        httpStatus: response.status,
        data: data.message || data
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        data: null
      };
    }
  }

  // ============================================
  // TEST 1: Check User's Default Branch
  // ============================================
  console.log('📋 TEST 1: User Default Branch');
  console.log('------------------------------');
  
  try {
    const user = frappe.session.user;
    const userDoc = await api('frappe.client.get', { doctype: 'User', name: user });
    
    if (userDoc.success && userDoc.data) {
      const defaultBranch = userDoc.data.imogi_default_branch;
      results.userBranch = defaultBranch;
      
      if (defaultBranch) {
        console.log(`✅ User has imogi_default_branch: ${defaultBranch}`);
      } else {
        console.warn(`⚠️  User does NOT have imogi_default_branch set`);
        results.errors.push('No imogi_default_branch on User');
      }
    } else {
      console.error(`❌ Failed to fetch User doc: ${userDoc.error}`);
      results.errors.push('Cannot fetch User doc');
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    results.errors.push(`User check error: ${err.message}`);
  }
  console.log('');

  // ============================================
  // TEST 2: Check Branch List (Permission Test)
  // ============================================
  console.log('📋 TEST 2: Branch List Access');
  console.log('-----------------------------');
  
  // First test with safe fields only (name)
  const branchListSafeResult = await api('frappe.client.get_list', {
    doctype: 'Branch',
    fields: ['name'],
    limit_page_length: 10
  });
  
  if (branchListSafeResult.success) {
    console.log(`✅ Branch list (safe fields) accessible: ${branchListSafeResult.data.length} branches found`);
    branchListSafeResult.data.forEach((b, idx) => {
      console.log(`   ${idx + 1}. ${b.name}`);
    });
  } else {
    console.error(`❌ Cannot access Branch list (safe): ${branchListSafeResult.error}`);
  }
  
  // Test with potentially problematic fields (branch_name, disabled, company)
  console.log('\nTesting schema fields:');
  const schemaTests = [
    { field: 'branch', name: 'branch (standard)' },
    { field: 'branch_name', name: 'branch_name (custom)' },
    { field: 'disabled', name: 'disabled (standard)' },
    { field: 'company', name: 'company (standard)' }
  ];
  
  for (const test of schemaTests) {
    const testResult = await api('frappe.client.get_list', {
      doctype: 'Branch',
      fields: ['name', test.field],
      limit_page_length: 1
    });
    
    if (testResult.success) {
      console.log(`   ✅ Field '${test.field}' exists`);
    } else {
      console.warn(`   ⚠️  Field '${test.field}' NOT available - ${testResult.error}`);
      if (test.field === 'branch_name' || test.field === 'branch') {
        results.errors.push(`Missing field: ${test.field}`);
      }
    }
  }
  
  const branchListResult = branchListSafeResult;
  
  if (branchListResult.success) {
    results.branchList = branchListResult.data;
    
    if (branchListResult.data.length === 0) {
      console.warn(`\n⚠️  No branches in system - please create Branch master`);
      results.errors.push('No branches in system');
    }
  } else {
    console.error(`\n❌ Cannot access Branch list: ${branchListResult.error}`);
    console.error(`   This indicates permission issue on Branch DocType`);
    console.error(`   Fix: Add Read permission for your role on Branch DocType`);
    results.errors.push('Branch list permission error');
  }
  console.log('');

  // ============================================
  // TEST 3: Get User Branch Info (IMOGI API)
  // ============================================
  console.log('📋 TEST 3: IMOGI Branch Info API');
  console.log('---------------------------------');
  
  const branchInfoResult = await api('imogi_pos.api.module_select.get_user_branch_info');
  
  if (branchInfoResult.success) {
    results.branchInfo = branchInfoResult.data;
    console.log(`✅ get_user_branch_info successful`);
    console.log(`   Current Branch: ${branchInfoResult.data.current_branch}`);
    console.log(`   Available Branches: ${branchInfoResult.data.available_branches?.length || 0}`);
    
    if (!branchInfoResult.data.current_branch) {
      console.error(`❌ current_branch is NULL - this causes "No branch configured" error`);
      results.errors.push('current_branch is null');
    }
    
    if (!branchInfoResult.data.available_branches || branchInfoResult.data.available_branches.length === 0) {
      console.error(`❌ available_branches is empty - API cannot see branches`);
      results.errors.push('available_branches empty');
    }
  } else {
    console.error(`❌ get_user_branch_info failed: ${branchInfoResult.error}`);
    results.errors.push('get_user_branch_info API error');
  }
  console.log('');

  // ============================================
  // TEST 4: Get Available Modules
  // ============================================
  console.log('📋 TEST 4: Available Modules');
  console.log('----------------------------');
  
  const modulesResult = await api('imogi_pos.api.module_select.get_available_modules');
  
  if (modulesResult.success) {
    results.modules = modulesResult.data;
    console.log(`✅ get_available_modules successful`);
    console.log(`   Modules: ${modulesResult.data.modules?.length || 0}`);
    
    if (modulesResult.data.modules && modulesResult.data.modules.length > 0) {
      modulesResult.data.modules.forEach((m, idx) => {
        console.log(`   ${idx + 1}. ${m.name}`);
      });
    }
  } else {
    console.error(`❌ get_available_modules failed: ${modulesResult.error}`);
    results.errors.push('get_available_modules error');
  }
  console.log('');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('=====================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('=====================================');
  
  if (results.errors.length === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('');
    console.log('✅ User has branch configured');
    console.log('✅ Branch list is accessible');
    console.log('✅ IMOGI APIs work correctly');
    console.log('');
    console.log('You should be able to access /app/imogi-module-select without "No branch configured" error.');
  } else {
    console.error('⚠️  ISSUES FOUND:');
    results.errors.forEach((err, idx) => {
      console.error(`   ${idx + 1}. ${err}`);
    });
    console.log('');
    console.log('🔧 RECOMMENDED FIXES:');
    
    if (results.errors.includes('Branch list permission error')) {
      console.log('   1. Go to: Role Permissions Manager');
      console.log('   2. Select DocType: Branch');
      console.log('   3. Add Read permission for: System Manager, Branch Manager');
      console.log('   OR');
      console.log('   The code fix (ignore_permissions=True) should already handle this.');
      console.log('   Make sure the changes are deployed to the server.');
    }
    
    if (results.errors.includes('No imogi_default_branch on User')) {
      console.log('   1. Go to: User Settings');
      console.log('   2. Set imogi_default_branch field to a valid Branch name');
    }
    
    if (results.errors.includes('No branches in system')) {
      console.log('   1. Go to: Branch List');
      console.log('   2. Create at least one Branch (e.g., "Main")');
    }
  }
  console.log('');

  // Store results
  window.branchConfigResults = results;
  console.log('💾 Full results stored in: window.branchConfigResults');
  
  return results;
}

// Auto-message
console.log('✨ Branch Configuration Verification Script Loaded');
console.log('📝 To run: await verifyBranchConfig()');
console.log('');
