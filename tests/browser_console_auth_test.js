/**
 * IMOGI POS Authorization Test Suite (v2.0 - Final)
 * 
 * Comprehensive test harness untuk verify permission matrix across all modules
 * 
 * CARA PAKAI:
 * 1. Login sebagai user yang mau di-test (e.g., Cashier, Kitchen Staff, Waiter, Branch Manager)
 * 2. Paste SELURUH script ini ke Browser Console
 * 3. Edit CONFIG sesuai environment Anda
 * 4. Jalankan: await runAllTests()
 * 5. Tunggu hasil (akan print tabel PASS/FAIL per endpoint)
 * 
 * FEATURES:
 * - Role-aware expected status (403 bisa jadi PASS kalau memang tidak boleh akses)
 * - Auto-fetch sample data dari DB (no hardcoded IDs)
 * - Skip tests gracefully kalau data tidak ada
 * - Distinguish 500 errors (blocker) vs auth issues (403/401)
 * - Permission matrix summary per category
 * 
 * Results disimpan ke window.testResults untuk review
 */

// ============================================================================
// CONFIGURATION (EDIT SESUAI ENVIRONMENT)
// ============================================================================

const CONFIG = {
  branch: "Main",              // ⚠️ EDIT: Branch name di sistem Anda
  pos_profile: "Counter POS",   // ⚠️ EDIT: POS Profile name Anda
  kitchen: "Main Kitchen",      // Optional: Kitchen name untuk kitchen tests
  station: "Grill Station",    // Optional: Kitchen Station name
  floor: "Ground Floor",       // Optional: Floor name untuk table tests
  table: "T-001",              // Optional: Table name (akan auto-fetch jika ada)
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getCSRFToken() {
  return window.frappe?.csrf_token || window.FRAPPE_CSRF_TOKEN || '';
}

async function callAPI(method, args = {}) {
  const startTime = performance.now();
  
  try {
    const response = await fetch(`/api/method/${method}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': getCSRFToken(),
      },
      body: JSON.stringify(args),
    });

    const duration = (performance.now() - startTime).toFixed(2);
    const data = await response.json();

    return {
      method,
      status: response.status,
      duration: `${duration}ms`,
      success: response.ok,
      data: data.message || data,
      error: data.exc || data.exception || null,
      exc_source: data._exc_source || null,
      response: data,
    };
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2);
    return {
      method,
      status: 0,
      duration: `${duration}ms`,
      success: false,
      error: error.message,
      data: null,
    };
  }
}
, isExpected = true, isSkipped = false) {
  if (isSkipped) {
    return {
      icon: '⏭️',
      status: 'SKIPPED',
      code: result.status,
      duration: result.duration,
      method: result.method,
    };
  }

  let statusIcon, statusText;

  if (isExpected) {
    // Expected outcome
    statusIcon = '✅';
    statusText = result.status === 200 ? 'PASS' :
                result.status === 403 ? 'FORBIDDEN (OK)' :
                result.status === 401 ? 'UNAUTHORIZED (OK)' :
                result.status === 404 ? 'NOT FOUND (OK)' :
                `EXPECTED ${result.status}`;
  } else {
    // Unexpected outcome
    statusIcon = result.status === 500 ? '🚫' : '❌';
    statusText = result.status === 200 ? 'UNEXPECTED ACCESS' :
                result.status === 401 ? 'UNAUTHORIZED' :
                result.status === 403 ? 'FORBIDDEN' :
                result.status === 500 ? 'SERVER ERROR' :
                result.status === 0 ? 'NETWORK ERROR' :
                `UNEXPECTED ${result.status}`;
  }
  table: null,
};

async function fetchSampleData() {
  console.log("📦 Fetching sample data for tests...");
  
  // Get any POS Order
  try {
    const orderResult = await callAPI("frappe.client.get_list", {
      doctype: "POS Order",
      fields: ["name"],
      limit_page_length: 1,
      order_by: "creation desc",
    });
    SAMPLE_DATA.posOrder = orderResult.data?.[0]?.name || null;
    if (SAMPLE_DATA.posOrder) {
      console.log(`  ✅ Found POS Order: ${SAMPLE_DATA.posOrder}`);
    }
  } catch (e) {
    console.log("  ⚠️  No POS Orders found");
  }

  // Get any KOT Item
  try {
    consrequiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
        expectAccess: [200],
        expectDeny: [401, 403],
      },
      {
        name: "Get Order Details",
        method: "imogi_pos.api.cashier.get_order_details",
        argsBuilder: () => ({ order_name: SAMPLE_DATA.posOrder }),
        requiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
        expectAccess: [200, 404], // 404 OK if no orders exist
        expectDeny: [401, 403],
        skipIfNoData: 'posOrder',
      },
      {
        name: "Get Items (Counter)",
        method: "imogi_pos.api.cashier.get_items",
        args: { branch: CONFIG.branch, pos_profile: CONFIG.pos_profile },
        requiredRoles: ['Cashier', 'Waiter', 'Branch Manager', 'System Manager'],
        expectAccess: [200],
        expectDeny: [401, 403
    const tableResult = await callAPI("frappe.client.get_list", {
      doctype: "Restaurant Table",
      fields: ["name"],
      limit_page_length: 1,
      order_by: "creation desc",
    });
    SAMPLE_DATA.table = tableResult.data?.[0]?.name || CONFIG.table;
    if (SAMPLE_DATA.table) {
      console.log(`  ✅ Found Table: ${SAMPLE_DATA.table}`);
    }
  } catcrequiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
        expectAccess: [200],
        expectDeny: [401, 403],
        critical: true, // Mark as critical test
      },
      {
        name: "Get Draft Invoice",
        method: "imogi_pos.api.billing.get_draft_invoice",
        argsBuilder: () => ({ pos_order: SAMPLE_DATA.posOrder }),
        requiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
        expectAccess: [200, 404], // 404 OK if order has no invoice yet
        expectDeny: [401, 403],
        skipIfNoData: 'posOrder'
  const statusText = result.status === 200 ? 'PASS' :
                    result.status === 401 ? 'UNAUTHORIZED' :
                    result.status === 403 ? 'FORBIDDEN' :
                    result.status === 500 ? 'SERVER ERROR' :
                    result.status === 0 ? 'NETWORK ERROR' :
                    `HTTP ${result.status}`;
  
  return {
    icon: statusIcon,
    status: statusText,
    code: result.status,
    durarequiredRoles: ['Kitchen Staff', 'Branch Manager', 'System Manager'],
        expectAccess: [200],
        expectDeny: [401, 403],
      },
      {
        name: "Get KOTs for Kitchen",
        method: "imogi_pos.api.kot.get_kots_for_kitchen",
        args: { kitchen: CONFIG.kitchen, branch: CONFIG.branch },
        requiredRoles: ['Kitchen Staff', 'Branch Manager', 'System Manager'],
        expectAccess: [200],
        expectDeny: [401, 403],
      },
      {
        name: "Update KOT Item State",
        method: "imogi_pos.api.kot.update_kot_item_state",
        argsBuilder: () => ({ kot_item: SAMPLE_DATA.kotItem, state: "In Progress" }),
        requiredRoles: ['Kitchen Staff', 'Branch Manager', 'System Manager'],
        expectAccess: [200, 404], // 404 OK if KOT item not found
        expectDeny: [401, 403],
        skipIfNoData: 'kotItem'
    tests: [
      {
        name: "Get Logged User",
        method: "frappe.auth.get_logged_user",
        args: {},
        expect: { status: 200 },
      },
      {
        name: "Get User Role Context",
        method: "imogi_pos.utils.auth_helpers.get_user_role_context",
        requiredRoles: ['Waiter', 'Branch Manager', 'System Manager'],
        expectAccess: [200],
        expectDeny: [401, 403],
      },
      {
        name: "Get Tables",
        method: "imogi_pos.api.layout.get_tables",
        args: { branch: CONFIG.branch },
        requiredRoles: ['Waiter', 'Branch Manager', 'System Manager'],
        expectAccess: [200],
        expectDeny: [401, 403],
      },
      {
        name: "Update Table Status",
        method: "imogi_pos.api.layout.update_table_status",
        argsBuilder: () => ({ table: SAMPLE_DATA.table, status: "Available" }),
        requiredRoles: ['Waiter', 'Branch Manager', 'System Manager'],
        expectAccess: [200, 404], // 404 OK if table not found
        expectDeny: [401, 403],
        skipIfNoData: 'table'
        expect: { status: 200 },
        requiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
      },
      {
        name: "Get Order Details",
        method: "imogi_pos.api.cashier.get_order_details",
        args: { order_name: "POS-ORD-00001" }, // Will likely fail if order not exist, but tests permission
        expect: { status: [200, 404] },
        requiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
      },
      {
        name: "Get Items (Counter)",
        method: "imogi_pos.api.cashier.get_items",
        args: { branch: CONFIG.branch, pos_profile: CONFIG.pos_profile },
        expect: { status: 200 },
        requiredRoles: ['Cashier', 'Waiter', 'Branch Manager', 'System Manager'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // BILLING
  // -------------------------------------------------------------------------
  billing: {
    name: "Billing APIs",
    tests: [
      {
        name: "List Orders for Cashier",
        method: "imogi_pos.api.billing.list_orders_for_cashier",
        args: { branch: CONFIG.branch, pos_profile: CONFIG.pos_profile },
        expect: { status: 200 },
        requiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
        critical: true, // Mark as critical test
      },
      {
        name: "Get Draft Invoice",
        method: "imogi_pos.api.billing.get_draft_invoice",
        args: { pos_order: "POS-ORD-00001" },
        expect: { status: [200, 404] },
        requiredRoles: ['Cashier', 'Branch Manager', 'System Manager'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // KITCHEN
  // -------------------------------------------------------------------------
  kitchen: {
    name: "Kitchen APIs",
    tests: [
      {
        name: "Get Kitchens and Stations",
        method: "imogi_pos.api.kot.get_kitchens_and_stations",
        args: { branch: CONFIG.branch },
        expect: { status: 200 },
        requiredRoles: ['Kitchen Staff', 'Branch Manager', 'System Manager'],
      },
      {
        name: "Get KOTs for Kitchen",
        method: "imogi_pos.api.kot.get_kots_for_kitchen",
        args: { kitchen: CONFIG.kitchen, branch: CONFIG.branch },
        expect: { status: 200 },
        requiredRoles: ['Kitchen Staff', 'Branch Manager', 'System Manager'],
      },
      {
        name: "Update KOT Item State",
        method: "imogi_pos.api.kot.update_kot_item_state",
        args: { kot_item: "KOT-ITEM-00001", state: "In Progress" },
        expect: { status: [200, 404] },
        requiredRoles: ['Kitchen Staff', 'Branch Manager', 'System Manager'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // WAITER
  // ---requiredRoles: [], // Public - no roles required
        expectAccess: [200],
        expectDeny: [], // Should never deny
    name: "Waiter/Table APIs",
    tests: [
      {
        name: "Get Floors",
        method: "imogi_pos.api.layout.get_floors",
        args: {},
        expect: { status: 200 },
        requiredRoles: ['Waiter', 'Branch Manager', 'System Manager'],
      },
      {
        name: "Get Tables",
        method: "imogi_pos.api.layout.get_tables",
        args: { branch: CONFIG.branch },
        expect: { status: 200 },
        requiredRoles: ['Waiter', 'Branch Manager', 'System Manager'],
      },
      {
        name: "Update Table Status",
        method: "imogi_pos.api.layout.update_table_status",
        args: { table: CONFIG.table, status: "Available" },
        expect: { status: [200, 404] },
        requiredRoles: ['Waiter', 'Branch Manager', 'System Manager'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // PUBLIC (Guest accessible)
  // -------------------------------------------------------------------------
  public: {
    name: "Public APIs",
    tests: [
      {
        name: "Get Branding",
     Fetch sample data for tests
  await fetchSampleData();

  // Run tests by category
  const allResults = {};
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;
  let blockers = 0;

  for (const [category, suite] of Object.entries(TESTS)) {
    console.log(`\n📦 ${suite.name}`);
    console.log("─".repeat(60));

    const categoryResults = [];

    for (const test of suite.tests) {
      totalTests++;
      
      // Check if we should skip this test (no sample data)
      if (test.skipIfNoData && !SAMPLE_DATA[test.skipIfNoData]) {
        skippedTests++;
        const skippedResult = {
          method: test.method,
          status: 'SKIP',
          duration: '0ms',
        };
        const formatted = formatResult(skippedResult, false, true);
        
        console.log(
          `${formatted.icon} ${test.name.padEnd(35)} | ${formatted.status.padEnd(15)} | ${formatted.duration.padStart(8)}`
        );
        console.log(`   ℹ️  Skipped: No ${test.skipIfNoData} available for testing`);
        
        categoryResults.push({
          test: test.name,
          ...formatted,
          skipped: true,
        });
        continue;
      }

      // Build args (dynamic or static)
      const args = test.argsBuilder ? test.argsBuilder() : test.args;
      
      // Run test
      const result = await callAPI(test.method, args);

      // Check if user has required roles
      const hasRequiredRole = !test.requiredRoles || 
                             test.requiredRoles.length === 0 ||
                             test.requiredRoles.some(role => userRoles.includes(role)) ||
                             userRoles.includes('System Manager');

      // Determine expected status based on role
      const expectedStatuses = hasRequiredRole
        ? (test.expectAccess ?? [200])
        : (test.expectDeny ?? [401, 403]);

      const expectedList = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
      const isExpected = expectedList.includes(result.status);
      result.expectedPass = isExpected;

      const formatted = formatResult(result, isExpected);
      
      // Mark as critical blocker if 500 on critical endpoint
      if (test.critical && result.status === 500) {
        blockers++;
        formatted.icon = '🚫';
        formatted.status = 'BLOCKER (500)';
      }

      // Count pass/fail
      if (isExpected) {
        passedTests++;
      } else {
        failedTests++;
      }

      // Log result
      console.log(
        `${formatted.icon} ${test.name.padEnd(35)} | ${formatted.status.padEnd(15)} | ${formatted.duration.padStart(8)}`
      );

      // Show additional context for failures
      if (!isExpected || result.status === 500) {
        if (result.status === 500) {
          // Show server error details
          const errorMsg = result.error || result.response?.exc || 'Unknown server error';
          const errorPreview = errorMsg.substring(0, 120);
          console.log(`   ⚠️  Server Error: ${errorPreview}${errorMsg.length > 120 ? '...' : ''}`);
          if (r⏭️  Skipped:     ${skippedTests}`);
  console.log(`🚫 Blockers:    ${blockers}`);
  console.log("=".repeat(60));

  // Permission Matrix Summary
  console.log("\n📋 PERMISSION MATRIX:");
  for (const [category, results] of Object.entries(allResults)) {
    const categoryPassed = results.filter(r => !r.skipped && r.isExpected).length;
    const categoryTotal = results.filter(r => !r.skipped).length;
    const categoryStatus = categoryPassed === categoryTotal ? '✅' : 
                          results.some(r => r.code === 500) ? '🚫' : '⚠️';
    
    console.log(`  ${categoryStatus} ${TESTS[category].name}: ${categoryPassed}/${categoryTotal} passed`);
  }

  if (blockers > 0) {
    console.log("\n⚠️  CRITICAL BLOCKERS DETECTED:");
    console.log("The following endpoints returned 500 errors and block testing:");
    for (const [category, results] of Object.entries(allResults)) {
      for (const result of results) {
        if (result.code === 500 && result.icon === '🚫') {
          console.log(`  - ${result.method}`);
          console.log(`    Error: ${result.error?.substring(0, 100)}...`);
          if (result.exc_source) {
            console.log(`    Source: ${result.exc_source}`);
          }
        }
      }
    }
    console.log("\nRecommendation: Fix 500 errors before proceeding with auth verification.");
  }

  // Authorization Issues (not server errors)
  const authIssues = [];
  for (const [category, results] of Object.entries(allResults)) {
    for (const result of results) {
      if (!result.skipped && !result.isExpected && result.code !== 500) {
        authIssues.push({ category, ...result });
      }
    }
  }

  if (authIssues.length > 0) {
    console.log("\n⚠️  AUTHORIZATION ISSUES:");
    console.log("The following endpoints have unexpected access patterns:");
    for (const issue of authIssues) {
      console.log(`  ${issue.icon} ${issue.test} (${issue.method})`);
      console.log(`     Status: ${issue.status}, Should have access: ${issue.shouldHaveAccess}`);
    }
  }

  // Save to window for inspection
  window.testResults = {
    user: userData,
    results: allResults,
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      skipped: skippedTests,
      blockers: blockers,
      authIssues: authIssues.length,
    },
    sampleData: SAMPLE_DATA,
    timestamp: new Date().toISOString(),
  };

  console.log("\n✅ Results saved to window.testResults");
  console.log("   Inspect with: console.log(window.testResults)");
  console.log("   View matrix: console.table(window.testResults.results.billing
        passedTests++;
      } else {
        failedTests++;
      }

      // Log result
      console.log(
        `${formatted.icon} ${test.name.padEnd(35)} | ${formatted.status.padEnd(15)} | ${formatted.duration.padStart(8)}`
      );

      if (!result.success && result.status === 500) {
        // Show server error details
        const errorMsg = result.error || result.response?.exc || 'Unknown server error';
        const errorPreview = errorMsg.substring(0, 100);
        console.log(`   ⚠️  Server Error: ${errorPreview}...`);
      }

      if (isPermissionDenied && shouldHaveAccess) {
        console.log(`   ⚠️  Permission denied but user has required roles: ${test.requiredRoles.join(', ')}`);
      }

      categoryResults.push({
        test: test.name,
        ...formatted,
        hasRequiredRole,
        shouldHaveAccess,
        actualAccess: result.success,
        error: result.error,
      });
    }

    allResults[category] = categoryResults;
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log("\n\n");
  console.log("=" .repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total Tests:   ${totalTests}`);
  console.log(`✅ Passed:      ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
  console.log(`❌ Failed:      ${failedTests} (${((failedTests/totalTests)*100).toFixed(1)}%)`);
  console.log(`🚫 Blockers:    ${blockers}`);
  console.log("=".repeat(60));

  if (blockers > 0) {
    console.log("\n⚠️  CRITICAL BLOCKERS DETECTED:");
    console.log("The following endpoints returned 500 errors and block testing:");
    for (const [category, results] of Object.entries(allResults)) {
      for (const result of results) {
        if (result.code === 500 && result.icon === '🚫') {
          console.log(`  - ${result.method}`);
          console.log(`    Error: ${result.error?.substring(0, 100)}...`);
        }
      }
    }
    console.log("\nRecommendation: Fix 500 errors before proceeding with auth verification.");
  }

  // Save to window for inspection
  window.testResults = {
    user: userData,
    results: allResults,
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      blockers: blockers,
    },
    timestamp: new Date().toISOString(),
  };

  console.log("\n✅ Results saved to window.testResults");
  console.log("   Inspect with: console.log(window.testResults)");
  
  return window.testResults;
}

