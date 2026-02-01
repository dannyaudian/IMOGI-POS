# Restaurant Floor SQL Injection Fix

## Problem Summary

**Error:** MariaDB 1064 - SQL Syntax Error
```
Error updating floor tables: (1064, "You have an error in your SQL syntax ... near '[{'name': None, ... }]' at line 1")
```

**Root Cause:** 
`frappe.db.set_value()` dipanggil dengan list/dict sebagai value untuk child table field. Ini membuat SQL query yang invalid karena list Python langsung di-inject ke SQL string.

## Location

**File:** [imogi_pos/imogi_pos/doctype/restaurant_floor/restaurant_floor.py](imogi_pos/imogi_pos/doctype/restaurant_floor/restaurant_floor.py#L59-L68)

**Function:** `update_tables_list()`

## BEFORE (Buggy Code)

```python
def update_tables_list(self):
    """Update the tables table with current linked tables"""
    # Clear existing tables
    self.tables = []
    
    # Get all tables linked to this floor
    tables = frappe.get_all(
        "Restaurant Table", 
        filters={"floor": self.name},
        fields=["name", "table_number", "status", "current_pos_order"]
    )
    
    # Add them to the tables table
    for table in tables:
        self.append("tables", {
            "table": table.name,
            "table_number": table.table_number,
            "status": table.status,
            "current_pos_order": table.current_pos_order
        })

    # ❌ BUG: set_value tidak bisa handle list/dict untuk child table
    if tables:
        table_data = [row.as_dict() for row in self.tables]
        frappe.db.set_value(
            "Restaurant Floor",
            self.name,
            "tables",
            table_data,  # ⚠️ List of dict masuk ke SQL query string
            update_modified=False,
        )
```

### Why This Failed

`frappe.db.set_value()` mengkonstruksi SQL query:

```sql
UPDATE `tabRestaurant Floor` 
SET tables = '[{\'name\': \'TBL-001\', ...}]'
WHERE name = 'Floor 1'
```

MariaDB melihat `[{` dan gagal parse → **Error 1064**

## AFTER (Fixed Code)

```python
def update_tables_list(self):
    """Update the tables table with current linked tables"""
    # Prevent infinite loop - set flag before save
    if self.flags.get("updating_tables_list"):
        return
    
    self.flags.updating_tables_list = True
    
    try:
        # Clear existing tables
        self.tables = []
        
        # Get all tables linked to this floor
        tables = frappe.get_all(
            "Restaurant Table", 
            filters={"floor": self.name},
            fields=["name", "table_number", "status", "current_pos_order"]
        )
        
        # Add them to the tables table
        for table in tables:
            self.append("tables", {
                "table": table.name,
                "table_number": table.table_number,
                "status": table.status,
                "current_pos_order": table.current_pos_order
            })

        # ✅ FIX: Use Frappe ORM to properly save child table
        # This is the safest way - ORM handles idx, audit fields, hooks, etc.
        self.flags.ignore_validate_update_after_submit = True
        self.save(ignore_permissions=True)
    finally:
        # Always clear flag after operation
        self.flags.updating_tables_list = False
```

### Also Fixed: Prevent Infinite Loop

```python
def on_update(self):
    """Update tables list after update"""
    # Skip if this update is triggered by update_tables_list() itself
    if not self.flags.get("updating_tables_list"):
        self.update_tables_list()
```

## Why This Works

1. **Frappe ORM** (`doc.save()`): Handles child tables dengan benar - tidak ada list/dict masuk ke SQL string
2. **Flag Protection**: Prevent infinite loop karena `save()` trigger `on_update()` yang memanggil `update_tables_list()` lagi
3. **Try-Finally**: Memastikan flag selalu di-clear even jika ada error
4. **Standard Approach**: Sesuai Frappe best practice untuk update child tables

## Alternative Solutions (Kalau Mau Lebih Simple)

### Option A: Current Solution (RECOMMENDED) ✅

```python
def update_tables_list(self):
    """Update the tables table with current linked tables"""
    # Prevent infinite loop
    if self.flags.get("updating_tables_list"):
        return
    
    self.flags.updating_tables_list = True
    
    try:
        self.tables = []
        tables = frappe.get_all(
            "Restaurant Table", 
            filters={"floor": self.name},
            fields=["name", "table_number", "status", "current_pos_order"]
        )
        
        for table in tables:
            self.append("tables", {
                "table": table.name,
                "table_number": table.table_number,
                "status": table.status,
                "current_pos_order": table.current_pos_order
            })

        self.flags.ignore_validate_update_after_submit = True
        self.save(ignore_permissions=True)
    finally:
        self.flags.updating_tables_list = False
```

**Pro:** Paling aman, sesuai Frappe best practice, ORM handle everything  
**Con:** Perlu flag protection untuk prevent infinite loop

### Option B: Frappe Query Builder (Modern)

```python
from frappe.query_builder import DocType

def update_tables_list(self):
    """Update the tables table with current linked tables"""
    FloorTable = DocType("Restaurant Floor Table")
    
    # Delete existing
    frappe.qb.from_(FloorTable).delete().where(
        FloorTable.parent == self.name
    ).run()
    
    # Get tables
    tables = frappe.get_all(
        "Restaurant Table", 
        filters={"floor": self.name},
        fields=["name", "table_number", "status", "current_pos_order"]
    )
    
    # Insert new records
    for idx, table in enumerate(tables, start=1):
        frappe.qb.into(FloorTable).insert(
            frappe.generate_hash(length=10),  # name
            frappe.utils.now(),  # creation
            frappe.utils.now(),  # modified
            frappe.session.user,  # modified_by
            frappe.session.user,  # owner
            0,  # docstatus
            self.name,  # parent
            "Restaurant Floor",  # parenttype
            "tables",  # parentfield
            idx,  # idx
            table.name,  # table
            table.table_number,  # table_number
            table.status,  # status
            table.current_pos_order  # current_pos_order
        ).run()
```

**Pro:** Type-safe, modern approach  
**Con:** Lebih verbose

## Deployment Checklist

- [x] Fix kode di `restaurant_floor.py`
- [x] Buat patch file: `imogi_pos/patches/fix_restaurant_floor_table_update.py`
- [x] Register patch di `imogi_pos/patches.txt`
- [x] Buat test: `tests/test_restaurant_floor_sql_fix.py`
- [ ] Run test: `bench run-tests --app imogi_pos --test test_restaurant_floor_sql_fix`
- [ ] Deploy to production
- [ ] Run patch: `bench migrate`
- [ ] Verify Error Log (tidak ada error 1064 lagi)

## Testing

```bash
# Run specific test
bench run-tests --app imogi_pos --test test_restaurant_floor_sql_fix

# Check production logs
bench console
>>> frappe.get_all("Error Log", 
...     filters={"error": ["like", "%1064%"]}, 
...     fields=["name", "creation", "error"], 
...     limit=5)
```

## Related Files

- **Fixed:** [imogi_pos/imogi_pos/doctype/restaurant_floor/restaurant_floor.py](imogi_pos/imogi_pos/doctype/restaurant_floor/restaurant_floor.py)
- **Patch:** [imogi_pos/patches/fix_restaurant_floor_table_update.py](imogi_pos/patches/fix_restaurant_floor_table_update.py)
- **Test:** [tests/test_restaurant_floor_sql_fix.py](tests/test_restaurant_floor_sql_fix.py)
- **Patch Registry:** [imogi_pos/patches.txt](imogi_pos/patches.txt)

## Prevention

**Untuk mencegah error serupa:**

1. **JANGAN** pakai `frappe.db.set_value()` untuk child table (list/dict)
2. **SELALU** pakai parameter binding: `%(param)s` untuk SQL query
3. **HINDARI** f-string atau `.format()` untuk membangun SQL
4. **GUNAKAN** `doc.save()` atau parameterized `frappe.db.sql()` untuk child tables
5. **TEST** dengan data real sebelum deploy

## References

- [Frappe Documentation: Database API](https://frappeframework.com/docs/user/en/api/database)
- [MariaDB Error 1064](https://mariadb.com/kb/en/mariadb-error-codes/)
- Original prompt/solution dari user
