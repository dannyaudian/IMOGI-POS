/**
 * IMOGI POS - Branch Setup Verification Test
 * ===========================================
 * 
 * Test untuk memverifikasi branch configuration sudah benar.
 * Run di browser console setelah login.
 * 
 * USAGE:
 * 1. Login ke ERPNext
 * 2. Buka browser console (F12)
 * 3. Copy-paste script ini
 * 4. Run: verifyBranchSetup()
 * 
 * HASIL:
 * - ✅ Semua config benar → Module Select akan jalan
 * - ❌ Ada yang kurang → Instruksi perbaikan
 */

async function verifyBranchSetup() {
  console.log('🔍 IMOGI POS - Branch Setup Verification');
  console.log('=========================================\n');
  
  const results = {
    passed: [],
    warnings: [],
    errors: [],
    fixes: []
  };
  
  // Helper: Call API
  const api = async (method, args = {}) => {
    try {
      const response = await fetch('/api/method/' + method, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': frappe.csrf_token
        },
        body: JSON.stringify(args),
        credentials: 'include'
      });
      const data = await response.json();
      if (data.exc) {
        return { error: data.exc, _server_messages: data._server_messages };
      }
      return data.message;
    } catch (e) {
      return { error: e.message };
    }
  };
  
  // Test 1: Check if logged in
  console.log('📋 TEST 1: User Authentication');
  console.log('-------------------------------');
  
  if (!frappe.session.user || frappe.session.user === 'Guest') {
    console.error('❌ Not logged in!');
    results.errors.push('User not authenticated');
    results.fixes.push('Login to ERPNext first');
    return displayResults(results);
  }
  
  console.log('✅ Logged in as:', frappe.session.user);
  results.passed.push('User authenticated');
  console.log('');
  
  // Test 2: Check User roles
  console.log('📋 TEST 2: User Roles');
  console.log('---------------------');
  
  const roles = frappe.boot.user.roles || [];
  console.log('Roles:', roles.join(', '));
  
  if (roles.includes('System Manager')) {
    console.log('✅ System Manager role found');
    results.passed.push('System Manager role');
  } else {
    console.log('ℹ️  Not System Manager (this is OK)');
    results.warnings.push('Not System Manager - will need branch assignment');
  }
  console.log('');
  
  // Test 3: Check Branch DocType
  console.log('📋 TEST 3: Branch DocType');
  console.log('-------------------------');
  
  const branchDoctypeExists = await api('frappe.client.get_list', {
    doctype: 'Branch',
    fields: ['name'],
    limit_page_length: 1
  });
  
  if (branchDoctypeExists.error) {
    console.error('❌ Branch DocType not found or not accessible!');
    console.error('Error:', branchDoctypeExists.error);
    results.errors.push('Branch DocType missing or no read permission');
    results.fixes.push('1. Create Branch DocType master');
    results.fixes.push('2. Or add Read permission for your role');
  } else {
    console.log('✅ Branch DocType accessible');
    results.passed.push('Branch DocType exists');
  }
  console.log('');
  
  // Test 4: Check available branches
  console.log('📋 TEST 4: Available Branches');
  console.log('-----------------------------');
  
  const branches = await api('frappe.client.get_list', {
    doctype: 'Branch',
    fields: ['name', 'disabled'],
    limit_page_length: 0
  });
  
  if (branches.error) {
    console.error('❌ Cannot fetch branches!');
    console.error('Error:', branches.error);
    results.errors.push('Cannot list branches');
    results.fixes.push('Add Read permission for Branch DocType');
  } else if (!branches || branches.length === 0) {
    console.error('❌ No branches exist in system!');
    results.errors.push('No branches configured');
    results.fixes.push('Create at least one Branch (e.g., "Main")');
  } else {
    console.log('✅ Found branches:');
    branches.forEach(b => {
      const status = b.disabled ? '(disabled)' : '(active)';
      console.log(`   - ${b.name} ${status}`);
    });
    results.passed.push(`${branches.length} branch(es) available`);
    
    const activeBranches = branches.filter(b => !b.disabled);
    if (activeBranches.length === 0) {
      console.warn('⚠️  All branches are disabled!');
      results.warnings.push('All branches disabled');
      results.fixes.push('Enable at least one branch');
    }
  }
  console.log('');
  
  // Test 5: Check User defaults
  console.log('📋 TEST 5: User Default Branch');
  console.log('-------------------------------');
  
  // This requires accessing User doc
  const userData = await api('frappe.client.get', {
    doctype: 'User',
    name: frappe.session.user
  });
  
  if (userData.error) {
    console.warn('⚠️  Cannot read User document');
    console.warn('Will check via get_user_branch_info instead');
    results.warnings.push('Cannot verify User defaults directly');
  } else {
    console.log('User data loaded successfully');
    
    // Check imogi_default_branch custom field
    if (userData.imogi_default_branch) {
      console.log('✅ imogi_default_branch:', userData.imogi_default_branch);
      results.passed.push('Custom field branch set');
    } else {
      console.warn('⚠️  imogi_default_branch field is empty');
      results.warnings.push('Custom field branch not set');
    }
    
    // Check User Defaults
    if (userData.defaults && userData.defaults.length > 0) {
      const branchDefault = userData.defaults.find(d => d.key === 'branch');
      if (branchDefault) {
        console.log('✅ User Default "branch":', branchDefault.value);
        results.passed.push('User Default branch set');
      } else {
        console.warn('⚠️  No "branch" in User Defaults');
        results.warnings.push('User Default branch not set');
        results.fixes.push('Set User → Defaults → branch = Main (or your branch name)');
      }
    } else {
      console.warn('⚠️  User has no defaults configured');
      results.warnings.push('No User Defaults found');
      results.fixes.push('Set User → Defaults → branch = Main (or your branch name)');
    }
  }
  console.log('');
  
  // Test 6: Test get_user_branch_info API
  console.log('📋 TEST 6: get_user_branch_info API');
  console.log('------------------------------------');
  
  const branchInfo = await api('imogi_pos.api.module_select.get_user_branch_info');
  
  if (branchInfo.error) {
    console.error('❌ get_user_branch_info FAILED!');
    console.error('Error:', branchInfo.error);
    
    // Parse server messages for detailed error
    if (branchInfo._server_messages) {
      try {
        const messages = JSON.parse(branchInfo._server_messages);
        messages.forEach(msg => {
          const parsed = JSON.parse(msg);
          console.error('Server:', parsed.message);
        });
      } catch (e) {
        console.error('Raw error:', branchInfo._server_messages);
      }
    }
    
    results.errors.push('get_user_branch_info API failed');
    
    // Determine likely cause
    if (branchInfo.error.includes('No branch configured')) {
      results.fixes.push('⚠️  CRITICAL: Set branch in User Defaults');
      results.fixes.push('   Go to: User → Defaults → Add row:');
      results.fixes.push('   Key: branch');
      results.fixes.push('   Value: Main (or your branch name)');
      results.fixes.push('   Then LOGOUT and LOGIN again');
    }
    
  } else {
    console.log('✅ get_user_branch_info SUCCESS!');
    console.log('Response:', branchInfo);
    
    if (branchInfo.current_branch) {
      console.log(`✅ Current Branch: ${branchInfo.current_branch}`);
      results.passed.push('Branch resolved successfully');
    }
    
    if (branchInfo.available_branches && branchInfo.available_branches.length > 0) {
      console.log('✅ Available branches:', branchInfo.available_branches.length);
      results.passed.push('Branch list available');
    }
  }
  console.log('');
  
  // Display final results
  displayResults(results);
}

