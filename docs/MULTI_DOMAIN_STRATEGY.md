# Multi-Domain Strategy: Restaurant vs Retail/Service

## Overview

IMOGI POS designed to support **multiple business domains** with single codebase:
- **Restaurant**: Full menu channel filtering, KOT, table management
- **Retail**: SKU-focused, no channel filtering needed
- **Service**: Appointment-based, simplified catalog

## Architecture Principle

**"Frontend sends, Backend decides"**

- Frontend **always sends** `menu_channel="Cashier"` (or appropriate channel)
- Backend **decides** whether to apply channel filter based on:
  1. POS Profile domain setting (`imogi_pos_domain`)
  2. Restaurant Settings (`enable_menu_channels`)
  3. Custom Field existence (`imogi_menu_channel`)

---

## Implementation Details

### 1. Backend Logic ([imogi_pos/api/variants.py](../imogi_pos/api/variants.py#L735))

```python
def get_template_items(pos_profile=None, item_group=None, menu_channel=None, limit=500):
    # ... filters setup ...
    
    # Early return: skip domain check if no channel requested (optimization)
    if not menu_channel:
        return items
    
    # Check domain ONCE (not per item)
    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain") or "Restaurant"
    should_filter_channel = (domain == "Restaurant")
    
    # Filter only if Restaurant domain
    if should_filter_channel and has_channel_field:
        items = [
            item for item in items
            if _channel_matches(item.get("imogi_menu_channel"), menu_channel)
        ]
    elif not should_filter_channel:
        frappe.logger().info(
            f"menu_channel requested but domain is '{domain}' (not Restaurant). "
            f"Skipping channel filter - returning all {len(items)} items."
        )
    
    return items
```

**Key features**:
- ✅ **Graceful degradation**: Missing custom field → skip filter, log warning
- ✅ **Performance**: Domain check once, not per item
- ✅ **Debug info**: Logs when filtering skipped or returns zero items

---

### 2. Channel Matching Logic ([imogi_pos/api/items.py](../imogi_pos/api/items.py#L44))

```python
def _channel_matches(entry_channel, requested_channel):
    """Pure function - no DB calls."""
    settings = get_restaurant_settings()
    
    # CRITICAL: If menu channels disabled globally, accept all
    if not settings.get("enable_menu_channels"):
        return True
    
    requested = _normalise_channel(requested_channel)
    if not requested or requested in CHANNEL_ALL:
        return True
    
    entry = _normalise_channel(entry_channel)
    if entry in CHANNEL_ALL:  # e.g., "All", "all", "ALL"
        return True
    
    return entry == requested
```

**Constants**:
```python
CHANNEL_ALL = {"all", ""}  # Case-insensitive
```

---

### 3. Frontend - Always Send Channel ([src/shared/hooks/useCatalog.js](../src/shared/hooks/useCatalog.js))

```javascript
// Cashier Console
const { data, isLoading } = useFrappeGetCall(
  'imogi_pos.api.variants.get_template_items',
  {
    pos_profile: posProfile?.name,
    item_group: selectedGroup,
    menu_channel: "Cashier",  // <-- Always send
    limit: 500
  }
)
```

**Why always send?**
- Keeps frontend simple (no domain branching)
- Backend handles complexity
- Single API contract for all domains

---

## Configuration Matrix

| Domain     | `enable_menu_channels` | `imogi_menu_channel` Field | Behavior                          |
|------------|------------------------|----------------------------|-----------------------------------|
| Restaurant | 1 (enabled)            | ✅ Exists                  | **Filter by channel** (Cashier/Kiosk/etc.) |
| Restaurant | 0 (disabled)           | ✅ Exists                  | **Skip filter** (return all)      |
| Retail     | 0 (default)            | ❌ Not exists              | **Skip filter** (return all)      |
| Service    | 0 (default)            | ❌ Not exists              | **Skip filter** (return all)      |
| Restaurant | 1 (enabled)            | ❌ Not exists              | **Skip filter** + log warning     |

