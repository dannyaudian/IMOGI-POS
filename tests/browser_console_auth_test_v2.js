/**
 * IMOGI POS Authorization Test Suite v2
 * 
 * Simple, clean test harness based on working console pattern
 * 
 * USAGE:
 * 1. Login to application
 * 2. Paste this script in Browser Console
 * 3. Run: await runTests()
 * 4. Review results
 */

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  branch: "Main",
  pos_profile: "Counter POS",
  kitchen: "Main Kitchen",
};

// ============================================================================
// HELPERS
// ============================================================================

async function api(method, args = {}) {
  const start = performance.now();
  
  const res = await fetch(`/api/method/${method}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": window.frappe?.csrf_token || window.FRAPPE_CSRF_TOKEN || ""
    },
    body: JSON.stringify(args)
  });

  const duration = (performance.now() - start).toFixed(0);
  
  let body = null;
  try { 
    body = await res.json(); 
  } catch (e) { 
    body = { parse_error: String(e) }; 
  }

  return { 
    status: res.status, 
    ok: res.ok, 
    body,
    duration: `${duration}ms`,
    error: body?.exc || body?.exception || null,
  };
}

function icon(status, expected, hasRole) {
  if (status === 500) return "🚫";
  
  const shouldPass = hasRole ? expected.access.includes(status) : expected.deny.includes(status);
  
  if (shouldPass) {
    return status === 200 ? "✅" : 
           status === 403 ? "✅" :
           status === 404 ? "⚠️" : "✅";
  }
  
  return "❌";
}

function statusText(status, expected, hasRole) {
  const shouldPass = hasRole ? expected.access.includes(status) : expected.deny.includes(status);
  
  if (status === 500) return "SERVER ERROR";
  if (shouldPass) {
    return status === 200 ? "PASS" :
           status === 403 ? "FORBIDDEN (OK)" :
           status === 404 ? "NOT FOUND" : `OK (${status})`;
  }
  
  return status === 200 ? "UNEXPECTED ACCESS" :
         status === 403 ? "FORBIDDEN (BAD)" : 
         `FAIL (${status})`;
}

// ============================================================================
// TESTS
// ============================================================================

const TESTS = [
  // Auth & Session
  {
    category: "AUTH",
    name: "Get Logged User",
    method: "frappe.auth.get_logged_user",
    args: {},
    roles: [],
    expected: { access: [200], deny: [401] },
  },
  {
    category: "AUTH",
    name: "Get Role Context",
    method: "imogi_pos.utils.auth_helpers.get_user_role_context",
    args: {},
    roles: [],
    expected: { access: [200], deny: [401] },
  },

  // Module Select
  {
    category: "MODULE",
    name: "Get Available Modules",
    method: "imogi_pos.api.module_select.get_available_modules",
    args: {},
    roles: [],
    expected: { access: [200], deny: [401] },
  },
  {
    category: "MODULE",
    name: "Get Branch Info",
    method: "imogi_pos.api.module_select.get_user_branch_info",
    args: {},
    roles: [],
    expected: { access: [200], deny: [401] },
  },

  // Cashier
  {
    category: "CASHIER",
    name: "Get Pending Orders",
    method: "imogi_pos.api.cashier.get_pending_orders",
    argsBuilder: () => ({ branch: CONFIG.branch }),
    roles: ["Cashier", "Branch Manager", "System Manager"],
    expected: { access: [200], deny: [401, 403] },
  },
  {
    category: "ITEMS",
    name: "Get Items for Counter",
    method: "imogi_pos.api.items.get_items_for_counter",
    argsBuilder: () => ({ branch: CONFIG.branch, pos_profile: CONFIG.pos_profile }),
    roles: ["Cashier", "Waiter", "Branch Manager", "System Manager"],
    expected: { access: [200], deny: [401, 403] },
  },

  // Billing (CRITICAL - known schema issue)
  {
    category: "BILLING",
    name: "List Orders for Cashier",
    method: "imogi_pos.api.billing.list_orders_for_cashier",
    argsBuilder: () => ({ branch: CONFIG.branch, pos_profile: CONFIG.pos_profile }),
    roles: ["Cashier", "Branch Manager", "System Manager"],
    expected: { access: [200], deny: [401, 403] },
    critical: true,
  },

  // Kitchen
  {
    category: "KITCHEN",
    name: "Get Kitchens/Stations",
    method: "imogi_pos.api.kot.get_kitchens_and_stations",
    argsBuilder: () => ({ branch: CONFIG.branch }),
    roles: ["Kitchen Staff", "Branch Manager", "System Manager"],
    expected: { access: [200], deny: [401, 403] },
  },
  {
    category: "KITCHEN",
    name: "Get KOTs",
    method: "imogi_pos.api.kot.get_kots_for_kitchen",
    argsBuilder: () => ({ kitchen: CONFIG.kitchen, branch: CONFIG.branch }),
    roles: ["Kitchen Staff", "Branch Manager", "System Manager"],
    expected: { access: [200], deny: [401, 403] },
  },

  // Waiter/Tables
  {
    category: "LAYOUT",
    name: "Get Floors",
    method: "imogi_pos.api.layout.get_floors",
    args: {},
    roles: ["Waiter", "Branch Manager", "System Manager"],
    expected: { access: [200], deny: [401, 403] },
  },
  {
    category: "WAITER",
    name: "Get Tables",
    method: "imogi_pos.api.layout.get_tables",
    argsBuilder: () => ({ branch: CONFIG.branch }),
    roles: ["Waiter", "Branch Manager", "System Manager"],
    expected: { access: [200], deny: [401, 403] },
  },

  // Public
  {
    category: "PUBLIC",
    name: "Get Branding",
    method: "imogi_pos.api.public.get_branding",
    args: {},
    roles: [],
    expected: { access: [200], deny: [] },
  },
];

// ============================================================================
// PAGE ROUTE TESTS
// ============================================================================

const PAGE_ROUTES = [
  // Entry Points
  { url: "/shared/login", name: "Login Page (Standalone WWW apps only)", roles: [] },
  { url: "/login", name: "Frappe Built-in Login (Desk Pages)", roles: [] },
  { url: "/app/imogi-module-select", name: "Module Select", roles: [] },
  
  // POS Applications (correct routes from hooks.py)
  { url: "/counter/pos", name: "Counter POS", roles: ["Cashier", "Branch Manager", "System Manager"] },
  { url: "/restaurant/kitchen", name: "Kitchen Display", roles: ["Kitchen Staff", "Branch Manager", "System Manager"] },
  { url: "/restaurant/waiter", name: "Waiter App", roles: ["Waiter", "Branch Manager", "System Manager"] },
  { url: "/restaurant/tables", name: "Table Layout", roles: ["Waiter", "Branch Manager", "System Manager"] },
  
  // Tools & Editors (underscores, not hyphens!)
  { url: "/customer_display_editor", name: "Customer Display Editor", roles: ["Branch Manager", "System Manager"] },
  { url: "/table_layout_editor", name: "Table Layout Editor", roles: ["Branch Manager", "System Manager"] },
];

async function checkPage(url) {
  const start = performance.now();
  try {
    const res = await fetch(url, { 
      method: "GET",
      credentials: "include",
      redirect: "manual"
    });
    const duration = (performance.now() - start).toFixed(0);
    
    return {
      url,
      status: res.status,
      ok: res.ok,
      redirected: res.redirected,
      location: res.headers.get("location"),
      duration: `${duration}ms`,
    };
  } catch (e) {
    return {
      url,
      status: 0,
      ok: false,
      error: String(e),
      duration: "0ms",
    };
  }
}

// ============================================================================
// RUNNER
// ============================================================================

async function runTests() {
  console.log("🧪 IMOGI POS Authorization Tests v2\n");
  console.log("=".repeat(70));
  
  // Get user context
  const userCtx = await api("imogi_pos.utils.auth_helpers.get_user_role_context");
  
  if (!userCtx.ok) {
    console.error("❌ Failed to get user context");
    return;
  }
  
  const user = userCtx.body?.message || {};
  const userRoles = user.roles || [];
  
  console.log(`👤 User: ${user.user}`);
  console.log(`🎭 Roles: ${userRoles.slice(0, 10).join(", ")}... (${userRoles.length} total)`);
  console.log(`💼 Cashier: ${user.is_cashier ? "Yes" : "No"}`);
  console.log(`👨‍🍳 Kitchen: ${user.is_kitchen_staff ? "Yes" : "No"}`);
  console.log(`🍽️ Waiter: ${user.is_waiter ? "Yes" : "No"}`);
  console.log(`🏢 Manager: ${user.is_branch_manager ? "Yes" : "No"}`);
  console.log("=".repeat(70));
  
  // Run tests
  const results = [];
  let pass = 0, fail = 0, blockers = 0;
  
  for (const test of TESTS) {
    const args = test.argsBuilder ? test.argsBuilder() : (test.args || {});
    const result = await api(test.method, args);
    
    const hasRole = test.roles.length === 0 || 
                   test.roles.some(r => userRoles.includes(r)) ||
                   userRoles.includes("System Manager");
    
    const ic = icon(result.status, test.expected, hasRole);
    const st = statusText(result.status, test.expected, hasRole);
    
    const isPass = ic === "✅" || ic === "⚠️";
    if (isPass) pass++; else fail++;
    if (ic === "🚫") blockers++;
    
    console.log(
      `${ic} ${test.category.padEnd(8)} | ${test.name.padEnd(25)} | ${st.padEnd(18)} | ${result.duration.padStart(6)}`
    );
    
    if (result.status === 500) {
      const errPreview = (result.error || "Unknown").substring(0, 80);
      console.log(`   💥 ${errPreview}...`);
    } else if (ic === "❌") {
      console.log(`   ⚠️  Expected: ${hasRole ? test.expected.access : test.expected.deny}, Got: ${result.status}`);
    }
    
    results.push({
      ...test,
      result: {
        status: result.status,
        ok: result.ok,
        duration: result.duration,
        hasRole,
        icon: ic,
        statusText: st,
        error: result.error,
      },
    });
  }
  
  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total:    ${TESTS.length}`);
  console.log(`✅ Pass:   ${pass} (${((pass/TESTS.length)*100).toFixed(0)}%)`);
  console.log(`❌ Fail:   ${fail}`);
  console.log(`🚫 Block:  ${blockers}`);
  
  // Blockers
  if (blockers > 0) {
    console.log("\n⚠️  BLOCKERS (500 errors):");
    results.filter(r => r.result.icon === "🚫").forEach(r => {
      console.log(`  - ${r.method}`);
    });
  }
  
  // Auth issues
  const authIssues = results.filter(r => r.result.icon === "❌" && r.result.status !== 500);
  if (authIssues.length > 0) {
    console.log("\n⚠️  AUTHORIZATION ISSUES:");
    authIssues.forEach(r => {
      console.log(`  - ${r.name}: ${r.result.statusText}`);
    });
  }
  
  console.log("=".repeat(70));
  
  // Test Page Routes
  console.log("\n🌐 PAGE ROUTE TESTS");
  console.log("=".repeat(70));
  
  const pageResults = [];
  for (const page of PAGE_ROUTES) {
    const result = await checkPage(page.url);
    const hasRole = page.roles.length === 0 || 
                   page.roles.some(r => userRoles.includes(r)) ||
                   userRoles.includes("System Manager");
    
    const ic = result.status === 200 ? "✅" : 
               result.status === 404 ? "🔍" :
               result.status === 500 ? "🚫" :
               result.status === 302 || result.status === 301 ? "↪️" : "⚠️";
    
    const statusText = result.status === 200 ? "LOADED" :
                      result.status === 404 ? "NOT FOUND" :
                      result.status === 500 ? "SERVER ERROR" :
                      result.status === 302 ? `REDIRECT → ${result.location}` :
                      result.status === 0 ? "FETCH ERROR" : `HTTP ${result.status}`;
    
    console.log(
      `${ic} ${page.name.padEnd(25)} | ${statusText.padEnd(35)} | ${result.duration.padStart(6)}`
    );
    
    pageResults.push({
      ...page,
      result,
      hasRole,
    });
  }
  
  console.log("=".repeat(70));
  
  // Save results
  window.testResults = {
    user,
    apiTests: results,
    pageTests: pageResults,
    summary: { 
      totalAPIs: TESTS.length, 
      pass, 
      fail,
      blockers,
      totalPages: PAGE_ROUTES.length,
      pagesOK: pageResults.filter(p => p.result.status === 200).length,
      pages404: pageResults.filter(p => p.result.status === 404).length,
      pages500: pageResults.filter(p => p.result.status === 500).length,
    },
    timestamp: new Date().toISOString(),
  };
  
  console.log("\n✅ Results saved to window.testResults");
  console.log("   API Tests:  window.testResults.apiTests");
  console.log("   Page Tests: window.testResults.pageTests");
  console.log("   Summary:    window.testResults.summary");
  
  return window.testResults;
}

// ============================================================================
// QUICK TESTS
// ============================================================================

async function quickTest() {
  console.log("⚡ Quick API Test\n");
  
  const tests = [
    { name: "Session", method: "frappe.auth.get_logged_user" },
    { name: "Roles", method: "imogi_pos.utils.auth_helpers.get_user_role_context" },
    { name: "Modules", method: "imogi_pos.api.module_select.get_available_modules" },
    { name: "Branch", method: "imogi_pos.api.module_select.get_user_branch_info" },
  ];
  
  for (const t of tests) {
    const r = await api(t.method);
    const ic = r.ok ? "✅" : "❌";
    console.log(`${ic} ${t.name.padEnd(10)}: ${r.status} (${r.duration})`);
  }
}

// ============================================================================
// AUTO-LOAD
// ============================================================================

console.log("✅ IMOGI POS Test Suite v2 Loaded\n");
console.log("Commands:");
console.log("  await runTests()     - Full test suite (APIs + Pages)");
console.log("  await quickTest()    - Quick API check");
console.log("\nℹ️  Correct page routes:");
console.log("  /counter/pos, /restaurant/kitchen, /restaurant/waiter");
console.log("  /customer_display_editor, /table_layout_editor");
console.log("");
