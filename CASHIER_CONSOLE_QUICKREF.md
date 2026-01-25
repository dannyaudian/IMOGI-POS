# Cashier Console - Quick Reference

## 🎯 Mode Counter vs Table/Waiter

### Counter Mode
```
POS Profile → imogi_mode = "Counter"
```

**Behavior**:
- ✅ Hanya menampilkan order **Counter**
- ✅ Create new order → type **Counter**
- ✅ UI: Icon cash register 💵
- ✅ No table selection required
- ✅ Quick checkout for walk-in customers

**Use Case**: 
- Kasir konter utama
- Fast food / quick service
- Take away orders

---

### Table/Waiter Mode
```
POS Profile → imogi_mode = "Table"
```

**Behavior**:
- ✅ Hanya menampilkan order **Dine In** (dengan table)
- ✅ Create new order → type **Dine In**
- ✅ UI: Icon utensils 🍴
- ✅ Menampilkan "Table: [nama_meja]" di setiap order
- ✅ Support table-based workflow

**Use Case**:
- Restoran dine-in
- Waiter checkout
- Table service management

---

## 🔄 Workflow

### Counter Mode Workflow
```
1. Customer datang ke kasir
2. Cashier buka Console (mode Counter)
3. Lihat ready orders (Counter only)
4. Select order → Generate Invoice
5. Process payment
```

### Table Mode Workflow
```
1. Waiter selesai serve table
2. Waiter buka Console (mode Table)
3. Lihat ready orders (Dine In with tables)
4. Select order untuk table tertentu
5. Print bill / request payment
6. Generate invoice setelah payment
```

---

## 📍 Visual Indicators

| Mode | Icon | Label | Data Attribute |
|------|------|-------|----------------|
| Counter | 💵 `fa-cash-register` | "Counter Mode" | `data-pos-mode="Counter"` |
| Table | 🍴 `fa-utensils` | "Table/Waiter Mode" | `data-pos-mode="Table"` |

---

## 🔍 Filter & Search

### Order List Filters (Both Modes)
- **Ready**: Orders ready for billing
- **Served**: Already served, pending invoice
- **All**: All orders in current mode

### Search (Both Modes)
- Search by: Queue Number, Table, Customer Name
- **Counter**: Focus on queue number & customer
- **Table**: Focus on table number

---

## ⚙️ Configuration

### POS Profile Settings
```
imogi_mode:
  - "Counter"  → Counter checkout
  - "Table"    → Table/Waiter checkout
```

### Setup Check
```javascript
// Verify mode di console
imogi_pos.cashier_console.settings.posMode
// Output: "Counter" atau "Table"
```

---

## 🐛 Troubleshooting

### Problem: Wrong orders showing
**Solution**: 
- Check POS Profile → `imogi_mode` setting
- Logout and login again
- Clear browser cache

### Problem: Can't create order
**Solution**:
- Verify POS session is active
- Check branch access permissions
- Ensure POS Profile has correct mode

### Problem: Table name not showing
**Solution**:
- Order must be type "Dine In"
- Table must be assigned to order
- Check Table doctype has `table_name` field

---

## 📊 API Reference

### Load Orders
```python
# Frontend call
frappe.call({
    method: 'imogi_pos.api.billing.list_orders_for_cashier',
    args: {
        branch: 'Main Branch',
        workflow_state: 'Ready',
        order_type: 'Counter'  # or 'Dine In'
    }
})
```

### Create Order
```python
# Frontend call
frappe.call({
    method: 'imogi_pos.api.orders.create_staff_order',
    args: {
        pos_profile: 'Counter POS',
        branch: 'Main Branch',
        order_type: 'Counter'  # or 'Dine In' for Table mode
    }
})
```

---

## ✅ Best Practices

1. **Separate Profiles**: Create dedicated POS Profiles for Counter vs Table
2. **User Assignment**: Assign cashiers to Counter profile, waiters to Table profile
3. **Clear Labels**: Use descriptive profile names (e.g., "Main Counter", "Waiter Station 1")
4. **Monitor Both**: Supervisors can have access to both modes for monitoring

---

## 🔐 Permissions

Both modes require:
- ✅ Read access to POS Order
- ✅ Create access to Sales Invoice (for billing)
- ✅ Branch access validation
- ✅ POS Profile assignment

---

**Last Updated**: 2026-01-25  
**Version**: 1.0