---

## Setup Guide

### For Restaurant Domain

1. **Enable domain in POS Profile**:
   ```
   POS Profile → imogi_pos_domain = "Restaurant"
   ```

2. **Enable menu channels globally** (optional):
   ```
   Restaurant Settings → enable_menu_channels = 1
   ```

3. **Create Custom Field** (if not exists):
   ```python
   # Custom Field: imogi_menu_channel
   # DocType: Item
   # Fieldtype: Select
   # Options: Cashier\nKiosk\nSelf Order\nAll
   # Default: All
   ```

4. **Set channel on items**:
   ```
   Item → imogi_menu_channel = "Cashier" (or "All" for all channels)
   ```

### For Retail/Service Domain

1. **Set domain in POS Profile**:
   ```
   POS Profile → imogi_pos_domain = "Retail"  (or "Service")
   ```

2. **Do NOT create `imogi_menu_channel` field** - not needed

3. **Items automatically available in all channels** - no filtering applied

---

## Item Group vs Menu Category

### Item Group (ERPNext Standard)
- **Purpose**: Tree hierarchy for inventory classification
- **Used for**: Stock reporting, pricing rules, permissions
- **Scope**: All domains (Restaurant, Retail, Manufacturing, etc.)
- **Filter support**: ✅ Works in all domains

### Menu Category (Custom Restaurant Field)
- **Purpose**: User-facing menu grouping (e.g., "Coffee", "Breakfast")
- **Used for**: POS catalog UI, menu boards
- **Scope**: Restaurant domain only
- **Filter support**: ⚠️ Optional (can use Item Group instead)

**Recommendation**:
- **Primary filter**: Use **Item Group** (universal, works everywhere)
- **Secondary display**: Use **Menu Category** for restaurant-specific UX

---

## Migration Path

### From Restaurant-only to Multi-domain

**Before** (Restaurant-only):
```python
# Hard-coded channel filtering
items = frappe.get_all("Item", filters={
    "imogi_menu_channel": menu_channel  # ❌ Breaks on non-Restaurant
})
```

**After** (Multi-domain):
```python
# Domain-aware filtering
domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
if domain == "Restaurant" and has_channel_field:
    items = [i for i in items if _channel_matches(i.get("imogi_menu_channel"), menu_channel)]
else:
    # Skip filter for Retail/Service
    pass
```

### From Item Group-only to Restaurant+Channels

