# Native Pricing Frontend Integration Guide

## 🎯 Overview

Frontend IMOGI-POS sekarang **fully integrated** dengan Native ERPNext Pricing Rules. Semua aplikasi frontend akan otomatis mendeteksi dan menampilkan pricing rules yang aktif.

## ✅ Fitur yang Sudah Ditambahkan

### **1. Auto-Check Pricing Rules**
- ✅ **Automatic Detection**: Pricing rules dicek otomatis saat cart berubah
- ✅ **Visual Indicators**: Badge dan alert muncul otomatis jika ada promo aktif
- ✅ **Real-time Updates**: Pricing rules di-update setiap kali item ditambah/dikurangi

### **2. Native Coupon Code Support**
- ✅ **Native-First Approach**: Try native coupon codes first
- ✅ **Fallback Mechanism**: Jika native gagal, gunakan custom promo code
- ✅ **Unified Interface**: User experience tetap sama

### **3. Visual Feedback**
- ✅ **Pricing Rule Indicator**: Alert hijau menampilkan promo aktif
- ✅ **Discount Amount**: Total discount ditampilkan dengan jelas
- ✅ **Free Items Counter**: Jumlah free items dari Buy X Get Y

## 🚀 Aplikasi yang Sudah Terintegrasi

### **Kiosk** (`/imogi_pos/www/kiosk/index.js`)
```javascript
// ✅ Auto-check pricing rules saat cart update
updateCartTotals: function() {
    // ... existing code ...
    
    // Native pricing check
    if (this.cart.length > 0) {
        this.checkNativePricingRules();
    }
}

// ✅ Native coupon validation
applyPromoCode: async function() {
    // Try native coupon first
    let nativeCoupon = await this.applyNativeCouponCode(rawCode);
    
    if (nativeCoupon) {
        // Use native pricing
    } else {
        // Fallback to custom promo
    }
}
```

**Features:**
- ✅ Auto-detect pricing rules for all cart items
- ✅ Show promotion indicator with discount amount
- ✅ Display free items count
- ✅ Native coupon code validation
- ✅ Fallback to custom promo codes

---

### **Create Order / Waiter App** (`/imogi_pos/www/create-order/index.js`)
```javascript
// ✅ Same integration as Kiosk
updateCartTotals: function() {
    // ... existing code ...
    
    // Native pricing check
    if (this.cart.length > 0) {
        this.checkNativePricingRules();
    }
}

// ✅ Native coupon for table orders
handleApplyPromo: async function() {
    let nativeCoupon = await this.applyNativeCouponCode(rawCode);
    // ... handle result ...
}
```

**Features:**
- ✅ Same as Kiosk
- ✅ Works with table orders
- ✅ Customer-specific pricing rules
- ✅ Price list support

---

### **Self Order (SO)** (`/imogi_pos/www/so/index.js`)
**Status:** ✅ Passive Integration
- Backend automatically applies pricing rules
- No frontend changes needed
- Orders created with native pricing already applied

---

### **Cashier Console** (`/imogi_pos/www/cashier-console/index.js`)
**Status:** ✅ Display Only
- Shows discounts calculated by backend
- No pricing logic needed
- Read-only interface

---

## 📋 New Methods Added

### **1. `checkNativePricingRules()`**
Automatically check applicable pricing rules for cart items.

```javascript
checkNativePricingRules: async function() {
    const response = await frappe.call({
        method: 'imogi_pos.api.native_pricing.apply_pricing_rules_to_items',
        args: {
            items: this.cart,
            customer: this.customer,
            price_list: this.priceList,
            pos_profile: this.posProfile
        }
    });
    
    if (response.message.has_pricing_rules) {
        this.showPricingRuleIndicator(response.message);
    }
}
```

**When Called:**
- ✅ On cart update (add/remove/change quantity)
- ✅ On customer change
- ✅ On price list change
- ✅ Automatically in background

---

### **2. `applyNativeCouponCode(couponCode)`**
Validate native ERPNext coupon codes.

