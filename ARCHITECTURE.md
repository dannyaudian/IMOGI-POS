# IMOGI POS - Native-First Architecture (Fresh Deploy)

## ✅ Changes Applied

This is a **fresh deployment** optimized for native ERPNext v15+ features.

### Removed (Deprecated Custom DocTypes)
- ❌ Item Size Option
- ❌ Item Spice Option  
- ❌ Item Topping Option
- ❌ Item Variant Option
- ❌ Item Option Component
- ❌ Item Option Component Delta

### Removed (Documentation & Migration Tools)
- ❌ Migration utilities (`imogi_pos/utils/migration/`)
- ❌ Migration documentation files
- ❌ Legacy test files

### Added (Native ERPNext Helpers)
- ✅ `imogi_pos/utils/native_helpers/variant_builder.py` - Create & manage Item Variants
- ✅ `imogi_pos/utils/native_helpers/bom_builder.py` - Create & manage BOMs
- ✅ `imogi_pos/utils/native_helpers/bundle_builder.py` - Create & manage Product Bundles

### Modified (API Layer)
- ✅ `imogi_pos/api/items.py` - Now uses native Item Variants by default
- ✅ `imogi_pos/api/billing.py` - Simplified customization processing
- ✅ Feature flag: `USE_NATIVE_VARIANTS = True`

---

## 🚀 Quick Start

### 1. Create Item with Variants

```python
from imogi_pos.utils.native_helpers import *

# Create attributes (one-time setup)
ensure_attribute_exists("Size", ["Small", "Medium", "Large"])
ensure_attribute_exists("Spice Level", ["Mild", "Hot", "Extra Hot"])

# Create template
template = create_item_template(
    item_code="PIZZA-001",
    item_name="Pizza Margherita",
    attributes=["Size", "Spice Level"],
    standard_rate=50000
)

# Create variant
variant = create_item_variant(
    template="PIZZA-001",
    attributes={"Size": "Large", "Spice Level": "Hot"},
    standard_rate=65000
)
```

### 2. Create BOM (Bill of Materials)

```python
# Create recipe for your item
bom = create_bom(
    item="PIZZA-001-LARGE-HOT",
    items=[
        {"item_code": "DOUGH", "qty": 0.5},
        {"item_code": "CHEESE", "qty": 0.25},
        {"item_code": "TOMATO-SAUCE", "qty": 0.15}
    ]
)
```

### 3. Create Product Bundle (Combos)

```python
# Create combo meal
bundle = create_product_bundle(
    parent_item="COMBO-MEAL-001",
    items=[
        {"item_code": "PIZZA-001-MEDIUM-MILD", "qty": 1},
        {"item_code": "SOFT-DRINK", "qty": 1}
    ]
)
```

---

## 📊 Architecture Benefits

| Feature | Implementation |
|---------|---------------|
| **Variants** | Native `Item Variant` + `Item Attribute` |
| **Recipes** | Native `BOM` (Bill of Materials) |
| **Combos** | Native `Product Bundle` |
| **Stock** | Automatic tracking via ERPNext |
| **Pricing** | Native `Item Price` lists |
| **Reports** | Standard ERPNext reports |

---

## 🔧 API Usage

### Get Item Variants
```python
from imogi_pos.api.variants import get_item_variants

result = get_item_variants(item_template="PIZZA-001")
variants = result["variants"]
```

### Get Item Options (Native)
```python
from imogi_pos.api.items import get_item_options_native

options = get_item_options_native("PIZZA-001")
# Returns options grouped by attribute (size, spice_level, etc.)
```

### Frontend (JavaScript)
```javascript
// Load variants
const response = await frappe.call({
    method: 'imogi_pos.api.variants.get_item_variants',
    args: { item_template: 'PIZZA-001' }
});

const variants = response.message.variants;
```

---

## 📁 File Structure

```
imogi_pos/
├── api/
│   ├── items.py          # Native variant support
│   ├── variants.py       # Variant operations
│   └── billing.py        # Simplified customizations
│
├── utils/
│   └── native_helpers/   # Helper functions for native features
│       ├── variant_builder.py
│       ├── bom_builder.py
│       └── bundle_builder.py
│
└── imogi_pos/
    └── doctype/          # Only essential custom DocTypes remain
```

---

## 🎯 Key Points

1. **No Migration Needed** - This is a fresh deploy using native features
2. **Minimal Custom Code** - Leverage ERPNext built-in functionality
3. **Scalable** - Standard ERPNext architecture
4. **Easy Upgrades** - Less custom code = smoother updates

---

## 📚 Documentation

- [README.md](README.md) - Main documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [CHANGELOG.md](CHANGELOG.md) - Version history

For ERPNext native features:
- [Item Variants](https://docs.erpnext.com/docs/v15/user/manual/en/stock/item-variants)
- [BOM](https://docs.erpnext.com/docs/v15/user/manual/en/manufacturing/bill-of-materials)
- [Product Bundle](https://docs.erpnext.com/docs/v15/user/manual/en/selling/product-bundle)

---

**Version:** 2.0 - Native-First Architecture  
**Last Updated:** January 18, 2026  
**Deployment Type:** Fresh Install
