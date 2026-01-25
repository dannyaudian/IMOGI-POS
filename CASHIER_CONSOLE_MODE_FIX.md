# Cashier Console - Counter & Table/Waiter Mode Fix

## 🎯 Tujuan
Memperbaiki implementasi Cashier Console agar berfungsi dengan benar untuk mode **Counter** dan **Table/Waiter**.

## ❌ Masalah yang Ditemukan

Sebelum perbaikan, Cashier Console **TIDAK menggunakan** setting `posMode` sama sekali:

1. **Order creation hardcoded**: Selalu membuat order sebagai "Counter" meskipun profile setting adalah "Table"
2. **Tidak ada filter order**: Menampilkan semua order tanpa memfilter berdasarkan mode
3. **UI tidak ada indikator**: User tidak tahu sedang di mode apa
4. **Table information**: Tidak menampilkan nama table dengan benar

## ✅ Perbaikan yang Dilakukan

### 1. **Frontend - cashier_console.js**

#### A. Load Orders dengan Filter Mode
```javascript
// Sebelum:
frappe.call({
    method: 'imogi_pos.api.billing.list_orders_for_cashier',
    args: {
        pos_profile: this.settings.posProfile,
        branch: this.settings.branch,
        workflow_state: this.state.filterStatus
    },

// Sesudah:
// Determine order_type filter based on posMode
let orderTypeFilter = null;
if (this.settings.posMode === 'Counter') {
    orderTypeFilter = 'Counter';
} else if (this.settings.posMode === 'Table') {
    orderTypeFilter = 'Dine In';
}

frappe.call({
    method: 'imogi_pos.api.billing.list_orders_for_cashier',
    args: {
        pos_profile: this.settings.posProfile,
        branch: this.settings.branch,
        workflow_state: this.state.filterStatus,
        order_type: orderTypeFilter  // ✅ Filter berdasarkan mode
    },
```

**Hasil**:
- ✅ Mode **Counter**: Hanya tampil order Counter
- ✅ Mode **Table**: Hanya tampil order Dine In (dengan table)

#### B. Create New Order Berdasarkan Mode
```javascript
// Sebelum:
createNewOrder: function() {
    frappe.call({
        method: 'imogi_pos.api.orders.create_staff_order',
        args: {
            order_type: 'Counter'  // ❌ Hardcoded!
        },

// Sesudah:
createNewOrder: function() {
    // Determine order_type based on posMode
    let orderType = 'Counter';
    if (this.settings.posMode === 'Table') {
        orderType = 'Dine In';
    }
    
    frappe.call({
        method: 'imogi_pos.api.orders.create_staff_order',
        args: {
            order_type: orderType  // ✅ Sesuai mode!
        },
```

**Hasil**:
- ✅ Mode **Counter**: Buat order Counter
- ✅ Mode **Table**: Buat order Dine In

#### C. UI Mode Indicator
```javascript
// Tambahkan visual indicator untuk mode
renderUI: function() {
    const modeLabel = this.settings.posMode === 'Table' ? 'Table/Waiter' : 'Counter';
    const modeIcon = this.settings.posMode === 'Table' ? 'fa-utensils' : 'fa-cash-register';
    
    this.container.innerHTML = `
        <div class="cashier-console-layout" data-pos-mode="${this.settings.posMode}">
            <div class="mode-indicator">
                <i class="fa ${modeIcon}"></i>
                <span>${modeLabel} Mode</span>
            </div>
```

**Hasil**:
- ✅ User dapat melihat mode apa yang sedang aktif
- ✅ Icon berbeda untuk Counter (cash register) vs Table (utensils)

### 2. **Backend - billing.py**

#### A. Tambah Parameter `order_type` di API
```python
# Sebelum:
def list_orders_for_cashier(pos_profile=None, branch=None, workflow_state=None, floor=None):

# Sesudah:
def list_orders_for_cashier(pos_profile=None, branch=None, workflow_state=None, floor=None, order_type=None):
    """
    Args:
        order_type (str, optional): Order type filter (Counter/Dine In/Take Away)
    """
    
    filters = {"branch": branch, "workflow_state": ["in", workflow_state]}
    if floor:
        filters["floor"] = floor
    if order_type:
        filters["order_type"] = order_type  # ✅ Filter order type
