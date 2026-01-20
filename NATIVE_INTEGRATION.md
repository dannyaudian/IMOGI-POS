# Native ERPNext Integration Configuration

## 🎯 Overview
**IMOGI-POS** adalah **Custom POS System** yang dibangun untuk ERPNext, bukan menggunakan POS bawaan ERPNext.

Namun IMOGI-POS sekarang menggunakan **native-first approach** untuk memanfaatkan fitur-fitur bawaan ERPNext:
- 🎯 **Native Pricing Rules** - untuk discount & promo
- 👥 **Native CRM Module** - untuk Lead, Customer, Opportunity
- 🧾 **Native Sales Invoice** - untuk pembayaran & accounting
- 🎫 **Native Coupon Code** - untuk validasi kupon

## ✅ Modul yang Sudah Terintegrasi

### **Semua Modul POS Aktif dengan Native Pricing:**

1. ✅ **Sales Invoice Builder** (`billing/invoice_builder.py`)
   - `ignore_pricing_rule = 0` - Native pricing rules aktif
   - Automatic discount application saat create invoice

2. ✅ **Order API** (`api/orders.py`)
   - `create_order()` - Apply pricing rules ke semua items
   - `add_item_to_order()` - Apply pricing rules per item
   - Automatic free items dari Buy X Get Y rules

3. ✅ **Customer API** (`api/customers.py`)
   - Lead creation otomatis sebelum customer
   - Lead to Customer conversion tracking

4. ✅ **Native Pricing Module** (`api/native_pricing.py`)
   - Wrapper functions untuk ERPNext pricing
   - CRM integration functions
   - Coupon code validation

5. 🔄 **Custom POS Frontends** (Ready to use native API):
   - Kiosk (`www/kiosk/index.js`) - Custom kiosk interface
   - Self Order (`www/so/index.js`) - Custom QR self-order
   - Create Order/Waiter (`www/create-order/index.js`) - Custom waiter app
   - Cashier Console (`www/cashier-console/index.js`) - Custom cashier terminal

## ✅ Yang Sudah Diaktifkan

### 1. **Native ERPNext Pricing Rules**
- `ignore_pricing_rule = 0` - Pricing rules native ERPNext aktif
- Automatic discount application berdasarkan rules yang sudah dikonfigurasi
- Support untuk:
  - Discount Percentage
  - Discount Amount
  - Special Rate
  - Buy X Get Y Free
  - Quantity-based discounts
  - Customer/Customer Group specific
  - Time-based promotions

### 2. **Native CRM Integration**
- Lead creation otomatis untuk customer baru
- Lead to Customer conversion tracking
- Contact management dengan Dynamic Link
- Opportunity creation dari POS Order

### 3. **Native Promotional Schemes**
- Support untuk Promotional Scheme DocType
- Price discount slabs (bertingkat)
- Product discount slabs
- Multi-tier promotions

## � Flow Integrasi di Setiap Modul

### **Backend Flow:**

```python
# 1. Create Order (api/orders.py)
create_order(items=[...])
  ↓
apply_pricing_rules_to_items(items)  # Native pricing diterapkan
  ↓
Order dibuat dengan discount & free items
  ↓
Save ke database

# 2. Add Item (api/orders.py)
add_item_to_order(pos_order, item)
  ↓
_apply_native_pricing_rules_to_item(item)  # Cek pricing rules
  ↓
Item ditambahkan dengan discount
  ↓
Order.save()

# 3. Create Invoice (billing/invoice_builder.py)
build_sales_invoice_from_pos_order(pos_order)
  ↓
si.ignore_pricing_rule = 0  # Enable native rules
  ↓
ERPNext apply pricing rules otomatis
  ↓
Invoice.save() & Invoice.submit()
```

### **Frontend Integration:**

Semua frontend modules bisa langsung gunakan:

```javascript
// Option 1: Custom promo codes (existing)
frappe.call({
    method: 'imogi_pos.api.pricing.validate_promo_code',
    args: { promo_code: 'DISCOUNT10' }
});

// Option 2: Native pricing rules (new - automatic)
// Tidak perlu panggil API, sudah otomatis apply di backend!
frappe.call({
    method: 'imogi_pos.api.orders.create_order',
    args: {
        items: cart_items  // Pricing rules apply otomatis
    }
});

// Option 3: Check pricing rules explicitly
frappe.call({
    method: 'imogi_pos.api.native_pricing.get_applicable_pricing_rules',
    args: {
        item_code: 'COFFEE-LATTE',
        customer: 'CUST-001'
    }
});
```

## 📋 Cara Menggunakan

