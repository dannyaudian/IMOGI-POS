# Phase 1 Testing Guide

## 🧪 Backend API Testing

### Prerequisites
1. Access to Frappe desk
2. Admin or System Manager role
3. Sample data: Kitchen, Station, Items, Tables

---

### Test 1: Get Active KOTs
**Endpoint:** `imogi_pos.api.kot.get_active_kots`

**Test via API Browser:**
```python
frappe.call({
    method: 'imogi_pos.api.kot.get_active_kots',
    args: {
        kitchen: 'Main Kitchen'
    },
    callback: function(r) {
        console.log(r.message)
    }
})
```

**Expected Result:**
```json
[
  {
    "name": "KOT-2026-00001",
    "ticket_number": 1,
    "workflow_state": "Queued",
    "kitchen": "Main Kitchen",
    "station": "Grill Station",
    "table_name": "TABLE-01",
    "items": [
      {
        "item_code": "NASI-GORENG",
        "item_name": "Nasi Goreng Special",
        "qty": 2,
        "notes": "Extra pedas"
      }
    ]
  }
]
```

**Test Cases:**
- ✅ Returns only active KOTs (not Served/Cancelled)
- ✅ Filters by kitchen
- ✅ Filters by station when provided
- ✅ Includes items array
- ✅ Ordered by creation date

---

### Test 2: Update KOT State
**Endpoint:** `imogi_pos.api.kot.update_kot_state`

**Test Queued → In Progress:**
```javascript
frappe.call({
    method: 'imogi_pos.api.kot.update_kot_state',
    args: {
        kot_name: 'KOT-2026-00001',
        new_state: 'In Progress'
    },
    callback: function(r) {
        console.log(r.message)
    }
})
```

**Expected Result:**
```json
{
  "name": "KOT-2026-00001",
  "workflow_state": "In Progress",
  "old_state": "Queued",
  "new_state": "In Progress"
}
```

**Test State Transitions:**
1. ✅ Queued → In Progress (valid)
2. ✅ In Progress → Ready (valid)
3. ✅ Ready → Served (valid)
4. ✅ In Progress → Queued (valid - return to queue)
5. ✅ Ready → In Progress (valid - return to kitchen)
6. ❌ Queued → Served (invalid - should fail)
7. ❌ Served → In Progress (invalid - should fail)

**Test Cancellation:**
```javascript
frappe.call({
    method: 'imogi_pos.api.kot.update_kot_state',
    args: {
        kot_name: 'KOT-2026-00001',
        new_state: 'Cancelled',
        reason: 'Customer changed order'
    }
})
```

**Test Cases:**
- ✅ Valid transitions succeed
- ✅ Invalid transitions throw error
- ✅ Cancellation requires reason
- ✅ Realtime event published
- ✅ Modified timestamp updated

---

### Test 3: Create Table Order
**Endpoint:** `imogi_pos.api.orders.create_table_order`

**Test via API Browser:**
```javascript
frappe.call({
    method: 'imogi_pos.api.orders.create_table_order',
    args: {
        branch: 'Jakarta Pusat',
        customer: 'Walk-in Customer',
        waiter: 'waiter@imogi.com',
        table: 'TABLE-01',
        mode: 'Dine-in',
        items: [
            {
                item_code: 'NASI-GORENG',
                item_name: 'Nasi Goreng Special',
                qty: 2,
                rate: 35000,
                uom: 'Nos',
                notes: 'Extra pedas',
                station: 'Main Kitchen'
            },
            {
                item_code: 'ES-TEH',
                item_name: 'Es Teh Manis',
                qty: 2,
                rate: 8000,
                uom: 'Glass',
                station: 'Beverage Station'
            }
        ]
    },
    callback: function(r) {
        console.log(r.message)
    }
})
```

**Expected Result:**
```json
{
  "name": "POS-ORD-2026-00456",
  "customer": "Walk-in Customer",
  "table": "TABLE-01",
  "order_type": "Dine-in",
  "workflow_state": "Draft",
  "total_qty": 4,
  "grand_total": 86000,
  "items": [...]
}
```

**Verify in Database:**
```sql
SELECT name, table, order_type, workflow_state, grand_total 
FROM `tabPOS Order` 
WHERE name = 'POS-ORD-2026-00456'

SELECT status, current_order 
FROM `tabRestaurant Table` 
WHERE name = 'TABLE-01'
```

**Test Cases:**
- ✅ Order created successfully
- ✅ Table status = "Occupied"
- ✅ Table current_order = order name
- ✅ Items added with correct totals
- ✅ imogi_source_module = "Waiter"
- ✅ workflow_state = "Draft"