```

**Hasil**:
- ✅ API support filter berdasarkan order_type
- ✅ Counter mode hanya dapat order Counter
- ✅ Table mode hanya dapat order Dine In

#### B. Tambahkan `table_name` ke Response
```python
# Tambahkan fetch table name
for order in orders:
    order["customer_name"] = (...)
    
    # Get table name if order has a table
    if order.get("table"):
        order["table_name"] = frappe.db.get_value("Table", order["table"], "table_name") or order["table"]
    else:
        order["table_name"] = None
```

**Hasil**:
- ✅ Order list menampilkan nama table yang user-friendly
- ✅ Tidak ada error jika table tidak ada

## 📊 Ringkasan Perubahan

| Aspek | Sebelum | Sesudah |
|-------|---------|---------|
| **Load Orders (JS)** | Semua order tanpa filter | Filter berdasarkan Counter/Table mode |
| **Load Orders (React)** | API method salah | API method benar + order_type filter |
| **Create Order** | Selalu Counter | Counter/Dine In sesuai mode |
| **UI Indicator (JS)** | Tidak ada | Ada badge mode di sidebar |
| **UI Indicator (React)** | Tidak ada | Ada mode banner dengan icon |
| **Table Name** | Field `table` (ID) | Field `table_name` (human readable) |
| **Order Type Filter** | ❌ Tidak ada | ✅ Ada di API |
| **Initial State** | Tidak kirim mode | ✅ Kirim pos_mode ke React |
| **Auto Refresh** | Manual only | ✅ Auto refresh 30 detik (React) |

## 🧪 Testing Checklist

### Mode Counter (Vanilla JS)
- [ ] Login dengan POS Profile mode Counter
- [ ] Buka `/app/cashier-console` (vanilla JS version)
- [ ] Verify: Mode indicator menampilkan "Counter Mode" dengan icon cash register
- [ ] Verify: Order list hanya menampilkan order Counter
- [ ] Create new order → Verify order_type = "Counter"
- [ ] Verify: Tidak ada order Dine In yang muncul

### Mode Counter (React)
- [ ] Login dengan POS Profile mode Counter
- [ ] Buka `/counter/pos` (React version)
- [ ] Verify: Header menampilkan "Counter Mode"
- [ ] Verify: Mode banner dengan icon 💵
- [ ] Verify: "Showing Counter orders only"
- [ ] Verify: Order list hanya Counter orders
- [ ] Verify: Auto refresh bekerja (30 detik)

### Mode Table/Waiter (Vanilla JS)
- [ ] Login dengan POS Profile mode Table
- [ ] Buka `/app/cashier-console`
- [ ] Verify: Mode indicator menampilkan "Table/Waiter Mode" dengan icon utensils
- [ ] Verify: Order list hanya menampilkan order Dine In
- [ ] Verify: Order menampilkan "Table: [nama_table]"
- [ ] Create new order → Verify order_type = "Dine In"
- [ ] Verify: Tidak ada order Counter yang muncul

### Mode Table/Waiter (React)
- [ ] Login dengan POS Profile mode Table
- [ ] Buka `/counter/pos` (React version)
- [ ] Verify: Header menampilkan "Table/Waiter Mode"
- [ ] Verify: Mode banner dengan icon 🍴
- [ ] Verify: "Showing Dine In orders only"
- [ ] Verify: Order list hanya Dine In orders
- [ ] Verify: Table name ditampilkan untuk orders
- [ ] Verify: Auto refresh bekerja (30 detik)

## 🔍 File yang Diubah

### 1. **Vanilla JS Implementation**

1. **`imogi_pos/public/js/cashier_console.js`**
   - Line ~320: Filter order_type di loadOrders()
   - Line ~1300: Order type dinamis di createNewOrder()
   - Line ~458: UI mode indicator di renderUI()

2. **`imogi_pos/api/billing.py`**
   - Line ~1108: Parameter order_type di list_orders_for_cashier()
   - Line ~1153: Filter order_type di query
   - Line ~1180: Fetch table_name untuk display

### 2. **React Implementation**

3. **`imogi_pos/www/counter/pos/index.py`**
   - Line ~10: Fetch POS Profile untuk current user
   - Line ~17: Extract `imogi_mode` dan `imogi_branch` dari profile
   - Line ~27: Pass `pos_mode` dan `branch` ke React initial state

4. **`src/shared/api/imogi-api.js`**
   - Line ~49: Update `useOrderHistory` hook dengan parameter `orderType`
   - Line ~50: Filter orders berdasarkan order_type
   - Line ~56: Auto refresh setiap 30 detik

5. **`src/apps/cashier-console/App.jsx`**
   - Line ~10: Extract `pos_mode` dari initialState
   - Line ~13: Determine `orderType` berdasarkan mode
   - Line ~15: Pass `orderType` ke useOrderHistory hook
   - Line ~27: UI mode indicator dengan icon dan label
   - Line ~35: Display order type filter info

## ✨ Benefit

1. **Separation of Concerns**: Counter dan Table mode sekarang benar-benar terpisah
2. **User Experience**: Cashier tahu mode apa yang aktif
3. **Data Integrity**: Order dibuat dengan tipe yang benar
4. **Performance**: Filter di database level, tidak fetch semua order
5. **Maintainability**: Code lebih jelas dengan logic mode yang explicit

## 📝 Notes

- Mode "Table" menggunakan order_type "Dine In" (bukan "Table")
- Filter berlaku di level database untuk performance
- Mode indicator update otomatis saat profile berubah
- Backward compatible: jika order_type tidak dikirim, API tetap kerja

---

## 🎨 React Implementation (Bonus)

### Masalah React App
React app (`/counter/pos`) juga memiliki masalah yang sama:
- ❌ Tidak menerima `pos_mode` dari server
- ❌ Menggunakan API method yang salah (`list_counter_order_history`)
- ❌ Tidak ada filter order_type
- ❌ Tidak ada mode indicator

### Perbaikan React

#### 1. Server-Side Context (index.py)
```python
# Fetch POS Profile dan extract mode
pos_profile = frappe.db.get_value(
    "POS Profile User", {"user": frappe.session.user}, "parent"
)