```javascript
applyNativeCouponCode: async function(couponCode) {
    const response = await frappe.call({
        method: 'imogi_pos.api.native_pricing.validate_coupon_code',
        args: {
            coupon_code: couponCode,
            customer: this.customer
        }
    });
    
    if (response.message.valid) {
        return {
            code: couponCode,
            type: 'native_coupon',
            pricing_rule: response.message.pricing_rule,
            discount_percentage: response.message.discount_percentage
        };
    }
    return null;
}
```

**Use Case:**
- ✅ User enters coupon code
- ✅ Check if it's native ERPNext coupon
- ✅ If not, fallback to custom promo code

---

### **3. `showPricingRuleIndicator(pricingResult)`**
Display visual indicator for active promotions.

```javascript
showPricingRuleIndicator: function(pricingResult) {
    let indicator = document.querySelector('.pricing-rules-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'pricing-rules-indicator alert alert-success';
        // Insert at top of cart
    }
    
    let message = '🎁 ' + __('Active Promotions:');
    if (pricingResult.total_discount_amount > 0) {
        message += ' Discount ' + format_currency(pricingResult.total_discount_amount);
    }
    if (pricingResult.free_items.length > 0) {
        message += ' | Free Items: ' + pricingResult.free_items.length;
    }
    
    indicator.innerHTML = message;
    indicator.style.display = 'block';
}
```

**Result:**
```html
<div class="pricing-rules-indicator alert alert-success">
    🎁 Active Promotions: Discount Rp 50,000 | Free Items: 2
</div>
```

---

## 🎨 UI/UX Enhancements

### **Before (Without Native Integration)**
```
[Cart Items]
Subtotal: Rp 200,000
Tax (11%): Rp 22,000
Total: Rp 222,000

[Promo Code Input]
```

### **After (With Native Integration)**
```
🎁 Active Promotions: Happy Hour 20% Discount | Free Items: 1

[Cart Items]
- Coffee Latte x2 @ Rp 45,000 (was Rp 50,000) ✨
- Burger Cheese x1 FREE 🎁

Subtotal: Rp 200,000
Discount: -Rp 40,000
Tax (11%): Rp 17,600
Total: Rp 177,600

[Promo Code Input] ← Also accepts native coupon codes
```

---

## 🔄 Flow Diagram

### **Native-First Approach**

```
User adds item to cart
    ↓
updateCartTotals() called
    ↓
checkNativePricingRules()
    ↓
API: imogi_pos.api.native_pricing.apply_pricing_rules_to_items
    ↓
Has pricing rules? ←─ YES → Show indicator + Apply discount
    ↓
   NO
    ↓
Continue with normal flow
```

### **Coupon Code Flow**

```
User enters coupon code
    ↓
applyNativeCouponCode()
    ↓
API: imogi_pos.api.native_pricing.validate_coupon_code
    ↓
Valid native coupon? ←─ YES → Apply native discount
    ↓
   NO
    ↓
Fallback to custom promo code
    ↓
API: imogi_pos.api.pricing.validate_promo_code
```

---

## 🧪 Testing

### **Test Scenario 1: Auto Pricing Rules**

1. Setup pricing rule di ERPNext:
   ```
   Title: Happy Hour 20% Off
   Apply On: Item Group = Beverages
   Discount: 20%
   Valid: 14:00 - 17:00
   ```

2. Open Kiosk/Create Order
3. Add beverage item (e.g., Coffee)
4. **Expected Result:**
   - ✅ Green indicator appears: "🎁 Active Promotions: Discount Rp X"
   - ✅ Item shows discounted price
   - ✅ Cart total reflects discount

---

### **Test Scenario 2: Native Coupon Code**

1. Create coupon code di ERPNext:
   ```
   Coupon Code: NEWYEAR2026
   Linked Pricing Rule: 15% Off All Items
   Max Use: 100
   Valid Until: 2026-01-31
   ```

2. Open Kiosk/Create Order
3. Add items to cart
4. Enter coupon code: `NEWYEAR2026`
5. **Expected Result:**
   - ✅ Coupon validated successfully
   - ✅ 15% discount applied
   - ✅ Indicator shows: "🎁 Coupon: NEWYEAR2026 - 15% Off"

---