### A. Setup Pricing Rule di ERPNext

1. **Buat Pricing Rule baru:**
   ```
   Menu: Selling > Pricing Rule > New
   ```

2. **Contoh: Happy Hour 20% Off**
   ```
   Title: Happy Hour Drinks
   Apply On: Item Group
   Item Group: Beverages
   Rate or Discount: Discount Percentage
   Discount Percentage: 20
   Valid From: 2026-01-20 14:00:00
   Valid Upto: 2026-01-20 17:00:00
   Selling: ✓
   ```

3. **Contoh: Buy 2 Get 1 Free**
   ```
   Title: Beli 2 Gratis 1 Burger
   Apply On: Item Code
   Items: BURGER-CHEESE
   Price or Product Discount: Product
   Free Item: BURGER-CHEESE
   Free Qty: 1
   Min Qty: 2
   Recursive: ✓
   ```

4. **Contoh: Member Discount**
   ```
   Title: VIP Member 15% Off
   Apply On: Item Group
   Item Group: All Item Groups
   Discount Percentage: 15
   Applicable For: Customer Group
   Customer Group: VIP Members
   Priority: 1
   ```

### B. Setup Promotional Scheme

1. **Buat Promotional Scheme:**
   ```
   Menu: Selling > Promotional Scheme > New
   ```

2. **Price Discount Slabs (Bertingkat):**
   ```
   Rule Priority: 1
   Apply On: Item Group
   Item Group: Food
   
   Price Discount Slabs:
   - Min Qty: 5,  Discount %: 5
   - Min Qty: 10, Discount %: 10
   - Min Qty: 20, Discount %: 15
   ```

### C. Setup Coupon Codes

1. **Buat Coupon Code:**
   ```
   Menu: Selling > Coupon Code > New
   
   Coupon Name: NEWYEAR2026
   Coupon Type: Promotional
   Used: 0
   Maximum Use: 100
   Valid From: 2026-01-01
   Valid Upto: 2026-01-31
   
   Link to Pricing Rule yang sudah dibuat
   ```

## 🔧 API Endpoints Baru

### 1. Get Pricing Rules
```javascript
frappe.call({
    method: 'imogi_pos.api.native_pricing.get_applicable_pricing_rules',
    args: {
        item_code: 'COFFEE-LATTE',
        customer: 'CUST-001',
        price_list: 'Standard Selling',
        qty: 2
    },
    callback: (r) => {
        console.log(r.message.discount_percentage);
        console.log(r.message.free_item);
    }
});
```

### 2. Apply Pricing Rules to Cart
```javascript
frappe.call({
    method: 'imogi_pos.api.native_pricing.apply_pricing_rules_to_items',
    args: {
        items: cart_items,
        customer: current_customer,
        price_list: selected_price_list,
        pos_profile: POS_PROFILE
    },
    callback: (r) => {
        const result = r.message;
        console.log('Total Discount:', result.total_discount_amount);
        console.log('Free Items:', result.free_items);
    }
});
```

### 3. Validate Coupon Code
```javascript
frappe.call({
    method: 'imogi_pos.api.native_pricing.validate_coupon_code',
    args: {
        coupon_code: 'NEWYEAR2026',
        customer: current_customer
    },
    callback: (r) => {
        if (r.message.valid) {
            console.log('Coupon valid:', r.message.pricing_rule);
        }
    }
});
```

### 4. Get Promotional Schemes
```javascript
frappe.call({
    method: 'imogi_pos.api.native_pricing.get_promotional_schemes',
    args: {
        item_code: 'COFFEE-LATTE',
        customer: current_customer
    },
    callback: (r) => {
        console.log('Active Schemes:', r.message);
    }
});
```

### 5. Create Lead (CRM)
```javascript
// Lead dibuat otomatis saat quick_create_customer_with_contact
frappe.call({
    method: 'imogi_pos.api.customers.quick_create_customer_with_contact',
    args: {
        customer_name: 'John Doe',
        mobile_no: '081234567890',
        email_id: 'john@example.com'
    },
    callback: (r) => {
        // Lead dan Customer sudah otomatis dibuat
        console.log('Customer:', r.message.customer);
    }
});
```

### 6. Get CRM Lead
```javascript
frappe.call({
    method: 'imogi_pos.api.native_pricing.get_crm_lead_from_customer',
    args: {
        customer: 'CUST-001'
    },
    callback: (r) => {
        if (r.message) {
            console.log('Lead:', r.message.lead_name);
            console.log('Status:', r.message.status);
        }
    }
});
```

