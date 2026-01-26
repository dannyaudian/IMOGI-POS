# Frappe Assistant Core - Prompt Templates untuk IMOGI POS

## 🔗 MCP Endpoint
```
https://tigaperkasateknik.j.frappe.cloud/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp
```

---

## 📋 Template 1: Cek Flow React ke API ERPNext

### Prompt untuk Claude/ChatGPT:

```
Saya punya custom Frappe app "imogi_pos" yang menggunakan React untuk frontend. 
Tolong analyze flow dari React component ke ERPNext API dengan detail berikut:

## 1. Frontend React Flow

### Counter POS App (Cashier Console)
Cari implementasi API calls untuk:
- Load item catalog
- Create sales invoice
- Process payment
- Get order history

Path yang perlu dicek:
- File: src/apps/counter-pos/App.jsx
- Shared API: src/shared/api/imogi-api.js
- API hooks yang digunakan (contoh: useItems, useCreateOrder, useSubmitOrder)

### Kitchen Display App
Cari implementasi API calls untuk:
- Load KOT (Kitchen Order Tickets)
- Update KOT status
- Kitchen station filtering

Path yang perlu dicek:
- File: src/apps/kitchen/App.jsx
- KOT API hooks

### Waiter App
Cari implementasi API calls untuk:
- Load table list
- Create order
- Update table status
- Send to kitchen

Path yang perlu dicek:
- File: src/apps/waiter/App.jsx
- Table management hooks

## 2. Backend API Endpoints

Untuk setiap frontend flow di atas, identify:

### API Endpoints di Frappe
Cari di DocType "imogi_pos":
- Path: imogi_pos/api/
- Files: billing.py, kitchen.py, table.py, public.py

List semua whitelisted methods dengan format:
```
@frappe.whitelist()
def method_name(params):
```

### Mapping Frontend to Backend
Buat table mapping:
| React Hook/Function | API Endpoint | HTTP Method | Parameters | Return Data |
|---------------------|--------------|-------------|------------|-------------|
| useItems() | imogi_pos.api.xxx | GET | branch, pos_profile | {items: [...]} |
| ... | ... | ... | ... | ... |

## 3. Data Flow Analysis

Untuk workflow utama "Create Sales Invoice":
1. Trace dari button click di React
2. API call dengan parameters apa
3. Backend processing di ERPNext
4. Database operations (Sales Invoice creation)
5. Return response ke frontend
6. UI update

## 4. Error Handling

Check:
- Try-catch blocks di frontend
- Error responses dari backend
- Validation di frontend vs backend
- User feedback untuk errors

## 5. Authentication & Permissions

Check:
- Cookie-based auth implementation
- Role-based access di API endpoints
- CSRF token handling
- Permission checks di backend

## 6. Performance & Optimization

Identify:
- API calls yang bisa di-batch
- Unnecessary re-renders
- Missing loading states
- Data caching strategies

## Output yang Diharapkan:

1. **Flow Diagram** (text-based):
   ```
   React Component → Hook → API Call → Backend Method → DocType → Database
   ```

2. **API Endpoint List**: Semua endpoints dengan dokumentasi
3. **Issues Found**: Potential bugs atau improvement points
4. **Recommendations**: Best practices yang bisa diterapkan

Silakan mulai dengan analyze Counter POS flow terlebih dahulu, lalu Kitchen dan Waiter.
```

---

## 📋 Template 2: Audit API Endpoints

```
Audit semua API endpoints di custom app "imogi_pos":

## Scope:
1. List semua @frappe.whitelist() methods di folder:
   - imogi_pos/api/
   - imogi_pos/billing/
   - imogi_pos/kitchen/
   - imogi_pos/table/
   - imogi_pos/utils/

2. Untuk setiap endpoint, check:
   - ✅ Permission checks (frappe.has_permission)
   - ✅ Input validation
   - ✅ Error handling (try-except)
   - ✅ Return data structure
   - ✅ SQL injection prevention
   - ✅ Role-based access

3. Security Issues:
   - Methods yang tidak ada permission check
   - Raw SQL queries tanpa sanitization
   - Missing input validation
   - Exposed sensitive data

4. Performance Issues:
   - N+1 query problems
   - Missing indexes
   - Large data returns tanpa pagination
   - Inefficient filters

Output format table:
| Method Path | Security Score | Performance Score | Issues | Recommendations |
|-------------|----------------|-------------------|--------|-----------------|
```