---

### Test 4: Send to Kitchen
**Endpoint:** `imogi_pos.api.kot.send_to_kitchen`

**Test via API Browser:**
```javascript
// First create order (from Test 3), then:
frappe.call({
    method: 'imogi_pos.api.kot.send_to_kitchen',
    args: {
        order_name: 'POS-ORD-2026-00456',
        items_by_station: {
            'Main Kitchen': [
                {
                    item_code: 'NASI-GORENG',
                    item_name: 'Nasi Goreng Special',
                    qty: 2,
                    uom: 'Nos',
                    rate: 35000,
                    notes: 'Extra pedas'
                }
            ],
            'Beverage Station': [
                {
                    item_code: 'ES-TEH',
                    item_name: 'Es Teh Manis',
                    qty: 2,
                    uom: 'Glass',
                    rate: 8000
                }
            ]
        }
    },
    callback: function(r) {
        console.log(r.message)
    }
})
```

**Expected Result:**
```json
{
  "success": true,
  "kots": {
    "Main Kitchen": "KOT-2026-00123",
    "Beverage Station": "KOT-2026-00124"
  },
  "total_kots": 2
}
```

**Verify in Database:**
```sql
SELECT name, kitchen, station, workflow_state, pos_order
FROM `tabKitchen Order Ticket`
WHERE pos_order = 'POS-ORD-2026-00456'

SELECT item_code, item_name, qty, notes
FROM `tabKOT Item`
WHERE parent IN ('KOT-2026-00123', 'KOT-2026-00124')
```

**Test Cases:**
- ✅ Multiple KOTs created (one per station)
- ✅ Items grouped correctly by station
- ✅ workflow_state = "Queued"
- ✅ KOT linked to POS Order
- ✅ Realtime events published
- ✅ Table remains "Occupied"

---

## 🎨 Frontend Testing

### Kitchen Display App

**URL:** `/app/kitchen-display?kitchen=Main Kitchen`

**Test Scenarios:**

1. **Initial Load**
   - ✅ 3 columns displayed (Queued, In Progress, Ready)
   - ✅ Active KOTs appear in correct columns
   - ✅ KOT cards show items, time, table info
   - ✅ Station filter dropdown works

2. **State Transitions**
   - ✅ Click "Start" → KOT moves to "In Progress"
   - ✅ Click "Ready" → KOT moves to "Ready"
   - ✅ Click "Served" → KOT disappears
   - ✅ Click "Return to Queue" → KOT moves back to "Queued"
   - ✅ Click "Return to Kitchen" → KOT moves back to "In Progress"

3. **Realtime Updates**
   - ✅ Open in 2 browsers
   - ✅ Update KOT state in one browser
   - ✅ Verify state updates in other browser
   - ✅ Sound notification plays on new KOT

4. **Time Indicators**
   - ✅ Recent KOTs show green time
   - ✅ 15+ min KOTs show yellow time
   - ✅ 30+ min KOTs show red blinking time

5. **Cancel Workflow**
   - ✅ Click "Cancel" → Shows reason input
   - ✅ Enter reason → KOT cancelled
   - ✅ KOT disappears from display

---

### Waiter App

**URL:** `/app/waiter?branch=Jakarta Pusat&mode=Dine-in`

**Test Scenarios:**

1. **Table Selection**
   - ✅ Tables displayed in grid
   - ✅ Available tables = green
   - ✅ Occupied tables = red (disabled)
   - ✅ Selected table = blue border
   - ✅ Click table → Selection changes

2. **Menu Browsing**
   - ✅ Items displayed with images
   - ✅ Category tabs filter items
   - ✅ Search filters by name/code
   - ✅ Stock status shown correctly

3. **Cart Operations**
   - ✅ Click "Add to Cart" → Item added
   - ✅ Duplicate item → Qty increased
   - ✅ Click +/- → Qty changes
   - ✅ Click X → Item removed
   - ✅ Click "Clear All" → Cart emptied

4. **Item Notes**
   - ✅ Click "Add note" → Input appears
   - ✅ Enter note → Saved
   - ✅ Note displayed in cart
   - ✅ Click "Edit" → Can modify note

5. **Send to Kitchen**
   - ✅ Without table → Error "Please select table"
   - ✅ Empty cart → Error "Cart is empty"
   - ✅ Valid order → Success message
   - ✅ Cart cleared after send
   - ✅ Table status → "Occupied"

---

## 🔄 End-to-End Workflow Test