function displayResults(results) {
  console.log('\n');
  console.log('═══════════════════════════════════════');
  console.log('           VERIFICATION RESULTS        ');
  console.log('═══════════════════════════════════════\n');
  
  if (results.passed.length > 0) {
    console.log('✅ PASSED CHECKS (' + results.passed.length + '):');
    results.passed.forEach(p => console.log('   ✓', p));
    console.log('');
  }
  
  if (results.warnings.length > 0) {
    console.warn('⚠️  WARNINGS (' + results.warnings.length + '):');
    results.warnings.forEach(w => console.warn('   !', w));
    console.log('');
  }
  
  if (results.errors.length > 0) {
    console.error('❌ ERRORS (' + results.errors.length + '):');
    results.errors.forEach(e => console.error('   ✗', e));
    console.log('');
  }
  
  if (results.fixes.length > 0) {
    console.log('🔧 REQUIRED FIXES:');
    console.log('------------------');
    results.fixes.forEach((f, i) => console.log((i + 1) + '. ' + f));
    console.log('');
  }
  
  // Final verdict
  console.log('═══════════════════════════════════════\n');
  
  if (results.errors.length === 0 && results.fixes.length === 0) {
    console.log('🎉 SUCCESS! Module Select should work now.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Navigate to: /shared/module-select');
    console.log('2. Or click "Open POS" from IMOGI POS workspace');
    console.log('');
  } else {
    console.log('⚠️  SETUP INCOMPLETE - Please fix the issues above');
    console.log('');
    console.log('After fixing:');
    console.log('1. LOGOUT completely');
    console.log('2. LOGIN again');
    console.log('3. Run this test again: verifyBranchSetup()');
    console.log('');
  }
  
  // Store results for inspection
  window.branchSetupResults = results;
  console.log('💾 Results stored in: window.branchSetupResults');
}

// Auto-message
console.log('✨ Branch Setup Verification Script Loaded');
console.log('📝 Run: verifyBranchSetup()');
console.log('');