### 7. Create Opportunity
```javascript
frappe.call({
    method: 'imogi_pos.api.native_pricing.create_opportunity_from_order',
    args: {
        pos_order: 'POS-ORD-2026-00001',
        customer: 'CUST-001',
        items: cart_items
    },
    callback: (r) => {
        console.log('Opportunity:', r.message);
    }
});
```

## 🔄 Backward Compatibility

Custom promo code system tetap berfungsi sebagai **fallback**:
- Native pricing rules diterapkan **terlebih dahulu**
- Jika tidak ada native rules, gunakan custom promo codes
- Manual discount oleh kasir tetap bisa digunakan

## 📊 Priority Order

1. **Native ERPNext Pricing Rules** (auto-applied)
2. **Native Coupon Codes** (if entered)
3. **Custom Promo Codes** (fallback)
4. **Manual Discount** (cashier override)

## ⚙️ Settings

### POS Profile Settings
```
# Di POS Profile, field ini sekarang di-override:
Ignore Pricing Rule: ✗ (Always enabled)

# Untuk disable native pricing, set di:
File: imogi_pos/billing/invoice_builder.py
Line: si.ignore_pricing_rule = 0  # Change to 1 to disable
```

## 🎓 Training Materials

### Video Tutorials
1. Setup Pricing Rules: [Link]
2. Create Promotional Schemes: [Link]
3. Coupon Code Management: [Link]
4. CRM Lead Conversion: [Link]

### Documentation
- ERPNext Pricing Rules: https://docs.erpnext.com/docs/user/manual/en/accounts/pricing-rule
- Promotional Schemes: https://docs.erpnext.com/docs/user/manual/en/selling/promotional-schemes
- CRM Module: https://docs.erpnext.com/docs/user/manual/en/CRM

## 🎓 Testing & Verification

### **1. Test Pricing Rules Aktif:**

```bash
# Via ERPNext Console
bench --site [site-name] console

>>> from imogi_pos.api.orders import create_order
>>> order = create_order(
...     order_type='Takeaway',
...     branch='Main Branch',
...     pos_profile='Restaurant POS',
...     items=[{'item': 'COFFEE-LATTE', 'qty': 2}]
... )
>>> # Check jika ada discount dari pricing rules
>>> print(order)
```

### **2. Verify di Sales Invoice:**

```bash
# Buat invoice dari order
>>> from imogi_pos.billing.invoice_builder import build_sales_invoice_from_pos_order
>>> si_name = build_sales_invoice_from_pos_order('POS-ORD-2026-00001')
>>> si = frappe.get_doc('Sales Invoice', si_name)
>>> print(f"Ignore Pricing Rule: {si.ignore_pricing_rule}")  # Should be 0
>>> # Check items
>>> for item in si.items:
...     if item.pricing_rule:
...         print(f"Item: {item.item_code}, Pricing Rule: {item.pricing_rule}")
...         print(f"Discount %: {item.discount_percentage}")
```

### **3. Test Lead Creation:**

```python
>>> from imogi_pos.api.customers import quick_create_customer_with_contact
>>> result = quick_create_customer_with_contact(
...     customer_name='Test Customer',
...     mobile_no='081234567890'
... )
>>> print(result)  # Should have lead_name if Lead doctype exists
```

## 🐛 Troubleshooting

### Issue: Pricing rules tidak apply
**Solution:**
1. Cek rule status: Enabled
2. Cek valid date range
3. Cek Apply On (Item Code/Group/Brand)
4. Cek Applicable For (Customer/Customer Group)
5. Cek Priority jika ada multiple rules

### Issue: Coupon code invalid
**Solution:**
1. Cek coupon belum expired
2. Cek maximum use limit
3. Cek pricing rule yang di-link masih active

### Issue: Lead tidak dibuat
**Solution:**
1. Pastikan DocType "Lead" exists di sistem
2. Cek permissions untuk create Lead
3. Cek error log di frappe.log_error

## 📈 Analytics & Reporting

Native ERPNext reports yang bisa digunakan:
- **Pricing Rule Usage Report** - Track discount application
- **Sales Analytics** - Revenue per customer group
- **Lead Conversion Report** - Track lead to customer conversion
- **Coupon Code Usage Report** - Monitor promo effectiveness

## 🚀 Next Steps

1. ✅ Setup Pricing Rules di ERPNext
2. ✅ Test pricing rules di POS
3. ✅ Train staff tentang native features
4. ✅ Monitor discount application
5. ✅ Optimize rules berdasarkan data

## 📞 Support

Jika ada pertanyaan atau issue:
1. Check error logs: `bench --site [site-name] logs`
2. Review pricing rule configuration
3. Test dengan transaction sample
4. Contact support team