1. **Keep existing Item Group filters** (don't remove!)
2. **Add `imogi_menu_channel` custom field** (Restaurant only)
3. **Backend auto-detects** field existence
4. **No frontend changes needed** - already sends `menu_channel`

---

## Testing Scenarios

### Scenario 1: Restaurant with Channels Enabled
```bash
# Setup
POS Profile → imogi_pos_domain = "Restaurant"
Restaurant Settings → enable_menu_channels = 1
Item "Espresso" → imogi_menu_channel = "Cashier"
Item "Smoothie" → imogi_menu_channel = "Kiosk"

# Request
GET /api/method/imogi_pos.api.variants.get_template_items
  ?menu_channel=Cashier

# Expected
Returns: ["Espresso"]  (Smoothie filtered out)
```

### Scenario 2: Retail (No Channel Field)
```bash
# Setup
POS Profile → imogi_pos_domain = "Retail"
Item "T-Shirt" → (no imogi_menu_channel field exists)
Item "Jeans" → (no imogi_menu_channel field exists)

# Request
GET /api/method/imogi_pos.api.variants.get_template_items
  ?menu_channel=Cashier  # Frontend still sends it!

# Expected
Returns: ["T-Shirt", "Jeans"]  (all items, channel param ignored)
Log: "domain is 'Retail' (not Restaurant). Skipping channel filter"
```

### Scenario 3: Restaurant with Channels Disabled
```bash
# Setup
POS Profile → imogi_pos_domain = "Restaurant"
Restaurant Settings → enable_menu_channels = 0  # <-- Disabled!
Item "Pizza" → imogi_menu_channel = "Cashier"
Item "Burger" → imogi_menu_channel = "Kiosk"

# Request
GET /api/method/imogi_pos.api.variants.get_template_items
  ?menu_channel=Cashier

# Expected
Returns: ["Pizza", "Burger"]  (all items, setting overrides domain)
```

---

## Performance Considerations

### Optimization 1: Early Return
```python
# Skip domain check if no channel requested
if not menu_channel:
    return items  # No DB query for domain
```

**Benefit**: Retail/Service installations skip unnecessary checks

### Optimization 2: Single Domain Query
```python
# Check domain ONCE before loop
domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")

# NOT like this (❌ queries inside loop):
for item in items:
    domain = frappe.db.get_value(...)  # ❌ N queries!
```

**Benefit**: O(1) vs O(n) database calls

### Optimization 3: Field Existence Check
```python
item_meta = frappe.get_meta("Item")
has_channel_field = item_meta.has_field("imogi_menu_channel")

# If field doesn't exist, skip filtering entirely
if not has_channel_field:
    return items  # No filtering loop needed
```

**Benefit**: Graceful degradation without errors

---

## Debug Checklist

When catalog returns zero items:

1. **Check domain**:
   ```python
   frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
   # Should return: "Restaurant" | "Retail" | "Service" | None
   ```

2. **Check setting**:
   ```python
   settings = frappe.get_cached_doc("Restaurant Settings", "Restaurant Settings")
   settings.enable_menu_channels  # Should be 1 for Restaurant, 0 for others
   ```

3. **Check field**:
   ```python
   frappe.get_meta("Item").has_field("imogi_menu_channel")
   # Should return True if custom field created
   ```

4. **Check item data**:
   ```python
   frappe.get_all("Item", 
       fields=["name", "imogi_menu_channel"], 
       limit=10)
   # Check what channel values exist
   ```

5. **Check filter logic**:
   ```python
   from imogi_pos.api.items import _channel_matches
   
   # Test matching logic
   _channel_matches("Cashier", "Cashier")  # → True
   _channel_matches("Cashier", "Kiosk")    # → False
   _channel_matches("All", "Cashier")      # → True
   _channel_matches(None, "Cashier")       # → depends on enable_menu_channels
   ```

---

## Future Extensions

### Adding New Domain: "Pharmacy"

```python
# 1. Add to POS Profile options
POS Profile → imogi_pos_domain: ["Restaurant", "Retail", "Service", "Pharmacy"]

# 2. Add domain-specific logic (if needed)
if domain == "Pharmacy":
    # Filter by prescription requirement, controlled substance, etc.
    items = [i for i in items if not i.get("requires_prescription")]

# 3. Frontend unchanged - still sends menu_channel
# Backend decides whether to use it
```

### Adding New Channel: "Drive-Thru"

```python
# 1. Add to Item custom field options
imogi_menu_channel: "Cashier\nKiosk\nSelf Order\nDrive-Thru\nAll"

# 2. Backend auto-handles via _channel_matches()
# No code changes needed!

# 3. Frontend sends new channel
menu_channel: "Drive-Thru"
```

---

## Summary

✅ **Current implementation is future-proof**:
- Single codebase for all domains
- Backend intelligently filters based on domain
- Frontend stays simple (no branching)
- Graceful degradation if fields missing
- Performance optimized (minimal DB queries)

❌ **What NOT to do**:
- Don't create domain-specific frontend apps
- Don't hard-code channel filters in queries
- Don't assume custom fields exist
- Don't check domain in frontend (let backend handle)

**Philosophy**: "Be liberal in what you accept, conservative in what you send"
- Frontend: Send all available context (channel, group, etc.)
- Backend: Use what's relevant for the domain, ignore the rest