// ============================================================================
// ROLE-SPECIFIC HELPER TESTS
// ============================================================================

async function testCashierAccess() {
  console.log("🧪 Testing Cashier-specific Access...\n");
  
  const tests = [
    { name: "Get Items", method: "imogi_pos.api.cashier.get_items", args: { branch: CONFIG.branch, pos_profile: CONFIG.pos_profile }},
    { name: "List Orders", method: "imogi_pos.api.billing.list_orders_for_cashier", args: { branch: CONFIG.branch }},
    { name: "Get Pending Orders", method: "imogi_pos.api.cashier.get_pending_orders", args: { branch: CONFIG.branch }},
  ];

  for (const test of tests) {
    const result = await callAPI(test.method, test.args);
    const formatted = formatResult(result);
    console.log(`${formatted.icon} ${test.name}: ${formatted.status} (${formatted.duration})`);
  }
}

async function testKitchenAccess() {
  console.log("🧪 Testing Kitchen-specific Access...\n");
  
  const tests = [
    { name: "Get Kitchens", method: "imogi_pos.api.kot.get_kitchens_and_stations", args: { branch: CONFIG.branch }},
    { name: "Get KOTs", method: "imogi_pos.api.kot.get_kots_for_kitchen", args: { kitchen: CONFIG.kitchen }},
  ];

  for (const test of tests) {
    const result = await callAPI(test.method, test.args);
    const formatted = formatResult(result);
    console.log(`${formatted.icon} ${test.name}: ${formatted.status} (${formatted.duration})`);
  }
}

async function testWaiterAccess() {
  console.log("🧪 Testing Waiter-specific Access...\n");
  
  const tests = [
    { name: "Get Floors", method: "imogi_pos.api.layout.get_floors", args: {}},
    { name: "Get Tables", method: "imogi_pos.api.layout.get_tables", args: { branch: CONFIG.branch }},
  ];

  for (const test of tests) {
    const result = await callAPI(test.method, test.args);
    const formatted = formatResult(result);
    console.log(`${formatted.icon} ${test.name}: ${formatted.status} (${formatted.duration})`);
  }
}

// ============================================================================
// EXPORT
// ============================================================================

console.log("✅ IMOGI POS Test Suite Loaded!");
console.log("\nAvailable commands:");
console.log("  await runAllTests()        - Run complete test suite");
console.log("  await testCashierAccess()  - Test cashier endpoints only");
console.log("  await testKitchenAccess()  - Test kitchen endpoints only");
console.log("  await testWaiterAccess()   - Test waiter endpoints only");
console.log("\nResults will be saved to window.testResults\n");
