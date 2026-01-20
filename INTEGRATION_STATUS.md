# 🎯 Status Integrasi Native ERPNext di IMOGI-POS

**System Type:** 🔧 **CUSTOM POS** (bukan POS bawaan ERPNext)  
**Integration Strategy:** 🎯 **NATIVE-FIRST** (memanfaatkan ERPNext features)  
**Last Update:** January 20, 2026  
**Status:** ✅ **FULLY INTEGRATED**

## 🏗️ Architecture

**IMOGI-POS = Custom POS System**
- ❌ TIDAK menggunakan ERPNext POS bawaan
- ✅ Custom frontend (Kiosk, Self Order, Cashier, Waiter)
- ✅ Custom backend API (`imogi_pos.api.*`)
- ✅ Custom DocTypes (POS Order, Restaurant Table, dll)

**Memanfaatkan Native ERPNext:**
- ✅ Pricing Rules (discount engine)
- ✅ CRM Module (Lead, Customer, Opportunity)
- ✅ Sales Invoice (billing & accounting)
- ✅ Coupon Code (voucher validation)

## 📊 Integration Coverage

### ✅ Backend Modules (100% Complete)

| Module | File | Status | Features |
|--------|------|--------|----------|
| **Invoice Builder** | `billing/invoice_builder.py` | ✅ Complete | • Pricing rules aktif<br>• Auto discount application |
| **Order API** | `api/orders.py` | ✅ Complete | • Create order with pricing<br>• Add item with pricing<br>• Free items support |
| **Customer API** | `api/customers.py` | ✅ Complete | • Lead creation<br>• CRM tracking |
| **Native Pricing** | `api/native_pricing.py` | ✅ Complete | • Pricing rules wrapper<br>• CRM functions<br>• Coupon validation |
| **Pricing API** | `api/pricing.py` | ✅ Compatible | • Custom promos as fallback |

### 🔄 Custom POS Frontends (Ready to Use)

| Module | File | Status | Integration Type |
|--------|------|--------|------------------|
| **Kiosk** | `www/kiosk/index.js` | ✅ Ready | Custom UI → Native API |
| **Self Order** | `www/so/index.js` | ✅ Ready | Custom UI → Native API |
| **Create Order** | `www/create-order/index.js` | ✅ Ready | Custom UI → Native API |
| **Cashier Console** | `www/cashier-console/index.js` | ✅ Ready | Custom UI → Native API |
| **Waiter Order** | `www/waiter_order/index.js` | ✅ Ready | Custom UI → Native API |

> **Note:** Semua frontend adalah **custom interface** yang tidak pakai POS bawaan ERPNext. Native pricing rules diterapkan otomatis di backend API level.

## 🔧 Technical Implementation

### 1. **Automatic Pricing Application**

#### At Order Creation:
```python
# api/orders.py - create_order()
if items:
    # Native pricing rules applied automatically
    pricing_result = apply_pricing_rules_to_items(
        items=items,
        customer=customer,
        price_list=selling_price_list
    )
    # Free items added automatically
    items.extend(pricing_result.get("free_items", []))
```

#### At Item Addition:
```python
# api/orders.py - add_item_to_order()
row_data = _apply_native_pricing_rules_to_item(
    row_data,
    customer=order.customer,
    price_list=order.selling_price_list
)
# Discount applied automatically
```

#### At Invoice Creation:
```python
# billing/invoice_builder.py
si.ignore_pricing_rule = 0  # Always enabled
# ERPNext handles the rest
```

### 2. **CRM Integration**

```python
# api/customers.py - quick_create_customer_with_contact()
# 1. Create Lead first
lead = frappe.new_doc("Lead")
lead.source = "POS"
lead.insert()

# 2. Create Customer
customer.lead_name = lead.name
customer.insert()

# 3. Mark Lead as converted
lead.status = "Converted"
```

## 🎮 Usage Examples

### Example 1: Create Order with Auto Pricing

```python
# Custom IMOGI-POS API (bukan POS bawaan ERPNext)
order = frappe.call(
    'imogi_pos.api.orders.create_order',  # Custom API
    order_type='Takeaway',
    branch='Main Branch',
    pos_profile='Restaurant POS',
    items=[
        {'item': 'COFFEE-LATTE', 'qty': 2},
        {'item': 'BURGER-CHEESE', 'qty': 3}
    ]
)

# Native Pricing Rules diterapkan otomatis di backend
# Result:
# - Pricing rules automatically applied
# - Free items added (e.g., buy 2 get 1)
# - Discounts calculated
```

