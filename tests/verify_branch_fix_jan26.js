/**
 * IMOGI POS - Branch Fix Verification (January 26, 2026)
 * 
 * This script verifies the fixes for:
 * 1. Backend: Branch query using pluck='name' (avoid 417 errors)
 * 2. Frontend: frappe.call polyfill using GET for read-only methods
 * 
 * Run in browser console after logging in.
 */

(function() {
    'use strict';

    async function verifyBranchFix() {
        console.log('='.repeat(60));
        console.log('🔍 IMOGI POS - Branch Fix Verification');
        console.log('Date: January 26, 2026');
        console.log('='.repeat(60));

        const results = {
            passed: [],
            failed: [],
            warnings: []
        };

        // Test 1: Check user's imogi_default_branch
        console.log('\n📋 Test 1: User Branch Configuration');
        try {
            const userBranchResp = await frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'User',
                    filters: { name: frappe.session.user },
                    fieldname: ['imogi_default_branch', 'name', 'full_name']
                }
            });

            const userData = userBranchResp.message;
            console.log('   User:', userData.full_name || userData.name);
            console.log('   imogi_default_branch:', userData.imogi_default_branch || '(not set)');

            if (userData.imogi_default_branch) {
                results.passed.push('User has imogi_default_branch: ' + userData.imogi_default_branch);
            } else {
                results.warnings.push('User does not have imogi_default_branch set. Will fallback to User Defaults.');
            }
        } catch (e) {
            console.error('   ❌ Error:', e.message);
            results.failed.push('Failed to get user branch config: ' + e.message);
        }

        // Test 2: Test polyfill GET for read-only method (should work now)
        console.log('\n📋 Test 2: Polyfill GET Request (read-only method)');
        try {
            console.log('   Calling get_user_role_context via frappe.call...');
            const roleResp = await frappe.call({
                method: 'imogi_pos.utils.auth_helpers.get_user_role_context',
                args: {}  // Empty args = read-only = should use GET
            });

            console.log('   ✅ Success! Response:', roleResp.message);
            results.passed.push('Polyfill correctly uses GET for read-only methods');
            
            if (roleResp.message && roleResp.message.roles) {
                console.log('   User roles:', roleResp.message.roles);
            }
        } catch (e) {
            console.error('   ❌ Error:', e.message);
            if (e.message.includes('400') || e.message.includes('Bad Request')) {
                results.failed.push('Polyfill still using POST without CSRF (400 error). Check frappe_polyfill.js');
            } else if (e.message.includes('403')) {
                results.failed.push('CSRF token issue or permission denied (403). Check polyfill CSRF logic.');
            } else {
                results.failed.push('get_user_role_context failed: ' + e.message);
            }
        }

        // Test 3: Test direct fetch GET (baseline - should always work)
        console.log('\n📋 Test 3: Direct Fetch GET (baseline test)');
        try {
            const fetchResp = await fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context', {
                credentials: 'include'
            });
            
            if (!fetchResp.ok) {
                throw new Error(`HTTP ${fetchResp.status}: ${fetchResp.statusText}`);
            }
            
            const data = await fetchResp.json();
            console.log('   ✅ Direct fetch works! Response:', data.message);
            results.passed.push('Direct GET request works (baseline OK)');
        } catch (e) {
            console.error('   ❌ Error:', e.message);
            results.failed.push('Direct GET request failed (backend issue): ' + e.message);
        }

        // Test 4: Test backend branch API (the main fix)
        console.log('\n📋 Test 4: Backend Branch API (get_user_branch_info)');
        try {
            const branchResp = await fetch('/api/method/imogi_pos.api.module_select.get_user_branch_info', {
                credentials: 'include'
            });

            if (!branchResp.ok) {
                const errorText = await branchResp.text();
                throw new Error(`HTTP ${branchResp.status}: ${errorText}`);
            }

            const branchData = await branchResp.json();
            console.log('   ✅ Success! Response:', branchData.message);

            if (branchData.message && branchData.message.current_branch) {
                console.log('   Current Branch:', branchData.message.current_branch);
                console.log('   Available Branches:', branchData.message.available_branches);
                results.passed.push('Branch API returns valid data with current_branch: ' + branchData.message.current_branch);
            } else {
                results.warnings.push('Branch API returned but missing current_branch field');
            }
        } catch (e) {
            console.error('   ❌ Error:', e.message);
            
            if (e.message.includes('417')) {
                results.failed.push('CRITICAL: Branch query still using invalid fields (417 error). Check module_select.py line ~186');
            } else if (e.message.includes('403')) {
                results.failed.push('Branch permission denied (403). Check ignore_permissions=True in query');
            } else if (e.message.includes('No branch configured')) {
                results.failed.push('Backend error: User has no branch configured. Set imogi_default_branch or User Defaults.');
            } else {
                results.failed.push('Branch API failed: ' + e.message);
            }
        }

        // Test 5: Test module select (end-to-end)
        console.log('\n📋 Test 5: Module Select API (end-to-end)');
        try {
            const moduleResp = await fetch('/api/method/imogi_pos.api.module_select.get_available_modules', {
                credentials: 'include'
            });

            if (!moduleResp.ok) {
                const errorText = await moduleResp.text();
                throw new Error(`HTTP ${moduleResp.status}`);
            }

            const moduleData = await moduleResp.json();
            console.log('   ✅ Success!');
            
            if (moduleData.message && moduleData.message.modules) {
                console.log('   Available modules:', moduleData.message.modules.length);
                console.log('   Modules:', moduleData.message.modules.map(m => m.name).join(', '));
                results.passed.push('Module select API works: ' + moduleData.message.modules.length + ' modules available');
            }
        } catch (e) {
            console.error('   ❌ Error:', e.message);
            results.failed.push('Module select API failed: ' + e.message);
        }

        // Final Report
        console.log('\n' + '='.repeat(60));
        console.log('📊 VERIFICATION REPORT');
        console.log('='.repeat(60));

        if (results.passed.length > 0) {
            console.log('\n✅ PASSED (' + results.passed.length + '):');
            results.passed.forEach(msg => console.log('   ✓', msg));
        }

        if (results.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS (' + results.warnings.length + '):');
            results.warnings.forEach(msg => console.log('   ⚠', msg));
        }

        if (results.failed.length > 0) {
            console.log('\n❌ FAILED (' + results.failed.length + '):');
            results.failed.forEach(msg => console.log('   ✗', msg));
        }

        console.log('\n' + '='.repeat(60));

        if (results.failed.length === 0) {
            console.log('✅ ALL TESTS PASSED! Branch fix is working correctly.');
            console.log('\nNext steps:');
            console.log('1. Navigate to /shared/module-select');
            console.log('2. Verify module selection UI loads correctly');
            console.log('3. Test clicking on a module (e.g., Cashier)');
        } else {
            console.log('❌ SOME TESTS FAILED. Please review errors above.');
            console.log('\nCommon fixes:');
            console.log('1. If 417 error: module_select.py not using pluck="name"');
            console.log('2. If 400 error: frappe_polyfill.js not using GET for read-only');
            console.log('3. If "No branch": Set User → imogi_default_branch or User Defaults');
            console.log('4. Clear browser cache (Ctrl+Shift+R) after code changes');
        }

        console.log('='.repeat(60));

        return {
            passed: results.passed.length,
            failed: results.failed.length,
            warnings: results.warnings.length,
            total: results.passed.length + results.failed.length + results.warnings.length
        };
    }

    // Expose to global scope
    window.verifyBranchFix = verifyBranchFix;

    console.log('✅ Branch Fix Verification Script Loaded');
    console.log('Run: verifyBranchFix()');
})();