if pos_profile:
    profile_details = frappe.get_cached_doc("POS Profile", pos_profile)
    pos_mode = profile_details.get("imogi_mode") or "Counter"
    branch = profile_details.get("imogi_branch")

# Pass to React
add_react_context(context, 'cashier-console', {
    'pos_mode': pos_mode,    # ✅ NEW!
    'branch': branch
})
```

#### 2. API Hook Update (imogi-api.js)
```javascript
export function useOrderHistory(branch, posProfile, orderType = null) {
  const params = { branch, pos_profile: posProfile }
  if (orderType) {
    params.order_type = orderType  // ✅ Filter by type
  }
  
  return useFrappeGetCall(
    'imogi_pos.api.billing.list_orders_for_cashier',  // ✅ Correct API
    params,
    `order-history-${branch}-${posProfile}-${orderType || 'all'}`,
    {
      refreshInterval: 30000  // ✅ Auto refresh
    }
  )
}
```

#### 3. React Component (App.jsx)
```jsx
const posMode = initialState.pos_mode || 'Counter'
const orderType = posMode === 'Table' ? 'Dine In' : 'Counter'

// Use filtered API
const { data: orders } = useOrderHistory(branch, posProfile, orderType)

// Mode indicator UI
<div className="mode-indicator">
  <span>{posMode === 'Table' ? '🍴' : '💵'}</span>
  <strong>{posMode === 'Table' ? 'Table/Waiter Mode' : 'Counter Mode'}</strong>
  <span>Showing {orderType} orders only</span>
</div>
```

**Hasil React**:
- ✅ Mode detection dari POS Profile
- ✅ Filtered orders berdasarkan mode
- ✅ Visual mode indicator
- ✅ Auto refresh setiap 30 detik

---

**Status**: ✅ Selesai untuk Vanilla JS & React  
**Date**: 2026-01-25