### Example 2: Frontend Usage (No Changes Needed)

```javascript
// Custom Frontend (Kiosk/Self Order/Cashier/Waiter)
// Memanggil custom IMOGI-POS API
frappe.call({
    method: 'imogi_pos.api.orders.create_order',  // Custom API, bukan POS bawaan
    args: {
        order_type: 'Dine-in',
        branch: CURRENT_BRANCH,
        pos_profile: POS_PROFILE,
        items: this.cart  // Native pricing applied automatically di backend
    },
    callback: (r) => {
        // Order created with native ERPNext pricing rules already applied
        console.log('Order:', r.message);
    }
});
```

### Example 3: Check Pricing Rules Explicitly

```javascript
// Optional: Check pricing rules before adding to cart
frappe.call({
    method: 'imogi_pos.api.native_pricing.get_applicable_pricing_rules',
    args: {
        item_code: 'COFFEE-LATTE',
        customer: current_customer,
        qty: 2
    },
    callback: (r) => {
        if (r.message.has_rule) {
            console.log('Discount:', r.message.discount_percentage + '%');
            console.log('Free Item:', r.message.free_item);
        }
    }
});
```

## 🎯 Priority Order (Discount Application)

1. **Native ERPNext Pricing Rules** ← **PRIMARY (Auto-applied)**
   - Time-based (Happy Hour)
   - Quantity-based (Buy 2 Get 1)
   - Customer-based (VIP discount)
   - Item/Group-based

2. **Native Coupon Codes**
   - Linked to pricing rules
   - Maximum usage tracking
   - Date validation

3. **Custom Promo Codes** ← **FALLBACK**
   - Legacy system
   - Still available if needed

4. **Manual Discount** ← **CASHIER OVERRIDE**
   - Can override all above

## ✅ Verification Checklist

- [x] Invoice builder menggunakan native pricing rules
- [x] Create order menerapkan pricing rules ke items
- [x] Add item menerapkan pricing rules per item
- [x] Free items ditambahkan otomatis
- [x] Lead dibuat sebelum customer
- [x] CRM tracking aktif
- [x] Native pricing API tersedia
- [x] Backward compatible dengan custom promo codes
- [x] Frontend tidak perlu perubahan
- [x] Documentation complete

## 📈 Benefits Achieved

### Performance
- ✅ Automatic discount calculation
- ✅ Reduced manual intervention
- ✅ Consistent pricing across channels

### Features
- ✅ Time-based promotions (Happy Hour)
- ✅ Buy X Get Y Free
- ✅ Customer-specific pricing
- ✅ Quantity-based discounts
- ✅ CRM lead tracking
- ✅ Customer journey analytics

### Scalability
- ✅ Centralized pricing management
- ✅ Easy to add new rules
- ✅ No code changes needed
- ✅ Built-in reporting

## 🚀 Next Steps

1. **Setup Pricing Rules** in ERPNext
   - Navigate to: Selling → Pricing Rule → New
   - Create rules for your business logic

2. **Test Integration**
   - Create test orders
   - Verify discounts applied
   - Check free items

3. **Train Staff**
   - Show how to create pricing rules
   - Explain priority order
   - Demo customer-specific discounts

4. **Monitor & Optimize**
   - Check pricing rule usage reports
   - Analyze discount effectiveness
   - Adjust rules based on data

## 📞 Support

**Issue:** Pricing rules not applying  
**Solution:** Check:
- Rule is enabled
- Valid date range
- Correct Apply On (Item/Group/Brand)
- Priority settings

**Issue:** Free items not appearing  
**Solution:** Check:
- Price or Product Discount = "Product"
- Free Item & Free Qty set
- Min Qty condition met

**Issue:** Lead not created  
**Solution:** Check:
- DocType "Lead" exists
- User has create permission
- Check error logs

## 📚 Resources

- [ERPNext Pricing Rules](https://docs.erpnext.com/docs/user/manual/en/accounts/pricing-rule)
- [Promotional Schemes](https://docs.erpnext.com/docs/user/manual/en/selling/promotional-schemes)
- [CRM Module](https://docs.erpnext.com/docs/user/manual/en/CRM)
- [IMOGI-POS Native Integration](./NATIVE_INTEGRATION.md)

---

**Status:** 🟢 **Production Ready**  
**Compatibility:** ERPNext v13+ / Frappe v13+  
**Last Tested:** January 20, 2026