---

## 📋 Template 3: Check DocType Structure

```
Analyze custom DocTypes untuk app "imogi_pos":

## 1. List All Custom DocTypes:
Cari di folder imogi_pos/imogi_pos/doctype/

## 2. Untuk setiap DocType, check:
- Field types dan naming
- Mandatory fields
- Default values
- Validations
- Relationships (Link fields)
- Child tables
- Server scripts / hooks
- Permission roles

## 3. Focus pada DocTypes utama:
- IMOGI POS Profile
- Kitchen Order Ticket
- Customer Display Profile
- Table Display Profile
- Promo Code

## 4. Check consistency:
- Naming conventions
- Field standardization across DocTypes
- Missing indexes untuk search fields
- Audit trail fields (creation, modified)

## 5. Recommendations:
- Fields yang perlu ditambah
- Validations yang kurang
- Performance improvements
```

---

## 📋 Template 4: Trace Specific Workflow

### Counter POS - Create Invoice Flow

```
Trace step-by-step workflow untuk "Create Sales Invoice" di Counter POS:

## Starting Point:
- Component: CounterPOS di src/apps/counter-pos/
- User action: Click "Pay" button

## Trace Points:
1. **Frontend State Management**
   - Cart items state
   - Selected customer
   - Payment method
   - Amount calculations

2. **API Call Preparation**
   - Hook/function yang dipanggil
   - Parameters yang dikirim
   - Validation sebelum call

3. **Backend API Method**
   - File dan function name
   - Permission checks
   - Input processing
   - Business logic

4. **ERPNext Document Creation**
   - Sales Invoice document
   - Sales Invoice Item (child table)
   - Payment Entry
   - Stock ledger updates

5. **Response Handling**
   - Success response structure
   - Error response structure
   - Frontend state updates
   - UI feedback (toast, redirect)

6. **Side Effects**
   - KOT creation (if restaurant mode)
   - Stock reduction
   - Loyalty points
   - Print triggers

## Questions to Answer:
- Apakah ada race conditions?
- Bagaimana handle payment failures?
- Rollback strategy jika error?
- Audit trail completeness?

Show code snippets untuk setiap step.
```

---

## 📋 Template 5: React Component Audit

```
Audit semua React components di IMOGI POS:

## 1. Shared Components (src/shared/components/)
List semua reusable components dan usage count

## 2. App-Specific Components
- Counter POS components
- Kitchen components  
- Waiter components

## 3. Code Quality Check:
- Prop types atau TypeScript usage
- Component composition
- State management patterns
- Side effects (useEffect) proper cleanup
- Event handler optimization
- Memoization (useMemo, useCallback)

## 4. Performance:
- Unnecessary re-renders
- Large components yang perlu split
- Heavy computations tanpa useMemo
- Missing React.memo untuk child components

## 5. Accessibility:
- Keyboard navigation
- ARIA labels
- Focus management
- Screen reader support

## 6. Best Practices:
- Component size (lines of code)
- Single responsibility
- Reusability score
- Documentation

Output: Component quality scorecard
```

---

## 📋 Template 6: Database Query Analysis

```
Analyze database queries untuk performance optimization:

## Check di ERPNext:
1. Custom queries di Python files (frappe.db.sql)
2. ORM queries (frappe.get_all, frappe.get_list)
3. DocType get_list overrides

## Focus Areas:
- Queries dalam loops (N+1 problem)
- Full table scans
- Missing filters
- Large LIMIT values
- JOIN operations
- Subqueries

## Specific Workflows:
1. **Load Items for POS Catalog**
   - Current query
   - Filters applied
   - Fields fetched
   - Join operations
   - Optimization suggestions

2. **Get Order History**
   - Date range filtering
   - Pagination implementation
   - Sorting performance
   - Index usage

3. **Kitchen Order Board**
   - Real-time updates strategy
   - Polling vs WebSocket
   - Query frequency
   - Data volume

## Output:
- Slow query report
- Missing index recommendations  
- Query optimization suggestions
- Caching opportunities
```

