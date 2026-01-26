# Browser Console Tests

Comprehensive authorization and permission test suite untuk IMOGI POS.

## Quick Start

### 1. Setup

**Edit configuration** di `browser_console_auth_test.js`:

```javascript
const CONFIG = {
  branch: "Main",              // ⚠️ REQUIRED: Your branch name
  pos_profile: "Counter POS",  // ⚠️ REQUIRED: Your POS Profile
  kitchen: "Main Kitchen",     // Optional: for kitchen tests
  station: "Grill Station",    // Optional: for kitchen station tests
  floor: "Ground Floor",       // Optional: for table layout tests
  table: "T-001",              // Optional: for table status tests
};
```

### 2. Run Tests

**Login** ke aplikasi sebagai user yang ingin di-test, kemudian:

```javascript
// Copy-paste isi file browser_console_auth_test.js ke Browser Console

// Run all tests (semua modules)
await runAllTests()

// Or run specific module tests
await testCashierAccess()  // Cashier endpoints only
await testKitchenAccess()  // Kitchen endpoints only  
await testWaiterAccess()   // Waiter endpoints only
```

### 3. Review Results

Results tersimpan di `window.testResults`:

```javascript
// View summary
console.table(window.testResults.summary)

// View results by category
console.table(window.testResults.results.cashier)
console.table(window.testResults.results.kitchen)
console.table(window.testResults.results.billing)

// View user context
console.log(window.testResults.user)
```

---

## Test Coverage

### Modules Tested

| Module | Endpoints | Critical |
|--------|-----------|----------|
| **Auth** | 2 | Session, Role Context |
| **Cashier** | 3 | ✅ Get Items, Pending Orders, Order Details |
| **Billing** | 2 | ✅ List Orders (CRITICAL), Draft Invoice |
| **Kitchen** | 3 | Get Kitchens, KOTs, Update KOT State |
| **Waiter** | 3 | Get Floors, Tables, Update Table |
| **Public** | 1 | Branding (Guest access) |

**Total:** 14+ endpoint tests

---

## Interpreting Results

### Status Codes

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ | PASS | Expected behavior (200 OK or expected error) |
| ❌ | FAIL | Unexpected error (wrong status code) |
| 🚫 | BLOCKER (500) | Critical server error blocking tests |
| ⚠️ | UNAUTHORIZED | 401 - Session issue |
| ⚠️ | FORBIDDEN | 403 - Permission denied |

### Common Patterns

**✅ All green = Perfect**
```
✅ Get Items                  | PASS           |    89ms
✅ List Orders                | PASS           |   125ms
✅ Get Pending Orders         | PASS           |    67ms
```

**🚫 Blocker detected = Schema issue (need fix)**
```
🚫 List Orders for Cashier    | BLOCKER (500)  |   234ms
   ⚠️  Server Error: Unknown column 'discount_percent'...
```
→ **Action:** Fix backend schema mismatch

**❌ Permission denied (but should have access) = Role issue**
```
❌ Get Items                  | FORBIDDEN      |    45ms
   ⚠️  Permission denied but user has required roles: Cashier
```
→ **Action:** Check DocType permissions or decorator

**⚠️ Unauthorized = Session issue**
```
❌ Get User Context           | UNAUTHORIZED   |    23ms
```
→ **Action:** Check cookies, re-login

---

## Test Matrix by Role

### Expected Results per Role

| Endpoint | Cashier | Kitchen | Waiter | Manager | Guest |
|----------|---------|---------|--------|---------|-------|
| Get Items | ✅ | ❌ | ✅ | ✅ | ❌ |
| List Orders | ✅ | ❌ | ❌ | ✅ | ❌ |
| Get KOTs | ❌ | ✅ | ❌ | ✅ | ❌ |
| Update KOT | ❌ | ✅ | ❌ | ✅ | ❌ |
| Get Tables | ❌ | ❌ | ✅ | ✅ | ❌ |
| Update Table | ❌ | ❌ | ✅ | ✅ | ❌ |
| Get Branding | ✅ | ✅ | ✅ | ✅ | ✅ |

**Manager** = Branch Manager or System Manager (has access to all)

---

## Troubleshooting

### Test fails with "Method not found"

**Cause:** Endpoint name typo or method tidak di-expose via `@frappe.whitelist()`

**Fix:** Check method name di:
- `imogi_pos/api/cashier.py`
- `imogi_pos/api/billing.py`
- `imogi_pos/api/kot.py`
- `imogi_pos/api/layout.py`

### All tests fail with 401/UNAUTHORIZED

**Cause:** Not logged in atau session expired

**Fix:**
1. Refresh page
2. Login kembali
3. Run test again

### Test shows FORBIDDEN but user has correct role

**Cause:** 
1. DocType permission not set
2. Branch access restriction
3. Decorator `@require_permission()` too strict

**Fix:** Check Frappe Permission Manager untuk DocType terkait

### Test shows 500 SERVER ERROR

**Cause:** Backend bug (DB schema, code error, missing field)

**Fix:**
1. Check Error Log di Frappe
2. Fix backend issue (migrate, patch, code fix)
3. Rerun test

---

## Advanced Usage

### Custom Test Configuration

Add custom tests:

```javascript
const CUSTOM_TESTS = {
  myModule: {
    name: "My Custom Module",
    tests: [
      {
        name: "My Endpoint",
        method: "my_app.api.my_module.my_method",
        args: { param: "value" },
        expect: { status: 200 },
        requiredRoles: ['My Role'],
        critical: false,
      }
    ]
  }
};

// Merge with existing tests
Object.assign(TESTS, CUSTOM_TESTS);
await runAllTests();
```

### Performance Monitoring

Test suite includes timing for each request:

```javascript
// After running tests
const results = window.testResults.results;

// Find slowest endpoints
const allTests = Object.values(results).flat();
const sorted = allTests.sort((a,b) => 
  parseFloat(b.duration) - parseFloat(a.duration)
);
console.table(sorted.slice(0, 5)); // Top 5 slowest
```

### Export Results

Save results for documentation:

```javascript
// After running tests
const json = JSON.stringify(window.testResults, null, 2);
console.log(json);

// Or download
const blob = new Blob([json], {type: 'application/json'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `auth-test-results-${new Date().toISOString()}.json`;
a.click();
```

---

## CI/CD Integration (Future)

Test suite dapat di-automate dengan headless browser:

```javascript
// Puppeteer example
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Login
  await page.goto('https://your-site.com/login');
  await page.type('#username', 'test@example.com');
  await page.type('#password', 'password');
  await page.click('#login-btn');
  await page.waitForNavigation();
  
  // Inject test script
  const script = fs.readFileSync('browser_console_auth_test.js', 'utf8');
  await page.evaluate(script);
  
  // Run tests
  const results = await page.evaluate(() => runAllTests());
  
  // Assert
  if (results.summary.blockers > 0) {
    throw new Error('Critical blockers detected');
  }
  
  await browser.close();
})();
```

---

## See Also

- [AUTHORIZATION_FIX_SUMMARY.md](../AUTHORIZATION_FIX_SUMMARY.md) - Comprehensive fix documentation
- [DEBUG_AUTHORIZATION_QUICKREF.md](../DEBUG_AUTHORIZATION_QUICKREF.md) - Manual debugging guide
- [API_IMPLEMENTATION_SUMMARY.md](../API_IMPLEMENTATION_SUMMARY.md) - API endpoint reference

---

**Last Updated:** 2026-01-26