### Complete Flow: Waiter → Kitchen → Serve

**Setup:**
- Browser 1: Waiter App
- Browser 2: Kitchen Display

**Steps:**

1. **Waiter Creates Order**
   - Open Waiter App
   - Select TABLE-01
   - Add 2x Nasi Goreng (Main Kitchen)
   - Add 1x Es Teh (Beverage Station)
   - Add note: "Extra pedas"
   - Click "Send to Kitchen"
   - ✅ Success message appears
   - ✅ Cart cleared
   - ✅ TABLE-01 → "Occupied"

2. **Kitchen Receives Order**
   - Switch to Kitchen Display
   - ✅ Sound notification plays
   - ✅ 2 KOTs appear in "Queued" column
   - ✅ KOT-001: Main Kitchen - Nasi Goreng
   - ✅ KOT-002: Beverage Station - Es Teh
   - ✅ Note visible: "Extra pedas"

3. **Kitchen Prepares Food**
   - Click "Start" on KOT-001
   - ✅ Moves to "In Progress" column
   - ✅ Both browsers update
   - Click "Start" on KOT-002
   - ✅ Moves to "In Progress" column

4. **Kitchen Marks Ready**
   - Click "Ready" on KOT-002 (Beverage done first)
   - ✅ Moves to "Ready" column
   - Wait 5 seconds
   - Click "Ready" on KOT-001
   - ✅ Moves to "Ready" column

5. **Waiter Serves**
   - Waiter picks up drinks
   - Click "Served" on KOT-002
   - ✅ Disappears from display
   - Waiter picks up food
   - Click "Served" on KOT-001
   - ✅ Disappears from display

6. **Verify Database**
   ```sql
   SELECT name, workflow_state 
   FROM `tabKitchen Order Ticket` 
   WHERE pos_order = 'POS-ORD-2026-00456'
   ```
   - ✅ Both KOTs = "Served"

---

## 🚨 Error Testing

### Test Error Handling

1. **Invalid State Transition**
   ```javascript
   // Try Queued → Served (invalid)
   frappe.call({
       method: 'imogi_pos.api.kot.update_kot_state',
       args: {
           kot_name: 'KOT-2026-00001',
           new_state: 'Served'
       }
   })
   ```
   - ✅ Should throw error
   - ✅ Error message displayed in UI

2. **Cancel Without Reason**
   ```javascript
   frappe.call({
       method: 'imogi_pos.api.kot.update_kot_state',
       args: {
           kot_name: 'KOT-2026-00001',
           new_state: 'Cancelled'
       }
   })
   ```
   - ✅ Should throw error "Cancellation reason required"

3. **Create Order Without Table (Dine-in)**
   - Waiter App
   - Mode = "Dine-in"
   - Don't select table
   - Add items
   - Click "Send to Kitchen"
   - ✅ Error: "Please select table"

---

## 📊 Performance Testing

### Load Test Scenarios

1. **Multiple Concurrent KOTs**
   - Create 20 orders simultaneously
   - Send all to kitchen
   - ✅ All KOTs created
   - ✅ Kitchen Display responsive
   - ✅ No realtime lag

2. **Rapid State Changes**
   - Update 10 KOTs in quick succession
   - ✅ All updates processed
   - ✅ No race conditions
   - ✅ UI stays in sync

3. **Multi-Browser Realtime**
   - Open Kitchen Display in 5 browsers
   - Update KOT in one browser
   - ✅ All browsers update within 1 second
   - ✅ No duplicate events

---

## ✅ Test Completion Checklist

### Backend
- [ ] All 4 endpoints tested
- [ ] State transitions validated
- [ ] Realtime events published
- [ ] Error handling works
- [ ] Database integrity maintained

### Frontend  
- [ ] Kitchen Display loads correctly
- [ ] Waiter App loads correctly
- [ ] All UI interactions work
- [ ] Realtime updates work
- [ ] Error messages display

### Integration
- [ ] Complete Waiter → Kitchen flow works
- [ ] Multi-browser sync works
- [ ] Sound notifications work
- [ ] Table status updates work
- [ ] Order → KOT → Serve flow complete

---

## 🐛 Bug Reporting Template

When reporting issues, include:

```
**Bug:** [Brief description]

**Steps to Reproduce:**
1. Go to...
2. Click on...
3. Enter...

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Environment:**
- Browser: 
- Frappe Version:
- Error Console Log:

**Screenshots:**
[If applicable]
```

---

**Next:** After testing complete, proceed to Phase 2 (Cashier Integration)