---

## 📋 Template 7: Integration Points Check

```
Check semua integration points antara IMOGI POS dan ERPNext core:

## 1. ERPNext DocTypes yang Digunakan:
- Sales Invoice
- Sales Invoice Item
- Payment Entry
- Item
- Customer
- POS Profile
- POS Invoice Merge Log
- Batch
- Serial No
- Stock Ledger Entry

## 2. Untuk setiap integration:
- Custom fields yang ditambahkan
- Overrides/monkey patches (jika ada)
- Event hooks (before_save, after_submit, dll)
- API dependencies
- Version compatibility (ERPNext v15)

## 3. Custom Fields Audit:
List semua custom fields yang ditambahkan ke ERPNext core DocTypes:
- Field name
- Field type
- Parent DocType
- Purpose
- Used in queries?

## 4. Fixtures:
Check fixtures yang loaded:
- Custom Fields
- Property Setters  
- Print Formats
- Workflows
- Dashboards

## 5. Compatibility Risks:
- ERPNext upgrade impact
- Deprecated API usage
- Core behavior assumptions
```

---

## 📋 Template 8: Real-time Updates Check

```
Analyze real-time update implementation di IMOGI POS:

## 1. WebSocket/Realtime Events:
Check di hooks.py dan code untuk:
- frappe.publish_realtime usage
- Event names
- Room/channel setup
- Client subscriptions

## 2. Frontend Realtime Listeners:
Di React apps, check:
- Socket connection setup
- Event listeners
- State updates on events
- Reconnection handling

## 3. Use Cases:
1. **Kitchen Display Updates**
   - KOT creation → notify kitchen
   - Status change → update UI
   - Event flow

2. **Table Status Updates**  
   - Waiter marks table → notify cashier
   - Real-time table board sync

3. **Order Status**
   - Invoice creation → update order list
   - Payment complete → notify waiter

## 4. Performance & Reliability:
- Event frequency
- Message size
- Connection stability
- Fallback strategies
- Memory leaks check

## 5. Issues to Find:
- Missing unsubscribe
- Duplicate subscriptions
- Race conditions
- Event storms
```

---

## 🎯 Quick Commands untuk Frappe Assistant

### Cek Specific File:
```
Show me the content of file: imogi_pos/api/billing.py
```

### Cek DocType:
```
Get DocType definition for "Kitchen Order Ticket" including all fields, permissions, and server scripts
```

### Find API Usage:
```
Find all places where API method "imogi_pos.api.billing.create_pos_invoice" is called
```

### Check Custom Fields:
```
List all custom fields added to Sales Invoice DocType by imogi_pos app
```

### Query Database:
```
Run query: SELECT name, status, posting_date FROM `tabSales Invoice` WHERE is_pos = 1 ORDER BY creation DESC LIMIT 10
```

---

## 💡 Tips Menggunakan Frappe Assistant

1. **Be Specific**: Sebutkan file path atau DocType name yang jelas
2. **Ask for Code**: Minta show code snippets, jangan hanya summary
3. **Follow-up**: Gunakan hasil analisis untuk ask deeper questions
4. **Security First**: Selalu minta check security dan permission
5. **Performance**: Tanyakan optimization opportunities
6. **Documentation**: Minta generate documentation dari code

---

## 🚀 Workflow Recommendations

### Sesi Audit Lengkap:
1. Start dengan Template 1 (Flow Analysis) → understand big picture
2. Template 2 (API Audit) → security check
3. Template 4 (Workflow Trace) → deep dive critical flows
4. Template 6 (Query Analysis) → performance optimization
5. Template 8 (Realtime) → check real-time features

### Quick Debug Session:
1. Template 4 untuk specific workflow yang bermasalah
2. Follow-up dengan code review untuk identified issues
3. Ask for fix recommendations

### Documentation Session:
```
Generate comprehensive API documentation for all endpoints in imogi_pos/api/ 
including:
- Method signatures
- Parameters with types
- Return values
- Example requests/responses
- Permission requirements
```
