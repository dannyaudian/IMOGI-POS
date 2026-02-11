# IMOGI POS - Skema Testing Lengkap

**Versi:** 3.0  
**Tanggal:** 11 Februari 2026  
**Tujuan:** Skema testing end-to-end untuk semua modul IMOGI POS

---

## Daftar Isi

1. [Ringkasan Modul](#1-ringkasan-modul)
2. [Testing Environment Setup](#2-testing-environment-setup)
3. [Flow Testing End-to-End](#3-flow-testing-end-to-end)
4. [Unit Testing per Modul](#4-unit-testing-per-modul)
5. [Integration Testing](#5-integration-testing)
6. [Negative Flow Testing](#6-negative-flow-testing)
7. [Performance Testing](#7-performance-testing)
8. [Checklist Testing](#8-checklist-testing)

---

## 1. Ringkasan Modul

| No | Modul | File Utama | Fungsi | Test File |
|----|-------|------------|--------|-----------|
| 1 | **POS Order** | `doctype/pos_order/pos_order.py` | Manajemen order | `test_orders.py` |
| 2 | **KOT (Kitchen)** | `kitchen/kot_service.py` | Tiket dapur | `test_kot.py` |
| 3 | **Billing** | `billing/invoice_builder.py` | Sales Invoice | `test_billing.py` |
| 4 | **Items** | `api/items.py` | Katalog item | `test_pos_items_unified.py` |
| 5 | **Variants** | `api/variants.py` | Varian produk | `test_variants.py` |
| 6 | **Pricing** | `api/pricing.py` | Harga & diskon | `test_order_pricing.py` |
| 7 | **Customers** | `api/customers.py` | Data pelanggan | `test_customers.py` |
| 8 | **Layout** | `api/layout.py` | Denah meja | `test_layout.py` |
| 9 | **Authorization** | `utils/permission_manager.py` | Akses kontrol | `test_authorization.py` |
| 10 | **Queue** | `api/queue.py` | Nomor antrian | `test_queue_number.py` |

---

## 2. Testing Environment Setup

### 2.1 Prerequisites

```bash
# Pastikan Frappe bench aktif
cd ~/frappe-bench
bench start

# Jalankan di site testing
bench --site [SITE_NAME] console
```

### 2.2 Test Data Fixtures

```python
# Minimal test data yang diperlukan
test_fixtures = {
    "POS Profile": "TEST-POS-001",
    "Customer": "Test Customer",
    "Item": ["ITEM-001", "ITEM-002", "ITEM-003"],
    "Kitchen Station": "Main Kitchen",
    "Restaurant Table": "TABLE-01",
    "Warehouse": "Stores - TEST"
}
```

### 2.3 Run Tests

```bash
# Run semua test
bench --site [SITE_NAME] run-tests --app imogi_pos

# Run test spesifik
bench --site [SITE_NAME] run-tests --app imogi_pos --module imogi_pos.tests.test_orders

# Run dengan coverage
bench --site [SITE_NAME] run-tests --app imogi_pos --coverage
```

---

## 3. Flow Testing End-to-End

### 3.1 Flow Utama Restaurant

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   DRAFT     │────▶│ IN PROGRESS │────▶│    READY    │────▶│   SERVED    │────▶│   CLOSED    │
│             │     │ (KOT Created)│     │             │     │             │     │(Invoice)    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 3.2 Test Cases Flow Utama

#### TC-001: Order Draft ke Closed (Happy Path)

| Step | Action | Expected Result | Verify |
|------|--------|-----------------|--------|
| 1 | Buat POS Order baru | Order status = Draft | ✓ |
| 2 | Tambah items ke order | Items tersimpan | ✓ |
| 3 | Klik "Send to Kitchen" | Status = In Progress, KOT dibuat | ✓ |
| 4 | Dapur mark "Ready" | Status = Ready | ✓ |
| 5 | Waiter mark "Served" | Status = Served | ✓ |
| 6 | Klik "Close Order" | Status = Closed, Invoice dibuat | ✓ |

**Test Code:**
```python
def test_complete_restaurant_flow():
    # Step 1: Create Order
    order = frappe.get_doc({
        "doctype": "POS Order",
        "pos_profile": "TEST-POS-001",
        "customer": "Test Customer"
    })
    order.insert()
    assert order.workflow_state == "Draft"
    
    # Step 2: Add Items
    order.append("items", {
        "item_code": "ITEM-001",
        "qty": 2,
        "rate": 50000
    })
    order.save()
    assert len(order.items) == 1
    
    # Step 3: Send to Kitchen
    order.workflow_state = "In Progress"
    order.save()
    assert frappe.db.exists("KOT Ticket", {"pos_order": order.name})
    
    # Step 4-5: Mark Ready and Served
    order.workflow_state = "Ready"
    order.save()
    order.workflow_state = "Served"
    order.save()
    
    # Step 6: Close Order
    order.workflow_state = "Closed"
    order.save()
    assert frappe.db.exists("Sales Invoice", {"pos_order": order.name})
```

---

#### TC-002: Order Takeaway (Tanpa KOT)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Buat order dengan order_type = "Takeaway" | Order dibuat |
| 2 | Langsung Close Order | Invoice dibuat tanpa KOT |

---

#### TC-003: Order dengan Variants

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pilih item template (Has Variants) | Tampil pilihan variant |
| 2 | Pilih variant (misal: Size L) | Item variant ditambahkan |
| 3 | Selesaikan order | Total dihitung dari harga variant |

---

## 4. Unit Testing per Modul

### 4.1 POS Order Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| ORD-001 | `test_create_order_basic` | Buat order sederhana | High |
| ORD-002 | `test_create_order_with_items` | Order dengan multiple items | High |
| ORD-003 | `test_update_order_items` | Update item di order | High |
| ORD-004 | `test_calc_totals` | Kalkulasi total & tax | High |
| ORD-005 | `test_workflow_transitions` | State transitions | High |
| ORD-006 | `test_void_order` | Void/cancel order | Medium |
| ORD-007 | `test_order_with_discount` | Diskon di level order | Medium |
| ORD-008 | `test_order_concurrency` | Concurrent access | Medium |

**Sample Test:**
```python
def test_create_order_basic(frappe_env):
    """ORD-001: Test basic order creation"""
    order = create_pos_order(
        pos_profile="TEST-POS-001",
        customer="Test Customer",
        items=[{"item_code": "ITEM-001", "qty": 1}]
    )
    
    assert order.get("success") is True
    assert order.get("name") is not None
    assert order.get("status") == "Draft"
```

---

### 4.2 KOT (Kitchen Order Ticket) Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| KOT-001 | `test_create_kot_from_order` | Auto-create KOT | High |
| KOT-002 | `test_kot_items_mapping` | Items ter-map ke KOT | High |
| KOT-003 | `test_kot_station_assignment` | Assign ke Kitchen Station | High |
| KOT-004 | `test_kot_sequence_counter` | Nomor urut KOT | Medium |
| KOT-005 | `test_kot_status_update` | Update status KOT | Medium |
| KOT-006 | `test_kot_reprint` | Reprint KOT | Low |
| KOT-007 | `test_kot_void` | Void KOT item | Medium |

**Sample Test:**
```python
def test_create_kot_from_order(frappe_env):
    """KOT-001: Test KOT auto-creation when order sent to kitchen"""
    # Create order
    order = frappe.get_doc({
        "doctype": "POS Order",
        "pos_profile": "TEST-POS-001",
        "customer": "Test Customer",
        "items": [{"item_code": "ITEM-001", "qty": 2}]
    })
    order.insert()
    
    # Trigger send to kitchen
    order.workflow_state = "In Progress"
    order.save()
    
    # Verify KOT created
    kot = frappe.get_all("KOT Ticket", 
        filters={"pos_order": order.name},
        fields=["name", "kitchen_station", "workflow_state"]
    )
    
    assert len(kot) > 0
    assert kot[0].kitchen_station is not None
```

---

### 4.3 Billing/Invoice Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| INV-001 | `test_create_invoice_from_order` | Auto-create Invoice | High |
| INV-002 | `test_invoice_items_mapping` | Items ter-map ke Invoice | High |
| INV-003 | `test_invoice_tax_calculation` | Kalkulasi pajak (PB1) | High |
| INV-004 | `test_invoice_totals` | Grand total benar | High |
| INV-005 | `test_invoice_payment` | Pembayaran Invoice | High |
| INV-006 | `test_invoice_split_payment` | Split payment | Medium |
| INV-007 | `test_invoice_print` | Print Invoice | Low |

**Sample Test:**
```python
def test_create_invoice_from_order(frappe_env):
    """INV-001: Test Sales Invoice auto-creation on order close"""
    # Create and complete order flow
    order = create_test_order()
    order.workflow_state = "Closed"
    order.save()
    
    # Verify Invoice created
    invoice = frappe.db.get_value("Sales Invoice",
        {"pos_order": order.name},
        ["name", "grand_total", "status"]
    )
    
    assert invoice is not None
    assert invoice[1] == order.grand_total
```

---

### 4.4 Items & Variants Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| ITM-001 | `test_get_pos_items` | List items untuk POS | High |
| ITM-002 | `test_item_pricing` | Harga dari price list | High |
| ITM-003 | `test_item_template_variants` | Tampil template + variants | High |
| ITM-004 | `test_variant_selection` | Pilih variant | High |
| ITM-005 | `test_item_options` | Item options/modifiers | Medium |
| ITM-006 | `test_menu_category_filter` | Filter by kategori | Medium |
| ITM-007 | `test_item_search` | Search items | Medium |

**Sample Test:**
```python
def test_item_template_variants(frappe_env):
    """ITM-003: Test Has Variants items show properly"""
    # Get items in template mode
    result = get_pos_items(
        pos_profile="TEST-POS-001",
        mode="template"
    )
    
    # Verify templates shown
    templates = [i for i in result.items if i.get("has_variants")]
    assert len(templates) > 0
    
    # Verify variants available
    for template in templates:
        variants = get_item_variants(template.item_code)
        assert len(variants) > 0
```

---

### 4.5 Pricing Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| PRC-001 | `test_get_item_price` | Ambil harga dari price list | High |
| PRC-002 | `test_pricing_rule_discount` | Pricing rule discount | High |
| PRC-003 | `test_apply_coupon` | Apply promo code | Medium |
| PRC-004 | `test_volume_discount` | Diskon berdasarkan qty | Medium |
| PRC-005 | `test_time_based_pricing` | Happy hour pricing | Low |

---

### 4.6 Customer Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| CUS-001 | `test_create_customer` | Buat customer baru | High |
| CUS-002 | `test_get_customer_info` | Info customer | Medium |
| CUS-003 | `test_customer_loyalty` | Loyalty points | Low |

---

### 4.7 Layout/Table Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| LAY-001 | `test_get_restaurant_tables` | List meja | High |
| LAY-002 | `test_table_status` | Status meja (available/occupied) | High |
| LAY-003 | `test_assign_table_to_order` | Assign meja ke order | High |
| LAY-004 | `test_floor_layout` | Denah lantai | Medium |

---

### 4.8 Authorization Module

| Test ID | Nama Test | Deskripsi | Priority |
|---------|-----------|-----------|----------|
| AUT-001 | `test_cashier_permissions` | Izin cashier | High |
| AUT-002 | `test_manager_permissions` | Izin manager | High |
| AUT-003 | `test_void_requires_approval` | Void perlu approval | High |
| AUT-004 | `test_discount_limit` | Batas diskon per role | Medium |

---

## 5. Integration Testing

### 5.1 POS Order ↔ KOT Integration

| Test ID | Scenario | Expected |
|---------|----------|----------|
| INT-001 | Order dikirim ke dapur | KOT dibuat otomatis |
| INT-002 | Order diupdate setelah KOT | KOT item diupdate/tambah |
| INT-003 | KOT selesai | Order status update |
| INT-004 | Order cancelled | KOT di-void |

```python
def test_order_kot_integration():
    """INT-001: Test Order to KOT integration"""
    order = create_test_order_with_items()
    
    # Send to kitchen
    order.workflow_state = "In Progress"
    order.save()
    
    # Verify KOT
    kot = frappe.get_doc("KOT Ticket", {"pos_order": order.name})
    assert len(kot.items) == len(order.items)
    
    # Verify items match
    for order_item in order.items:
        kot_item = next(k for k in kot.items if k.item_code == order_item.item_code)
        assert kot_item.qty == order_item.qty
```

---

### 5.2 POS Order ↔ Sales Invoice Integration

| Test ID | Scenario | Expected |
|---------|----------|----------|
| INT-005 | Order closed | Invoice dibuat |
| INT-006 | Order dengan pajak | Invoice include tax |
| INT-007 | Order dengan diskon | Invoice reflect diskon |
| INT-008 | Invoice paid | Payment Entry dibuat |

```python
def test_order_invoice_integration():
    """INT-005: Test Order to Invoice integration"""
    order = create_and_complete_order()
    
    # Close order
    order.workflow_state = "Closed"
    order.save()
    
    # Verify Invoice
    invoice = frappe.get_doc("Sales Invoice", {"pos_order": order.name})
    
    assert invoice.docstatus == 0  # Draft (non-submittable workflow)
    assert invoice.grand_total == order.grand_total
    assert invoice.customer == order.customer
```

---

### 5.3 Kitchen Station ↔ KOT Integration

| Test ID | Scenario | Expected |
|---------|----------|----------|
| INT-009 | Item assign ke station | KOT muncul di station |
| INT-010 | Multi-station order | Multiple KOT per station |
| INT-011 | Station mark ready | KOT status update |

---

## 6. Negative Flow Testing

### 6.1 Order Errors

| Test ID | Scenario | Expected Error |
|---------|----------|----------------|
| NEG-001 | Order tanpa items | "Items are mandatory" |
| NEG-002 | Order tanpa customer | "Customer is required" |
| NEG-003 | Order dengan invalid item | "Item not found" |
| NEG-004 | Order dengan qty = 0 | "Quantity must be > 0" |
| NEG-005 | Duplicate order submit | "Order already submitted" |

```python
def test_order_without_items_fails():
    """NEG-001: Order without items should fail"""
    with pytest.raises(frappe.ValidationError, match="Items are mandatory"):
        order = frappe.get_doc({
            "doctype": "POS Order",
            "pos_profile": "TEST-POS-001",
            "customer": "Test Customer"
        })
        order.insert()
        order.workflow_state = "In Progress"
        order.save()
```

---

### 6.2 KOT Errors

| Test ID | Scenario | Expected Error |
|---------|----------|----------------|
| NEG-006 | KOT tanpa Kitchen Station | Auto-create default station |
| NEG-007 | KOT tanpa items | "Items are mandatory" |
| NEG-008 | Invalid workflow transition | "Invalid workflow action" |

---

### 6.3 Invoice Errors

| Test ID | Scenario | Expected Error |
|---------|----------|----------------|
| NEG-009 | Invoice tanpa tax template | Use default (no manual tax) |
| NEG-010 | Invoice dengan invalid customer | "Customer not found" |
| NEG-011 | Double invoice creation | Skip if already exists |

---

### 6.4 Permission Errors

| Test ID | Scenario | Expected Error |
|---------|----------|----------------|
| NEG-012 | Cashier void tanpa approval | "Permission denied" |
| NEG-013 | Access wrong POS Profile | "Not authorized" |
| NEG-014 | Exceed discount limit | "Discount limit exceeded" |

---

## 7. Performance Testing

### 7.1 Load Testing Targets

| Metric | Target | Test Command |
|--------|--------|--------------|
| Order creation | < 500ms | `time create_pos_order()` |
| Item lookup | < 200ms | `time get_pos_items()` |
| KOT creation | < 300ms | `time create_kot_ticket()` |
| Invoice creation | < 500ms | `time create_sales_invoice()` |

### 7.2 Concurrent Users Test

```python
def test_concurrent_orders():
    """Test 10 concurrent order creations"""
    import concurrent.futures
    
    def create_order():
        return create_pos_order(
            pos_profile="TEST-POS-001",
            customer="Test Customer",
            items=[{"item_code": "ITEM-001", "qty": 1}]
        )
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(create_order) for _ in range(10)]
        results = [f.result() for f in futures]
    
    assert all(r.get("success") for r in results)
```

---

## 8. Checklist Testing

### 8.1 Pre-Deployment Checklist

- [ ] Semua unit tests pass
- [ ] Integration tests pass
- [ ] No critical errors di error log
- [ ] Performance targets tercapai
- [ ] Manual testing flow utama berhasil

### 8.2 Manual Testing Checklist

#### Restaurant Flow
- [ ] Buat order baru ✓/✗
- [ ] Tambah items ke order ✓/✗
- [ ] Send to Kitchen → KOT dibuat ✓/✗
- [ ] Mark Ready dari KDS ✓/✗
- [ ] Mark Served ✓/✗
- [ ] Close Order → Invoice dibuat ✓/✗
- [ ] Payment → Invoice paid ✓/✗

#### Takeaway Flow
- [ ] Buat order takeaway ✓/✗
- [ ] Langsung close → Invoice dibuat ✓/✗
- [ ] Payment berhasil ✓/✗

#### Variant Flow
- [ ] Item dengan "Has Variants" terlihat ✓/✗
- [ ] Pilih variant → harga benar ✓/✗
- [ ] Order dengan variant berhasil ✓/✗

### 8.3 Run Test Commands

```bash
# Quick smoke test
bench --site [SITE] run-tests --app imogi_pos --module imogi_pos.tests.test_orders

# Full test suite
bench --site [SITE] run-tests --app imogi_pos

# Specific module
bench --site [SITE] run-tests --app imogi_pos --module imogi_pos.tests.test_kot
bench --site [SITE] run-tests --app imogi_pos --module imogi_pos.tests.test_billing
bench --site [SITE] run-tests --app imogi_pos --module imogi_pos.tests.test_variants

# With coverage report
bench --site [SITE] run-tests --app imogi_pos --coverage --coverage-report
```

---

## Quick Reference

| Flow | Trigger | Auto Action |
|------|---------|-------------|
| Send to Kitchen | `workflow_state = "In Progress"` | KOT Ticket dibuat |
| Close Order | `workflow_state = "Closed"` | Sales Invoice dibuat |
| Void Order | `workflow_state = "Cancelled"` | KOT + Invoice di-void |

---

**Dibuat oleh:** IMOGI POS Team  
**Terakhir Update:** 11 Februari 2026