### **Test Scenario 3: Buy X Get Y**

1. Setup promotional scheme:
   ```
   Buy 2 Burgers → Get 1 Free
   Apply On: Item Code = BURGER-CHEESE
   ```

2. Add 2 Burgers to cart
3. **Expected Result:**
   - ✅ 3rd Burger automatically added as FREE
   - ✅ Indicator shows: "🎁 Free Items: 1"
   - ✅ Total only charges for 2 burgers

---

## 📊 Performance

### **API Calls Optimization**

- ✅ **Debouncing**: Pricing check only runs once per cart update
- ✅ **Caching**: Results cached during single session
- ✅ **Async**: Non-blocking, UI remains responsive
- ✅ **Error Handling**: Graceful fallback if API fails

```javascript
// Prevents multiple simultaneous calls
if (!this._checkingPricingRules) {
    this._checkingPricingRules = true;
    this.checkNativePricingRules().finally(() => {
        this._checkingPricingRules = false;
    });
}
```

---

## 🐛 Troubleshooting

### **Issue: Pricing indicator tidak muncul**

**Solutions:**
1. Cek console untuk errors
2. Verify pricing rule status di ERPNext (Enabled?)
3. Cek valid date range
4. Cek applicable items/customer groups

### **Issue: Coupon code tidak valid**

**Solutions:**
1. Verify coupon exists di ERPNext
2. Cek maximum use limit
3. Cek expiry date
4. Cek customer eligibility

### **Issue: Discount tidak apply**

**Solutions:**
1. Cek backend logs: `bench --site [site] logs`
2. Verify `ignore_pricing_rule = 0` di invoice builder
3. Test dengan simple pricing rule dulu
4. Cek item eligibility

---

## 🎯 Next Steps

### **Future Enhancements**

1. **Real-time Notifications**
   - Push notifications untuk new promotions
   - Alert untuk expiring coupons

2. **Personalized Recommendations**
   - Show recommended items with active discounts
   - "You might also like" dengan promo

3. **Analytics Dashboard**
   - Track most used pricing rules
   - Customer usage patterns
   - Revenue impact analysis

4. **Advanced UI**
   - Badge per item showing discount
   - Countdown timer untuk time-based promos
   - Animation untuk free items

---

## 📚 API Documentation

### **Backend APIs Used**

1. **`imogi_pos.api.native_pricing.apply_pricing_rules_to_items`**
   - Apply pricing rules to list of items
   - Returns: discount amounts, free items, total discount

2. **`imogi_pos.api.native_pricing.validate_coupon_code`**
   - Validate native coupon code
   - Returns: pricing rule, discount type, validity

3. **`imogi_pos.api.native_pricing.get_applicable_pricing_rules`**
   - Get pricing rules for specific item
   - Returns: rule details, discount info

4. **`imogi_pos.api.orders.create_order`**
   - Create order with native pricing applied
   - Backend automatically applies rules

---

## 📞 Support

**Documentation:**
- Main: [NATIVE_INTEGRATION.md](NATIVE_INTEGRATION.md)
- Backend: [imogi_pos/api/native_pricing.py](imogi_pos/api/native_pricing.py)
- Frontend: This file

**Testing:**
```bash
# Test backend pricing
bench --site [site-name] console

>>> from imogi_pos.api.native_pricing import apply_pricing_rules_to_items
>>> result = apply_pricing_rules_to_items(
...     items=[{'item_code': 'COFFEE', 'qty': 2}],
...     customer='CUST-001'
... )
>>> print(result)
```

---

## ✅ Implementation Checklist

- [x] Backend native pricing module
- [x] Backend API endpoints
- [x] Invoice builder integration
- [x] Kiosk auto-check pricing rules
- [x] Kiosk native coupon support
- [x] Kiosk visual indicators
- [x] Create Order auto-check pricing rules
- [x] Create Order native coupon support
- [x] Create Order visual indicators
- [x] Error handling & fallback
- [x] Performance optimization
- [x] Documentation

**Status: 100% Complete** ✅

---

**Last Updated:** January 21, 2026  
**Version:** 1.0.0  
**Status:** Production Ready
